// ============================================================================
// 🗄️ مدير البيانات (adminData.js) - بنية ES Modules نقية 100% ☁️
// 🎯 الوظيفة: إدارة حالة البيانات، الحسابات المركزية (SSOT)، وتوفير الفلاتر الذكية
// 🌟 التحديث: محرك Smart Diffing للاتصال بـ Firebase Firestore بتكلفة شبه صفرية
// ============================================================================

import { DB_KEYS, normalizeRates } from './adminConfig.js';
import { Utils } from './adminUtils.js'; 
import { FirebaseAdapter } from './core/firebaseAdapter.js';

export const AdminData = {
    // 🌟 راية الأمان (Data Loss Firewall): تمنع مسح السحابة بالخطأ
    isCloudSyncSuccessful: false,

    // ==========================================
    // 📂 المتغيرات وحالة البيانات الأساسية
    // ==========================================
    data: { 
        deposits: [], orders: [], users: [], cats: [], prods: [], payments: [], banners: [], 
        settings: {}, rates: [], notif: {}, system: {}, adminProfile: {}, tiers: [], 
        countries: [], vault: [], coupons: [], offers: [], logs: [], 
        alerts: [], kyc: [] 
    },
    
    filters: {
        deposits: { search: '', start: null, end: null },
        orders: { search: '', start: null, end: null }
    },

    // 📸 الذاكرة التصويرية لمحرك المقارنة الذكي (Smart Diffing Snapshot)
    _snapshots: {},

    _updateSnapshot: function(prop) {
        this._snapshots[prop] = JSON.parse(JSON.stringify(this.data[prop]));
    },

        // ==========================================
    // 🛠️ 1. دالة التهيئة وجلب البيانات من السحابة (مسرّعة بـ Promise.all)
    // ==========================================
    loadData: async function() {
        console.log("☁️ جاري مزامنة بيانات لوحة الإدارة مع Firestore...");
        
        // إغلاق صمام الأمان عند بدء الجلب
        this.isCloudSyncSuccessful = false;
        
        const arr = v => Array.isArray(v) ? v : [];
        const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
        
        const fetchArray = async (key, fallback = []) => {
            const res = await FirebaseAdapter.getAll(key);
            return (res && res.length > 0) ? res : fallback;
        };

        const fetchSingleton = async (key, fallback = {}) => {
            const res = await FirebaseAdapter.getById(key, 'singleton');
            return res ? res : fallback;
        };

        // 🚀 الحل الاحترافي: جلب كافة البيانات في نفس اللحظة (Parallel Execution) للقضاء على التأخير
        const [
            rawRates, rawTiers, rawUsers, rawDeposits, rawOrders, rawCats, rawProds, 
            rawPayments, rawBanners, rawSettings, rawNotif, rawSystem, rawAdminProfile,
            rawCountries, rawVault, rawCoupons, rawOffers, rawLogs, rawAlerts, rawKyc
        ] = await Promise.all([
            fetchArray(DB_KEYS.RATES, []),
            fetchArray(DB_KEYS.TIERS, []),
            fetchArray(DB_KEYS.USERS, []),
            fetchArray(DB_KEYS.DEPOSITS, []),
            fetchArray(DB_KEYS.ORDERS, []),
            fetchArray(DB_KEYS.CATS, []),
            fetchArray(DB_KEYS.PRODS, []),
            fetchArray(DB_KEYS.PAYMENTS, []),
            fetchArray(DB_KEYS.BANNERS, []),
            fetchSingleton(DB_KEYS.SETTINGS, { promoText: "", sliderDuration: 3, sliderTransition: "fade", promoAnim: "vertical-normal", supportLink: "", supportIcon: "fa-whatsapp", supportAnimation: "none" }),
            fetchSingleton(DB_KEYS.POPUP, {}),
            fetchSingleton(DB_KEYS.SYSTEM, { maint: false }),
            fetchSingleton(DB_KEYS.ADMIN, { name: "المدير العام", email: "admin@telecard.pro", img: "" }),
            fetchArray(DB_KEYS.COUNTRIES, []),
            fetchArray(DB_KEYS.VAULT, []),
            fetchArray(DB_KEYS.COUPONS, []),
            fetchArray(DB_KEYS.OFFERS, []),
            fetchArray(DB_KEYS.LOGS, []),
            fetchArray(DB_KEYS.ALERTS, []),
            fetchArray(DB_KEYS.KYC, [])
        ]);

        // 🚀 معالجة البيانات وتنقيتها فور وصولها معاً
        const availableRates = normalizeRates(rawRates);
        
        const normalizeCurrencyList = (val) => {
            const allowed = new Set(availableRates.map(c => c.code.toUpperCase()));
            const arrVal = Array.isArray(val) ? val : String(val || '').split(',');
            const out = []; const seen = new Set();
            arrVal.map(c => (c || '').trim().toUpperCase()).forEach(c => {
                if(c && allowed.has(c) && !seen.has(c)) { seen.add(c); out.push(c); }
            });
            return out.length ? out : [];
        };

        this.data.tiers = arr(rawTiers).map(t => {
            const threshold = (t.threshold != null) ? t.threshold : (t.condition_amount != null ? t.condition_amount : 0);
            const autoAdvance = (t.autoAdvance != null) ? t.autoAdvance : (t.is_auto_move != null ? !!t.is_auto_move : false);
            const profit_percent = (t.profit_percent !== undefined && t.profit_percent !== null && !isNaN(t.profit_percent)) ? Number(t.profit_percent) : 5;
            const min_profit_usd = (t.min_profit_usd !== undefined && t.min_profit_usd !== null && !isNaN(t.min_profit_usd)) ? Number(t.min_profit_usd) : 0;
            return { ...t, threshold, autoAdvance, profit_percent, min_profit_usd };
        });

        if(this.data.tiers.length === 0 || !this.data.tiers.some(t => !!t.isDefault)) await this.seedDefaultTiers();
        const defTier = this.data.tiers.find(t => !!t.isDefault) || this.data.tiers[0];

        this.data.users = arr(rawUsers).map(u => {
            const baseCurrency = u.baseCurrency || u.base_currency || 'USD';
            const walletBalance = (u.walletBalance !== undefined && u.walletBalance !== null) ? u.walletBalance : (u.wallet_balance !== undefined && u.wallet_balance !== null) ? u.wallet_balance : (u.balance !== undefined && u.balance !== null ? u.balance : 0);
            const inbox = Array.isArray(u.inbox) ? u.inbox : [];
            const tierCycleSpent = u.tierCycleSpent || 0;
            const tierCycleStartDate = u.tierCycleStartDate || Date.now();
            return { ...u, baseCurrency, base_currency: baseCurrency, walletBalance, wallet_balance: walletBalance, balance: walletBalance, inbox, tierCycleSpent, tierCycleStartDate };
        });

        let changedTierAssign = false;
        if(defTier?.id != null) {
            this.data.users = this.data.users.map(u => {
                if(u.tierId == null || String(u.tierId) === '') { changedTierAssign = true; return { ...u, tierId: defTier.id }; }
                return u;
            });
        }
        
        this.data.deposits = arr(rawDeposits);
        this.data.orders = arr(rawOrders);
        this.data.cats = arr(rawCats);
        this.data.prods = arr(rawProds);
        this.data.payments = arr(rawPayments).map(p => { return { ...p, currencies: normalizeCurrencyList(p.currencies).join(',') }; });
        this.data.banners = arr(rawBanners);
        this.data.settings = obj(rawSettings);
        this.data.rates = availableRates;
        this.data.notif = obj(rawNotif);
        this.data.system = obj(rawSystem);
        this.data.adminProfile = obj(rawAdminProfile);
        // 🌟 ترميم بيانات الدول المجلوبة بذكاء وبدون فرض دولة محددة
        this.data.countries = arr(rawCountries).map(c => {
            return {
                ...c,
                name: c.name || c.nameAr || 'دولة جديدة',
                flag: c.flag || c.flagEmoji || '🌍', 
                currency: c.currency || 'USD',
                dialCode: c.dialCode || '+00',
                code: c.code || c.id || 'XX'
            };
        });
        
        if(this.data.countries.length === 0) await this.seedDefaultCountries();

        this.data.vault = arr(rawVault);
        this.data.coupons = arr(rawCoupons);
        this.data.offers = arr(rawOffers);
        this.data.logs = arr(rawLogs);
        this.data.alerts = arr(rawAlerts);
        this.data.kyc = arr(rawKyc);

        // أخذ لقطة لكل البيانات لتشغيل محرك الـ Smart Diffing
        Object.keys(this.data).forEach(prop => this._updateSnapshot(prop));

        // 🌟 فتح صمام الأمان: السحابة تمت قراءتها بنجاح وبشكل كامل
        this.isCloudSyncSuccessful = true;
        
        // 🌟 الآن الحفظ سيتم بأمان وتتجاوز الجدار الناري بنجاح
        if (changedTierAssign) await this.saveUsers(); 
        await this.calculateAllStoreStats();
        await this.autoAdvanceSweep();
        
        console.log("✅ اكتملت المزامنة الموازية بنجاح بسرعة فائقة.");
        return true; 
    },

    // ==========================================
    // 💾 دوال الحفظ الذكية (Smart Diffing Saver)
    // ==========================================
    saveCollection: async function(key, prop) {
        try {
            // 🌟 الجدار الناري: منع الحفظ إذا لم تكتمل دورة الجلب الأساسية بنجاح
            if (!this.isCloudSyncSuccessful) {
                console.error(`⛔ تم حظر عملية حفظ (${prop}): لم تكتمل المزامنة الأساسية، إجراء وقائي لمنع فقدان البيانات.`);
                return false;
            }

            const currentData = this.data[prop];
            const isArray = Array.isArray(currentData);

            if (!isArray) {
                await FirebaseAdapter.set(key, 'singleton', currentData);
                this._updateSnapshot(prop);
                return true;
            }

            const currentArr = currentData || [];
            const snapArr = this._snapshots[prop] || [];

            currentArr.forEach(item => { if (!item.id) item.id = Utils.generateID(); });

            const currentMap = new Map(currentArr.map(item => [String(item.id), item]));
            const snapMap = new Map(snapArr.map(item => [String(item.id), item]));

            const promises = [];

            for (const [id, item] of currentMap.entries()) {
                const snapItem = snapMap.get(id);
                if (!snapItem || JSON.stringify(item) !== JSON.stringify(snapItem)) {
                    promises.push(FirebaseAdapter.set(key, id, item));
                }
            }

            for (const id of snapMap.keys()) {
                if (!currentMap.has(id)) {
                    promises.push(FirebaseAdapter.delete(key, id));
                }
            }

            if (promises.length > 0) {
                await Promise.all(promises);
            }

            this._updateSnapshot(prop);
            return true;
        } catch (error) {
            console.error(`❌ خطأ في مزامنة ${key}:`, error);
            return false;
        }
    },

    saveProducts: async function() { return await this.saveCollection(DB_KEYS.PRODS, 'prods'); },
    saveCategories: async function() { return await this.saveCollection(DB_KEYS.CATS, 'cats'); },
    saveUsers: async function() { return await this.saveCollection(DB_KEYS.USERS, 'users'); },
    saveOrders: async function() { return await this.saveCollection(DB_KEYS.ORDERS, 'orders'); },
    saveDeposits: async function() { return await this.saveCollection(DB_KEYS.DEPOSITS, 'deposits'); },
    savePayments: async function() { return await this.saveCollection(DB_KEYS.PAYMENTS, 'payments'); },
    saveRates: async function() { return await this.saveCollection(DB_KEYS.RATES, 'rates'); },
    saveTiers: async function() { return await this.saveCollection(DB_KEYS.TIERS, 'tiers'); },
    saveBanners: async function() { return await this.saveCollection(DB_KEYS.BANNERS, 'banners'); },
    saveCountries: async function() { return await this.saveCollection(DB_KEYS.COUNTRIES, 'countries'); },
    saveVault: async function() { return await this.saveCollection(DB_KEYS.VAULT, 'vault'); }, 
    saveCoupons: async function() { return await this.saveCollection(DB_KEYS.COUPONS, 'coupons'); }, 
    saveOffers: async function() { return await this.saveCollection(DB_KEYS.OFFERS, 'offers'); }, 
    saveLogs: async function() { return await this.saveCollection(DB_KEYS.LOGS, 'logs'); },
    saveAlerts: async function() { return await this.saveCollection(DB_KEYS.ALERTS, 'alerts'); },
    saveKyc: async function() { return await this.saveCollection(DB_KEYS.KYC, 'kyc'); }, 

    saveSystemSettings: async function() { 
        const s1 = await this.saveCollection(DB_KEYS.SETTINGS, 'settings');
        const s2 = await this.saveCollection(DB_KEYS.SYSTEM, 'system');
        const s3 = await this.saveCollection(DB_KEYS.POPUP, 'notif');
        return s1 && s2 && s3;
    },
    saveAdminProfile: async function() { return await this.saveCollection(DB_KEYS.ADMIN, 'adminProfile'); },

    addLog: async function(actionType, details, adminName = null) {
        try {
            if (!this.data.logs) this.data.logs = [];
            const currentAdmin = adminName || (this.data.adminProfile ? this.data.adminProfile.name : "المدير العام");
            const newLog = { id: 'LOG_' + Utils.generateID(), action: actionType, details: details, admin: currentAdmin, timestamp: Date.now() };
            this.data.logs.unshift(newLog); 
            if (this.data.logs.length > 1500) this.data.logs.length = 1500;
            await this.saveLogs();
            return true;
        } catch (err) { return false; }
    },

    exportData: async function() {
        try {
            const dataStr = JSON.stringify(this.data);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', url);
            linkElement.setAttribute('download', 'telecard_cloud_backup_' + new Date().toISOString().slice(0,10) + '.json');
            document.body.appendChild(linkElement);
            linkElement.click();
            document.body.removeChild(linkElement);
            URL.revokeObjectURL(url);
            return true;
        } catch(err) { throw err; }
    },

    importData: function(input) {
        return new Promise((resolve, reject) => {
            const file = input.files[0];
            if (!file) return reject(new Error("No file selected"));
            const reader = new FileReader();
            
            const propToKey = {
                prods: DB_KEYS.PRODS, cats: DB_KEYS.CATS, users: DB_KEYS.USERS, orders: DB_KEYS.ORDERS, 
                deposits: DB_KEYS.DEPOSITS, payments: DB_KEYS.PAYMENTS, banners: DB_KEYS.BANNERS, tiers: DB_KEYS.TIERS, 
                countries: DB_KEYS.COUNTRIES, vault: DB_KEYS.VAULT, coupons: DB_KEYS.COUPONS, offers: DB_KEYS.OFFERS, 
                logs: DB_KEYS.LOGS, alerts: DB_KEYS.ALERTS, kyc: DB_KEYS.KYC,
                settings: DB_KEYS.SETTINGS, system: DB_KEYS.SYSTEM, notif: DB_KEYS.POPUP, adminProfile: DB_KEYS.ADMIN, rates: DB_KEYS.RATES
            };

            reader.onload = async (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if(importedData && typeof importedData === 'object') {
                        
                        const criticalArrays = ['users', 'orders', 'prods', 'cats'];
                        for (let key of criticalArrays) {
                            if (importedData[key] !== undefined && !Array.isArray(importedData[key])) {
                                return reject(new Error(`الملف المرفوع تالف: البيانات في القسم (${key}) غير صالحة.`));
                            }
                        }

                        for (const prop in importedData) {
                            if (this.data[prop] !== undefined && propToKey[prop]) {
                                this.data[prop] = importedData[prop];
                                await this.saveCollection(propToKey[prop], prop);
                            }
                        }
                        input.value = ''; resolve(true);
                    } else { reject(new Error("Invalid Format")); }
                } catch (err) { reject(err); }
            };
            reader.readAsText(file);
        });
    },

    // 🌟 الحل الاحترافي لتأسيس السحابة: حقن مباشر لتجاوز الجدار الناري 
        seedDefaultCountries: async function() {
        console.warn("⚠️ جاري تأسيس بنية الدول في السحابة...");
        const defaultCountry = {
            id: 'COUNTRY_' + Utils.generateID(),
            name: 'السعودية',       
            code: 'SA',
            dialCode: '+966',
            flag: '🇸🇦',          // 🌟 الحقل المفقود الذي تم إضافته
            currency: 'SAR',     // 🌟 الحقل المفقود الذي تم إضافته
            isActive: true,
            createdAt: Date.now()
        };
        
        this.data.countries = [defaultCountry];
        await FirebaseAdapter.set(DB_KEYS.COUNTRIES, defaultCountry.id, defaultCountry);
    },
    seedDefaultTiers: async function() { 
        console.warn("⚠️ جاري تأسيس بنية المستويات في السحابة...");
        const defaultTier = {
            id: 'TIER_' + Utils.generateID(),
            name: 'عادي',                  
            icon: 'fa-user',               
            isDefault: true,               
            threshold: 0,                  
            duration: 3650,                
            duration_days: 3650,
            profit_percent: 5,             
            min_profit_usd: 0,             
            autoAdvance: true,             
            createdAt: Date.now()
        };
        
        this.data.tiers = [defaultTier]; 
        await FirebaseAdapter.set(DB_KEYS.TIERS, defaultTier.id, defaultTier);
    },

    // ==========================================
    // 🌟 العقل المحاسبي المركزي المطور (SSOT)
    // ==========================================
    calculateAllStoreStats: async function() {
        const users = Array.isArray(this.data.users) ? this.data.users : [];
        const orders = Array.isArray(this.data.orders) ? this.data.orders : [];
        const tiers = Array.isArray(this.data.tiers) ? this.data.tiers : [];

        const prodLookup = {};
        (this.data.prods || []).forEach(p => {
            prodLookup[p.id] = { catId: p.catId, name: p.name, unitCost: Number(p.costPrice || p.unitCost || 0) };
        });

        const userTierMap = {};
        users.forEach(u => { userTierMap[u.id] = String(u.tierId || ''); });

        const globalStats = {
            financials: { totalRevenue: 0, totalProfit: 0, totalCost: 0 },
            orders: { total: 0, completed: 0, rejected: 0, refunded: 0, revenue: 0, profit: 0 }, 
            deposits: { total: 0, approved: 0, rejected: 0, refunded: 0 },
            tierStats: {}, 
            promoStats: { totalDiscountAmount: 0, discountedRevenue: 0, totalDiscountedOrders: 0, couponUsageMap: {}, offerUsageMap: {} },
            daily: {}, 
            sales: { apiCount: 0, apiCompleted: 0, manualCount: 0, manualCompleted: 0, categories: {}, products: {} }
        };

        tiers.forEach(t => { globalStats.tierStats[t.id] = { name: t.name, revenue: 0, profit: 0, orderCount: 0 }; });

        const spendMap = {}, monthlySpendMap = {}, countMap = {}, monthlyCountMap = {};

        orders.forEach(o => {
            globalStats.orders.total++;
            const pInfo = prodLookup[o.productId] || { catId: 'unknown', name: o.product || 'منتج محذوف', unitCost: 0 };
            const isApi = (o.isApi === true || o.source === 'api');
            
            let exactPriceUsd = Number(o.baseUsd || o.price || 0);
            let profit = 0, cost = 0, discountAmount = 0;
            let isMarketingDiscount = false, discountType = null, discountRef = null;

            if (o.pricingSnapshot) {
                exactPriceUsd = Number(o.pricingSnapshot.finalPriceUsd || o.pricingSnapshot.finalPrice || exactPriceUsd);
                profit = Number(o.pricingSnapshot.netProfitUsd || o.pricingSnapshot.profit || 0);
                cost = exactPriceUsd - profit;
                const dType = o.pricingSnapshot.discountType;
                if (dType === 'offer' || dType === 'coupon' || o.couponCode) {
                    discountAmount = Number(o.pricingSnapshot.totalDiscount || o.pricingSnapshot.totalDiscountUsd || 0);
                    isMarketingDiscount = true; discountType = dType || 'coupon'; discountRef = o.pricingSnapshot.discountRef || o.couponCode || 'عرض';
                }
            } else {
                cost = Number(o.costPrice || (o.unitCost !== undefined ? o.unitCost : pInfo.unitCost)) * Number(o.qty || 1);
                profit = exactPriceUsd - cost;
                if (o.couponCode) { isMarketingDiscount = true; discountType = 'coupon'; discountRef = o.couponCode; }
            }
            
            if (isApi) globalStats.sales.apiCount++; else globalStats.sales.manualCount++;

            if (!globalStats.sales.products[o.productId]) {
                globalStats.sales.products[o.productId] = { name: pInfo.name, count: 0, revenue: 0, profit: 0, cost: 0, rejected: 0 };
            }
            if (!globalStats.sales.categories[pInfo.catId]) {
                globalStats.sales.categories[pInfo.catId] = { count: 0, revenue: 0, profit: 0, cost: 0 };
            }

            if (o.status === 'completed') {
                globalStats.orders.completed++;
                globalStats.orders.revenue += exactPriceUsd; 
                globalStats.orders.profit += profit; 
                
                globalStats.financials.totalRevenue += exactPriceUsd;
                globalStats.financials.totalProfit += profit;
                globalStats.financials.totalCost += cost;

                if (isApi) globalStats.sales.apiCompleted++; else globalStats.sales.manualCompleted++;

                globalStats.sales.products[o.productId].count++;
                globalStats.sales.products[o.productId].revenue += exactPriceUsd;
                globalStats.sales.products[o.productId].profit += profit;
                globalStats.sales.products[o.productId].cost += cost;

                globalStats.sales.categories[pInfo.catId].count++;
                globalStats.sales.categories[pInfo.catId].revenue += exactPriceUsd;
                globalStats.sales.categories[pInfo.catId].profit += profit;
                globalStats.sales.categories[pInfo.catId].cost += cost;

                const d = new Date(o.time || o.date || 0);
                const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

                if (!globalStats.daily[dayKey]) globalStats.daily[dayKey] = { revenue: 0, profit: 0, cost: 0 };
                globalStats.daily[dayKey].revenue += exactPriceUsd;
                globalStats.daily[dayKey].profit += profit;
                globalStats.daily[dayKey].cost += cost;

                const uTierId = userTierMap[o.userId];
                if (uTierId && globalStats.tierStats[uTierId]) {
                    globalStats.tierStats[uTierId].revenue += exactPriceUsd;
                    globalStats.tierStats[uTierId].profit += profit;
                    globalStats.tierStats[uTierId].orderCount++;
                }

                if (isMarketingDiscount) {
                    globalStats.promoStats.totalDiscountedOrders++;
                    globalStats.promoStats.discountedRevenue += exactPriceUsd; 
                    globalStats.promoStats.totalDiscountAmount += discountAmount;
                    const code = discountRef || o.couponCode;
                    if (discountType === 'coupon' || o.couponCode) globalStats.promoStats.couponUsageMap[code] = (globalStats.promoStats.couponUsageMap[code] || 0) + 1;
                    else globalStats.promoStats.offerUsageMap[discountRef] = (globalStats.promoStats.offerUsageMap[discountRef] || 0) + 1;
                }

                const uid = String(o.userId);
                spendMap[uid] = (spendMap[uid] || 0) + exactPriceUsd;
                if (!monthlySpendMap[uid]) monthlySpendMap[uid] = {};
                monthlySpendMap[uid][monthKey] = (monthlySpendMap[uid][monthKey] || 0) + exactPriceUsd;
                countMap[uid] = (countMap[uid] || 0) + 1;
                if (!monthlyCountMap[uid]) monthlyCountMap[uid] = {};
                monthlyCountMap[uid][monthKey] = (monthlyCountMap[uid][monthKey] || 0) + 1;

            } else if (o.status === 'rejected') { 
                globalStats.orders.rejected++; 
                globalStats.sales.products[o.productId].rejected++; 
            } else if (o.status === 'refunded' || o.status === 'returned') { 
                globalStats.orders.refunded++; 
            }
        });

        (this.data.deposits || []).forEach(d => {
            globalStats.deposits.total++;
            if (d.status === 'approved') globalStats.deposits.approved++;
            else if (d.status === 'rejected') globalStats.deposits.rejected++;
            else if (d.status === 'refunded') globalStats.deposits.refunded++;
        });

        if (!this.data.system) this.data.system = {};
        this.data.system.globalStats = globalStats;
        await this.saveSystemSettings();

        let usersChanged = false;
        users.forEach(u => {
            const uid = String(u.id);
            const newTotalSpend = spendMap[uid] || 0;
            const newTotalOrders = countMap[uid] || 0;
            if (u.totalSpent !== newTotalSpend || u.totalOrdersCount !== newTotalOrders) {
                u.totalSpent = newTotalSpend; u.totalOrdersCount = newTotalOrders;
                u.monthlySpent = monthlySpendMap[uid] || {}; u.monthlyOrders = monthlyCountMap[uid] || {};
                usersChanged = true;
            }
        });
        if (usersChanged) await this.saveUsers();
    },

    getFilteredSalesStats: function(range = 'all') {
        const orders = (this.data.orders || []).filter(o => o.status === 'completed');
        const now = Date.now();
        let startTime = 0;

        if (range === '7days') startTime = now - (7 * 86400000);
        else if (range === '30days') startTime = now - (30 * 86400000);
        else if (range === '90days') startTime = now - (90 * 86400000);

        const filteredOrders = range === 'all' ? orders : orders.filter(o => (o.time || o.date) >= startTime);

        let revenue = 0, profit = 0, cost = 0;
        let cats = {}, prods = {};

        filteredOrders.forEach(o => {
            const p = o.pricingSnapshot;
            const rev = Number(p?.finalPriceUsd || o.baseUsd || o.price || 0);
            const prof = Number(p?.netProfitUsd || p?.profit || (rev - (Number(o.costPrice || 0) * Number(o.qty || 1))));
            const cst = rev - prof;

            revenue += rev; profit += prof; cost += cst;

            const targetProdId = o.productId || o.prodId;
            const productData = (this.data.prods || []).find(pr => String(pr.id) === String(targetProdId));
            
            let actualCatId = productData ? productData.catId : (o.catId || o.categoryId);
            if (!actualCatId || actualCatId === 'null') {
                actualCatId = 'root';
            }

            if (!cats[actualCatId]) {
                let catName = 'القسم الرئيسي (الواجهة)'; 
                if (actualCatId !== 'root') {
                    const catObj = (this.data.cats || []).find(c => String(c.id) === String(actualCatId));
                    catName = catObj ? catObj.name : (o.category || 'قسم محذوف');
                }
                cats[actualCatId] = { name: catName, revenue: 0, profit: 0, cost: 0, count: 0 };
            }
            
            cats[actualCatId].revenue += rev; 
            cats[actualCatId].profit += prof; 
            cats[actualCatId].cost += cst;
            cats[actualCatId].count++;

            if (!prods[targetProdId]) {
                prods[targetProdId] = { 
                    name: productData ? productData.name : (o.product || 'منتج محذوف'), 
                    revenue: 0, profit: 0, cost: 0, count: 0 
                };
            }
            prods[targetProdId].revenue += rev; 
            prods[targetProdId].profit += prof; 
            prods[targetProdId].cost += cst;
            prods[targetProdId].count++;
        });

        return { revenue, profit, cost, count: filteredOrders.length, categories: cats, products: prods };
    },

    autoAdvanceSweep: async function() {
        const users = Array.isArray(this.data.users) ? this.data.users : [];
        const tiers = Array.isArray(this.data.tiers) ? this.data.tiers : [];
        let changed = false;
        const sortedTiers = [...tiers].sort((a, b) => Number(b.threshold || 0) - Number(a.threshold || 0));
        const now = Date.now();

        users.forEach(u => {
            if (u.manualTierOverride) return; 
            
            const currentTier = tiers.find(t => String(t.id) === String(u.tierId));
            if (!currentTier) return;

            const durationMs = Number(currentTier.duration_days || currentTier.duration || 30) * 24 * 60 * 60 * 1000;
            const cycleStart = Number(u.tierCycleStartDate || now);
            let cycleSpent = Number(u.tierCycleSpent || 0);

            if (now - cycleStart > durationMs) {
                u.tierCycleSpent = 0;
                u.tierCycleStartDate = now;
                cycleSpent = 0;
                changed = true;
            }

            const deservedTier = sortedTiers.find(t => 
                t.autoAdvance && 
                cycleSpent >= Number(t.threshold || 0) && 
                Number(t.threshold || 0) > Number(currentTier.threshold || 0) 
            );

            if (deservedTier && String(u.tierId) !== String(deservedTier.id)) { 
                u.tierId = deservedTier.id; 
                u.tierCycleSpent = Math.max(0, cycleSpent - Number(deservedTier.threshold || 0));
                u.tierCycleStartDate = now;
                changed = true; 
            }
        });
        if (changed) await this.saveUsers();
    },

    getWalletsLiquidity: function() {
        const users = Array.isArray(this.data.users) ? this.data.users : [];
        const rates = normalizeRates ? normalizeRates(this.data.rates) : [];
        const liquidity = { totalUsd: 0, details: {} };
        rates.forEach(r => { liquidity.details[r.code.toUpperCase()] = { name: r.name, sum: 0, count: 0 }; });
        users.forEach(u => {
            const bal = Number(u.walletBalance ?? u.balance ?? 0);
            const currencyCode = (u.baseCurrency || 'USD').toUpperCase();
            if (!liquidity.details[currencyCode]) {
                const rateObj = rates.find(r => r.code === currencyCode);
                liquidity.details[currencyCode] = { name: rateObj ? rateObj.name : 'عملة غير مدرجة', sum: 0, count: 0 };
            }
            liquidity.details[currencyCode].count++;
            if (bal > 0) {
                liquidity.details[currencyCode].sum += bal;
                if (currencyCode === 'USD') liquidity.totalUsd += bal;
                else { const rateObj = rates.find(r => r.code === currencyCode); liquidity.totalUsd += (bal / Number(rateObj?.priceRate || 1)); }
            }
        });
        return liquidity;
    },
    
    getDashboardStats: function(leaderboardPeriod = 'all') {
        const d = this.data;
        const now = new Date();
        const nowTime = now.getTime();
        const gStats = d.system?.globalStats || { financials: { totalRevenue: 0, totalProfit: 0, totalCost: 0 }, orders: { total: 0, completed: 0, rejected: 0, refunded: 0 }, promoStats: { totalDiscountAmount: 0, discountedRevenue: 0, totalDiscountedOrders: 0, couponUsageMap: {}, offerUsageMap: {} }, tierStats: {} };

        let active = 0, restricted = 0, banned = 0, bip = 0;
        (d.users || []).forEach(u => { if (u.isIpBanned) bip++; if (u.isBanned) banned++; else if (u.isRestricted) restricted++; else active++; });

        const stats = {
            financials: gStats.financials, orders: gStats.orders, deposits: gStats.deposits, tierStats: gStats.tierStats || {},
            users: { total: (d.users || []).length, active, restricted, banned, bannedIps: bip, topThreeSpenders: [], mostActiveUser: null },
            walletsData: this.getWalletsLiquidity(),
            promoStats: { totalDiscountAmount: gStats.promoStats?.totalDiscountAmount || 0, discountedRevenue: gStats.promoStats?.discountedRevenue || 0, totalDiscountedOrders: gStats.promoStats?.totalDiscountedOrders || 0, topCoupon: 'لا يوجد', topOffer: 'لا يوجد' },
            alerts: []
        };

        let topC = 0; const cMap = gStats.promoStats?.couponUsageMap || {}; for (let c in cMap) { if (cMap[c] > topC) { topC = cMap[c]; stats.promoStats.topCoupon = c; } }
        let topO = 0; const oMap = gStats.promoStats?.offerUsageMap || {}; for (let o in oMap) { if (oMap[o] > oMap[topO] || !topO) { topO = oMap[o]; stats.promoStats.topOffer = o; } }

        let lbKey = leaderboardPeriod === 'this_month' ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` : (leaderboardPeriod === 'last_month' ? `${new Date(now.getFullYear(), now.getMonth()-1).getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth()-1).getMonth()+1).padStart(2,'0')}` : '');
        
        // 🌟 الإصلاح الجذري لمعرف العميل: تحويل الـ id إلى String لضمان عمل دالة substring
        let leaderboard = (d.users || []).map(u => ({ 
            id: u.id, 
            displayId: u.displayId || (u.id ? String(u.id).substring(0, 6) : '---'),
            name: u.username ? `@${u.username}` : (u.fullName || 'مستخدم جديد'), 
            img: u.img || null, 
            spent: leaderboardPeriod === 'all' ? (Number(u.totalSpent) || 0) : (Number(u.monthlySpent?.[lbKey]) || 0), 
            count: leaderboardPeriod === 'all' ? (Number(u.totalOrdersCount) || 0) : (Number(u.monthlyOrders?.[lbKey]) || 0) 
        }));
        
        stats.users.topThreeSpenders = leaderboard.filter(u => u.spent > 0).sort((a,b) => b.spent - a.spent).slice(0,3);
        stats.users.mostActiveUser = leaderboard.filter(u => u.count > 0).sort((a,b) => b.count - a.count)[0] || null;

        const twoDays = nowTime - 172800000;
        (d.orders || []).filter(o => o.status === 'completed' && o.couponCode && (o.time || 0) > twoDays).forEach(o => { stats.alerts.push({ id: 'coupon_used', code: o.couponCode, user: o.userName || 'عميل', orderId: o.id, time: o.time }); });
        (d.vault || []).forEach(p => { let av = (p.codes || []).filter(c => typeof c === 'string' || c.status === 'available').length; if (av === 0) stats.alerts.push({ id: 'vault_empty', poolId: p.id, poolName: p.name }); else if (av <= (p.alertLimit || 5)) stats.alerts.push({ id: 'vault_low', poolId: p.id, poolName: p.name, count: av }); });
        (d.offers || []).filter(o => o.isActive && o.expiryDate && (o.expiryDate - nowTime) < 259200000).forEach(o => stats.alerts.push({ id: 'offer_expiring', name: o.name, time: o.expiryDate }));

        if (d.users?.length > 0) stats.alerts.push({ id: 'security_stable' });
        stats.alerts.sort((a, b) => (b.time || nowTime) - (a.time || nowTime));
        return stats;
    }

};
