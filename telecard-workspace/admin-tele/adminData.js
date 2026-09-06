// ============================================================================
// 🗄️ مدير البيانات المركزي (adminData.js) - Enterprise V16.8 💎 (The Purified Edition)
// 🎯 الوظيفة: SSOT (المصدر الوحيد للحقيقة)، معالجة البيانات الضخمة، والبحث اللحظي
// 🚀 التحديثات المعمارية (V16.8 - Immortal Tier Sync):
// 1. Smart Account Rescue 🛡️: إنقاذ الحسابات المعلقة في دالة الترقية (autoAdvanceSweep) وإلباسها المستوى الافتراضي.
// 2. Immortal Tier ID 🛡️: توحيد معرف المستوى الافتراضي (TIER_DEFAULT) ليتطابق مع السيرفر ويمنع توليد الأشباح.
// 3. Unified Time Engine: تضمين محرك الوقت القوي لمنع انهيار الإحصائيات والأرباح.
// 4. Strict Type Casting: حماية دوال toUpperCase و map من كائنات null لمنع الشاشة البيضاء.
// ============================================================================

import { DB_KEYS, normalizeRates } from './adminConfig.js';
import { Utils, EventBus } from './adminUtils.js'; 
import { FirebaseAdapter } from './core/firebaseAdapter.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { FinancialEngine } from './core/financialEngine.js';

// 🚀 محرك وقت محصن بالكامل (متزامن مع واجهة العميل)
const parseSafeTime = (ts) => {
    if (ts === null || ts === undefined || ts === '') return Date.now();
    if (typeof ts === 'number') return ts;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts.seconds !== undefined) return ts.seconds * 1000;
    if (ts._seconds !== undefined) return ts._seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'string') {
        const parsed = new Date(ts.includes('T') ? ts : ts.replace(/-/g, '/')).getTime();
        return isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
};

export const AdminData = {
    isCloudSyncSuccessful: false,
    isSeedingTiers: false, 
    isSeedingCountries: false, 
    
    data: { 
        deposits: [], orders: [], users: [], cats: [], prods: [], 
        payments: [], banners: [], settings: {}, rates: [], 
        system: {}, adminProfile: {}, tiers: [], countries: [], 
        vault: [], coupons: [], offers: [], logs: [], alerts: [],
        
        usersMap: {}, prodsMap: {}, catsMap: {}, tiersMap: {}, 
        couponsMap: {}, countriesMap: {}, ratesMap: {},
        ordersMap: {}, depositsMap: {} 
    },
    
    filters: {
        deposits: { search: '', start: null, end: null },
        orders: { search: '', start: null, end: null }
    },

    _snapshots: {},

    // 🚀 حماية بناء الخرائط بـ filter(Boolean) لمنع الانهيار
    _buildSingleMap: function(prop) {
        const arr = Array.isArray(this.data[prop]) ? this.data[prop].filter(Boolean) : [];
        if (prop === 'users') this.data.usersMap = Object.fromEntries(arr.map(u => [String(u.id), u]));
        else if (prop === 'prods') this.data.prodsMap = Object.fromEntries(arr.map(p => [String(p.id), p]));
        else if (prop === 'cats') this.data.catsMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
        else if (prop === 'tiers') this.data.tiersMap = Object.fromEntries(arr.map(t => [String(t.id), t]));
        else if (prop === 'coupons') this.data.couponsMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
        else if (prop === 'orders') this.data.ordersMap = Object.fromEntries(arr.map(o => [String(o.id), o]));
        else if (prop === 'deposits') this.data.depositsMap = Object.fromEntries(arr.map(d => [String(d.id), d]));
        else if (prop === 'rates') {
            this.data.ratesMap = Object.fromEntries(arr.map(r => [String(r.code).toUpperCase(), r]));
        }
        else if (prop === 'countries') {
            this.data.countriesMap = Object.fromEntries(arr.map(c => {
                if (!c.id) c.id = c.code || Utils.generateID();
                return [String(c.id), c];
            }));
        }
    },    
    
    _buildMaps: function() {
        const mapsToBuild = ['users', 'prods', 'cats', 'tiers', 'coupons', 'countries', 'rates', 'orders', 'deposits'];
        mapsToBuild.forEach(prop => this._buildSingleMap(prop));
    },
    
    _updateSnapshot: function(prop) {
        try { this._snapshots[prop] = structuredClone(this.data[prop]); } 
        catch (e) { this._snapshots[prop] = JSON.parse(JSON.stringify(this.data[prop])); }
    },

    loadData: async function() {
        console.log("🚀 [TeleCard Admin] جاري حقن البيانات بنظام الجداول O(1)...");
        this.isCloudSyncSuccessful = false;

        const arr = v => Array.isArray(v) ? v.filter(Boolean) : [];
        const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

        const fetchRecent = async (key, limitCount = 100, orderByField = 'time') => {
            const res = await FirebaseAdapter.getRecent(key, limitCount, orderByField);
            return (res && res.length > 0) ? res : [];
        };

        const fetchArray = async (key) => {
            const res = await FirebaseAdapter.getAll(key);
            return (res && res.length > 0) ? res : [];
        };

        const fetchSingleton = async (key, fallback = {}) => {
            const res = await FirebaseAdapter.getById(key, 'singleton');
            return res ? res : fallback;
        };

        const ADMIN_PRODS_KEY = 'telecard_prods'; 

        try {
            const results = await Promise.all([
                fetchArray(DB_KEYS.RATES), fetchArray(DB_KEYS.TIERS), fetchRecent(DB_KEYS.USERS, 200, 'createdAt'),
                fetchRecent(DB_KEYS.DEPOSITS, 150, 'time'), fetchRecent(DB_KEYS.ORDERS, 150, 'time'),
                fetchArray(DB_KEYS.CATS), fetchArray(ADMIN_PRODS_KEY), fetchArray(DB_KEYS.PAYMENTS),
                fetchArray(DB_KEYS.BANNERS), fetchSingleton(DB_KEYS.SETTINGS), fetchSingleton(DB_KEYS.POPUP),
                fetchSingleton(DB_KEYS.SYSTEM), fetchSingleton(DB_KEYS.ADMIN), fetchArray(DB_KEYS.COUNTRIES),
                fetchArray(DB_KEYS.VAULT), fetchArray(DB_KEYS.COUPONS), fetchArray(DB_KEYS.OFFERS),
                fetchRecent(DB_KEYS.LOGS, 50, 'timestamp'), fetchRecent(DB_KEYS.ALERTS, 50, 'time')
            ]);

            const [
                rRates, rTiers, rUsers, rDeposits, rOrders, rCats, rProds, rPayments, 
                rBanners, rSettings, rNotif, rSystem, rAdmin, rCountries, rVault, 
                rCoupons, rOffers, rLogs, rAlerts
            ] = results;

            const normalizedRatesMap = typeof normalizeRates === 'function' ? normalizeRates(rRates) : rRates;
            this.data.rates = Array.isArray(normalizedRatesMap) ? normalizedRatesMap : Object.values(normalizedRatesMap || {});
            
            this.data.settings = obj(rSettings);
            this.data.system = obj(rSystem);
            this.data.adminProfile = obj(rAdmin);
            
            this.data.tiers = arr(rTiers).map(t => ({
                ...t, 
                threshold: Number(t.threshold || t.condition_amount || 0),
                isDefault: !!(t.isDefault || t.is_default),
                profitPercent: Number(t.profitPercent ?? t.profit_percent ?? 5),
                minProfitUsd: Number(t.minProfitUsd ?? t.min_profit_usd ?? 0)
            }));

            if(this.data.tiers.length === 0 || !this.data.tiers.some(t => t.isDefault)) await this.seedDefaultTiers();

            // 🚀 Strict Type Casting لحماية النظام
            this.data.users = arr(rUsers).map(u => ({
                ...u,
                walletBalance: Number(u.walletBalance ?? u.balance ?? 0),
                baseCurrency: String(u.baseCurrency || u.base_currency || 'USD').toUpperCase()
            }));

            this.data.prods = arr(rProds).map(p => ({
                ...p,
                costPrice: Number(p.costPrice || p.cost_price || 0),
                price: Number(p.price || 0),
                isFixedPrice: !!(p.isFixedPrice || p.is_fixed_price)
            }));

            this.data.deposits = arr(rDeposits);
            this.data.orders = arr(rOrders);
            this.data.cats = arr(rCats);
            
            const normalizeCurrencyList = (val) => {
                const allowed = new Set(this.data.rates.map(c => String(c.code).toUpperCase()));
                const arrVal = Array.isArray(val) ? val : String(val || '').split(',');
                const out = []; const seen = new Set();
                arrVal.map(c => String(c || '').trim().toUpperCase()).forEach(c => {
                    if(c && allowed.has(c) && !seen.has(c)) { seen.add(c); out.push(c); }
                });
                return out.length ? out : [];
            };

            this.data.payments = arr(rPayments).map(p => ({
                ...p, 
                currencies: normalizeCurrencyList(p.currencies).join(',') 
            }));

            this.data.banners = arr(rBanners);
            this.data.notif = obj(rNotif);
            
            this.data.countries = arr(rCountries).map(c => {
                const cId = c.id || c.code || Utils.generateID();
                return {
                    ...c, 
                    id: cId,
                    name: String(c.name || c.nameAr || 'دولة جديدة'), 
                    flag: String(c.flag || c.flagEmoji || '🌍'), 
                    currency: String(c.currency || 'USD').toUpperCase(), 
                    dialCode: String(c.dialCode || '+00'), 
                    code: String(c.code || cId || 'XX').toUpperCase() 
                };
            });

            if (this.data.countries.length === 0) {
                if (this.data.settings && Array.isArray(this.data.settings.countries) && this.data.settings.countries.length > 0) {
                    this.data.countries = this.data.settings.countries.map(c => ({
                        ...c, id: c.id || c.code || Utils.generateID()
                    }));
                    await this.saveCountries(); 
                } 
                else if (this.data.system && Array.isArray(this.data.system.countries) && this.data.system.countries.length > 0) {
                    this.data.countries = this.data.system.countries.map(c => ({
                        ...c, id: c.id || c.code || Utils.generateID()
                    }));
                    await this.saveCountries(); 
                } 
                else {
                    await this.seedDefaultCountries();
                }
            }

            this.data.vault = arr(rVault);
            
            this.data.coupons = arr(rCoupons).map(c => ({
                ...c, 
                isActive: c.isActive === true || c.isActive === 'true' || c.is_active === true, 
                value: Number(c.value || 0), 
                minOrder: Number(c.minOrder || 0), 
                maxUses: Number(c.maxUses || 0), 
                usedCount: Number(c.usedCount || 0), 
                maxPerUser: Number(c.maxPerUser || 0), 
                expiryDate: c.expiryDate ? Number(c.expiryDate) : null, 
                targetProds: Array.isArray(c.targetProds) ? c.targetProds : [], 
                targetTiers: Array.isArray(c.targetTiers) ? c.targetTiers : [], 
                allowedUsers: Array.isArray(c.allowedUsers) ? c.allowedUsers : []
            }));

            this.data.offers = arr(rOffers).map(o => ({
                ...o, 
                isActive: o.isActive === true || o.isActive === 'true', 
                value: Number(o.value || 0), 
                expiryDate: o.expiryDate ? Number(o.expiryDate) : null, 
                targetProds: Array.isArray(o.targetProds) ? o.targetProds : [], 
                visualConfig: (o.visualConfig && typeof o.visualConfig === 'object') ? o.visualConfig : {}
            }));

            this.data.logs = rLogs;
            this.data.alerts = rAlerts;

            this._buildMaps();

            Object.keys(this.data).forEach(prop => { if(Array.isArray(this.data[prop])) this._updateSnapshot(prop); });

            this.isCloudSyncSuccessful = true;
            
            return true;

        } catch (error) {
            console.error("[TeleCard Admin] ⛔ فشل حرج في مزامنة البيانات:", error);
            throw error;
        }
    },

    getWalletsLiquidity: function() {
        const liquidity = { totalUsd: 0, details: {} };
        
        this.data.users.forEach(u => {
            const bal = Number(u.walletBalance || 0);
            const curr = String(u.baseCurrency || 'USD').toUpperCase();
            if (!liquidity.details[curr]) liquidity.details[curr] = { sum: 0, count: 0 };
            
            liquidity.details[curr].sum = FinancialEngine.safeAdd(liquidity.details[curr].sum, bal);
            liquidity.details[curr].count++;
            
            if (curr === 'USD') {
                liquidity.totalUsd = FinancialEngine.safeAdd(liquidity.totalUsd, bal);
            } else {
                const balInUsd = FinancialEngine.convertViaUSD(bal, curr, 'USD', this.data.rates, 'deposit');
                liquidity.totalUsd = FinancialEngine.safeAdd(liquidity.totalUsd, balInUsd);
            }
        });
        return liquidity;
    },

    getFilteredSalesStats: function(range = 'all') {
        const orders = (this.data.orders || []).filter(o => o.status === 'completed');
        const now = Date.now();
        let startTime = 0;
        
        if (range === '7days') startTime = now - (7 * 86400000);
        else if (range === '30days') startTime = now - (30 * 86400000);
        
        const filteredOrders = range === 'all' ? orders : orders.filter(o => parseSafeTime(o.time) >= startTime);
        
        let revenue = 0, profit = 0, cost = 0;
        let cats = {}, prods = {};
        
        const minMargin = FinancialEngine.CONFIG?.MIN_MARGIN_PERCENT || 5;
        const costMultiplier = (100 - minMargin) / 100;
        const profitMultiplier = minMargin / 100;
        
        filteredOrders.forEach(o => {
            const snap = o.pricingSnapshot;
            
            const rev = Number(o.price || 0);
            let prof = Number(snap?.netProfitUsd || 0);
            let cst = Number(snap?.costUsd || 0);
            
            if (cst === 0 && prof === 0 && rev > 0) {
                cst = FinancialEngine.safeMul(rev, costMultiplier);
                prof = FinancialEngine.safeMul(rev, profitMultiplier);
            } else if (cst === 0) {
                cst = Math.max(0, FinancialEngine.safeSub(rev, prof));
            }
            
            revenue = FinancialEngine.safeAdd(revenue, rev);
            profit = FinancialEngine.safeAdd(profit, prof);
            cost = FinancialEngine.safeAdd(cost, cst);
            
            const pData = this.data.prodsMap[o.prodId];
            const catId = String(pData?.catId || o.catId || 'root');
            
            if (!cats[catId]) {
                const catObj = this.data.catsMap[catId];
                cats[catId] = { name: catObj?.name || 'قسم غير معرف', revenue: 0, profit: 0, count: 0 };
            }
            cats[catId].revenue = FinancialEngine.safeAdd(cats[catId].revenue, rev);
            cats[catId].profit = FinancialEngine.safeAdd(cats[catId].profit, prof);
            cats[catId].count++;
            
            const prodKey = String(o.prodId || 'unknown');
            if (!prods[prodKey]) {
                prods[prodKey] = { name: pData?.name || o.product || 'منتج غير متوفر', revenue: 0, profit: 0, count: 0 };
            }
            prods[prodKey].revenue = FinancialEngine.safeAdd(prods[prodKey].revenue, rev);
            prods[prodKey].profit = FinancialEngine.safeAdd(prods[prodKey].profit, prof);
            prods[prodKey].count++;
        });
        
        return { revenue, profit, cost, count: filteredOrders.length, categories: cats, products: prods };
    },

    getDashboardStats: function(leaderboardPeriod = 'all') {
        const d = this.data;
        const nowTime = Date.now();
        const sysStats = d.system?.globalStats || {};
        
        let startTime = 0;
        let endTime = Infinity;
        const nowObj = new Date(nowTime);
        
        if (leaderboardPeriod === 'this_month') {
            startTime = Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), 1);
        } else if (leaderboardPeriod === 'last_month') {
            startTime = Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth() - 1, 1);
            const nextMonthFirstDay = Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), 1);
            endTime = nextMonthFirstDay - 1; 
        }
  
        const userSpendingMap = {};
        
        if (leaderboardPeriod === 'all') {
            d.users.forEach(u => {
                if (!u.isBanned && Number(u.totalSpent) > 0) {
                    userSpendingMap[u.id] = Number(u.totalSpent);
                }
            });
        } else {
            d.orders.forEach(o => {
                if (o.status === 'completed') {
                    const oTime = parseSafeTime(o.time || o.createdAt);
                    if (oTime >= startTime && oTime <= endTime) {
                        const uid = String(o.userId);
                        const u = d.usersMap[uid];
                        if (u && !u.isBanned) {
                            const price = Number(o.price || 0);
                            userSpendingMap[uid] = FinancialEngine.safeAdd(userSpendingMap[uid] || 0, price);
                        }
                    }
                }
            });
        }
        
        const topHeroes = Object.entries(userSpendingMap)
            .sort(([, aSpent], [, bSpent]) => bSpent - aSpent)
            .slice(0, 3)
            .map(([uid, spent]) => {
                const u = d.usersMap[uid]; 
                return u ? {
                    id: u.id, displayId: u.displayId || String(u.id).substring(0, 8),
                    name: u.fullName || u.name || u.username || 'عميل مميز',
                    img: u.profileImage || u.img || null, spent: spent
                } : null;
            }).filter(Boolean);
        
        const stats = {
            financials: sysStats.financials || { totalRevenue: 0, totalProfit: 0, totalCost: 0 },
            orders: sysStats.orders || { total: 0, completed: 0, rejected: 0 },
            deposits: sysStats.deposits || { total: 0, approved: 0 },
            users: { total: d.users.length, banned: 0, active: 0, topThree: topHeroes },
            wallets: this.getWalletsLiquidity(),
            alerts: []
        };
        
        d.users.forEach(u => u.isBanned ? stats.users.banned++ : stats.users.active++);
        
        const recentTime = nowTime - 172800000; 
        d.orders.filter(o => o.status === 'completed' && o.couponCode && parseSafeTime(o.time) > recentTime).forEach(o => {
            const u = this.data.usersMap[o.userId];
            stats.alerts.push({ id: 'coupon_used', code: o.couponCode, user: u?.username || u?.fullName || 'عميل', time: parseSafeTime(o.time), orderId: o.id });
        });
        
        d.vault.forEach(v => {
            const stock = Number(v.stockCount || v.codes?.length || 0);
            if (stock === 0) stats.alerts.push({ id: 'vault_empty', poolName: v.name, time: nowTime, poolId: v.id });
            else if (stock <= (v.alertLimit || 5)) stats.alerts.push({ id: 'vault_low', poolName: v.name, count: stock, time: nowTime, poolId: v.id });
        });
        
        const pendingKyc = d.users.filter(u => u.kycStatus === 'pending').length;
        if (pendingKyc > 0) stats.alerts.push({ id: 'kyc_pending', count: pendingKyc, time: nowTime });
        
        if (stats.alerts.length === 0) stats.alerts.push({ id: 'security_stable', time: 0 });
        stats.alerts.sort((a, b) => parseSafeTime(b.time) - parseSafeTime(a.time));
        
        return stats;
    },

    saveCollection: async function(key, prop) {
        if (!this.isCloudSyncSuccessful) return false;
        
        const targetCollectionKey = (prop === 'prods') ? 'telecard_prods' : key;
        
        const currentArr = this.data[prop] || [];
        const snapArr = this._snapshots[prop] || [];
        
        const validCurrentArr = currentArr.filter(Boolean);
        const currentMap = new Map(validCurrentArr.map(i => {
            if (!i.id) i.id = i.code || Utils.generateID(); 
            return [String(i.id), i];
        }));
        
        const validSnapArr = snapArr.filter(Boolean);
        const snapMap = new Map(validSnapArr.map(i => [String(i.id), i]));
        const promises = [];
        
        currentMap.forEach((item, id) => {
            const old = snapMap.get(id);
            if (!old) {
                if (prop === 'prods' && item.isActive === undefined) item.isActive = true;
                promises.push(FirebaseAdapter.set(targetCollectionKey, id, item));
            } else {
                let hasChanges = false;
                
                Object.keys(item).forEach(k => {
                    if (JSON.stringify(item[k]) !== JSON.stringify(old[k])) {
                        hasChanges = true;
                    }
                });
                
                if (hasChanges) {
                    item.updatedAt = Date.now();
                    promises.push(FirebaseAdapter.set(targetCollectionKey, id, item));
                }
            }
        });
        
        snapMap.forEach((_, id) => {
            if (!currentMap.has(id)) promises.push(FirebaseAdapter.delete(targetCollectionKey, id));
        });
        
        if (promises.length > 0) {
            await Promise.all(promises);
            
            if (['prods', 'cats', 'tiers', 'offers', 'rates', 'banners'].includes(prop)) {
                if (!this.data.settings) this.data.settings = {};
                this.data.settings.catalogVersion = Date.now().toString(36);
                await this.saveSystemSettings();
            }
        }
        
        this._updateSnapshot(prop);
        this._buildSingleMap(prop);
        
        return true;
    },
    
    forceSyncCatalog: async function() {
        console.log("🚀 جاري إجبار السيرفر على مزامنة كتالوج المنتجات بالكامل...");
        try {
            const result = await FirebaseAdapter.callFunction('adminForceSyncCatalog', {});
            if (result && result.success) {
                console.log("✅ المزامنة تمت بنجاح:", result.message);
                return { success: true, message: result.message };
            }
            return { success: false, message: 'تعذر تأكيد المزامنة من السيرفر.' };
        } catch (error) {
            console.error("🚨 فشل في استدعاء المزامنة الجبرية:", error);
            return { success: false, message: error.message };
        }
    },

    saveCountries: function() { return this.saveCollection(DB_KEYS.COUNTRIES, 'countries'); },
    saveRates: function() { return this.saveCollection(DB_KEYS.RATES, 'rates'); },
    saveCoupons: function() { return this.saveCollection(DB_KEYS.COUPONS, 'coupons'); },
    saveTiers: function() { return this.saveCollection(DB_KEYS.TIERS, 'tiers'); },
    saveProducts: function() { return this.saveCollection(DB_KEYS.PRODS, 'prods'); },
    saveCategories: function() { return this.saveCollection(DB_KEYS.CATS, 'cats'); },
    saveUsers: function() { return this.saveCollection(DB_KEYS.USERS, 'users'); },
    saveOrders: function() { return this.saveCollection(DB_KEYS.ORDERS, 'orders'); },
    saveDeposits: function() { return this.saveCollection(DB_KEYS.DEPOSITS, 'deposits'); },
    saveVault: function() { return this.saveCollection(DB_KEYS.VAULT, 'vault'); },
    savePayments: function() { return this.saveCollection(DB_KEYS.PAYMENTS, 'payments'); },
    saveBanners: function() { return this.saveCollection(DB_KEYS.BANNERS, 'banners'); },
    saveOffers: function() { return this.saveCollection(DB_KEYS.OFFERS, 'offers'); },
    
    saveSystemSettings: async function() {
        if (!this.isCloudSyncSuccessful) return false;
        try {
            await FirebaseAdapter.set(DB_KEYS.SETTINGS, 'singleton', this.data.settings);
            return true;
        } catch (e) { console.error("خطأ في حفظ الإعدادات:", e); return false; }
    },
        
    saveAdminProfile: async function() {
        if (!this.isCloudSyncSuccessful) return false;
        try {
            await FirebaseAdapter.set(DB_KEYS.ADMIN, 'singleton', this.data.adminProfile);
            return true;
        } catch (e) { console.error("خطأ في حفظ بروفايل الأدمن:", e); return false; }
    },

    // 🛡️ التحديث المعماري: إنقاذ الحسابات المعلقة ومنحها المستوى الخالد
    autoAdvanceSweep: async function() {
        const tiers = [...this.data.tiers].sort((a,b) => b.threshold - a.threshold);
        
        // جلب المستوى الافتراضي الخالد لاستخدامه كطوق نجاة للحسابات المعلقة
        const defaultTier = tiers.find(t => t.isDefault) || tiers.find(t => String(t.id) === 'TIER_DEFAULT') || tiers[tiers.length - 1]; 
        
        let changed = false;
        const now = Date.now();

        this.data.users.forEach(u => {
            if (u.manualTierOverride) return;
            
            let currentTier = this.data.tiersMap[u.tierId];
            
            // 🛡️ إنقاذ الحسابات المعلقة: إذا كان المستوى مفقوداً، نمنحه المستوى الافتراضي الخالد فوراً
            if (!currentTier) {
                if (defaultTier) {
                    u.tierId = String(defaultTier.id);
                    currentTier = defaultTier;
                    changed = true;
                } else {
                    return; // خروج آمن في حال عدم وجود أي مستوى بالنظام
                }
            }

            const cycleStart = parseSafeTime(u.tierCycleStartDate) || now;
            const activeDuration = Number(currentTier.durationDays || currentTier.duration_days || 30);
            const durationMs = activeDuration * 86400000;

            if (now - cycleStart > durationMs) {
                u.tierCycleSpent = 0; 
                u.tierCycleStartDate = now; 
                changed = true;
            }

            // فحص الترقية
            const earned = tiers.find(t => t.autoAdvance && u.tierCycleSpent >= t.threshold && t.threshold > currentTier.threshold);
            if (earned) { 
                u.tierId = String(earned.id); 
                u.tierCycleStartDate = now; // تصفير عداد الدورة عند الترقية لمستوى جديد
                changed = true; 
            }
        });

        if (changed) await this.saveUsers();
    },

    // 🛡️ التحديث المعماري: توحيد معرف المستوى الخالد ليتطابق مع السيرفر
    seedDefaultTiers: async function() {
        if (this.isSeedingTiers) return;
        this.isSeedingTiers = true;
        try {
            const defaultTierId = 'TIER_DEFAULT'; 
            if (this.data.tiers.some(t => String(t.id) === defaultTierId || t.isDefault)) return;
            
            const defaultTier = { id: defaultTierId, name: 'عضو جديد', isDefault: true, threshold: 0, durationDays: 3650, profitPercent: 5, autoAdvance: true, createdAt: Date.now() };
            if (!Array.isArray(this.data.tiers)) this.data.tiers = [];
            this.data.tiers.push(defaultTier);
            await FirebaseAdapter.set(DB_KEYS.TIERS, defaultTier.id, defaultTier);
        } finally { this.isSeedingTiers = false; }
    },
    
    seedDefaultCountries: async function() {
        if (this.isSeedingCountries) return;
        this.isSeedingCountries = true;
        try {
            const defaultCountryId = 'COUNTRY_DEFAULT_SA';
            if (this.data.countries.some(c => c.id === defaultCountryId || c.code === 'SA')) return;
            
            const defaultCountry = {
                id: defaultCountryId, name: 'السعودية', code: 'SA', dialCode: '+966',
                flag: '🇸🇦', currency: 'SAR', isActive: true, createdAt: Date.now()
            };
            if (!Array.isArray(this.data.countries)) this.data.countries = [];
            this.data.countries.push(defaultCountry);
            await FirebaseAdapter.set(DB_KEYS.COUNTRIES, defaultCountry.id, defaultCountry);
        } finally {
            this.isSeedingCountries = false;
        }
    }
};
