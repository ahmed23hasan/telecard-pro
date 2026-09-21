// ============================================================================
// 🗄️ مدير البيانات المركزي (adminData.js) - Enterprise V18.3 💎 (The Masterpiece)
// 🎯 الوظيفة: SSOT، إدارة الذاكرة بذكاء (Pagination)، والاستعلامات التجميعية (JIT Aggregation).
// 🚀 التحديثات المعمارية (V18.3 - The Ultimate Cloud-Native Paradigm):
// 1. Pagination Blindness Fix 👁️: استئصال دالة (autoAdvanceSweep) بالكامل. الواجهة لم تعد مسؤولة عن الترقية.
// 2. Ghost Deletion Shield 🛡️: إزالة (saveAlerts) نهائياً لمنع مسح الإشعارات القديمة غير المحملة في الذاكرة.
// 3. True Separation of Concerns ⚖️: الواجهة للعرض، وتحديث الجداول اللانهائية يتم ذرياً أو عبر وظائف سحابية.
// ============================================================================

import { DB_KEYS, normalizeRates } from './adminConfig.js';
import { Utils, EventBus } from './adminUtils.js'; 
import { FirebaseAdapter } from './core/firebaseAdapter.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { FinancialEngine } from './core/financialEngine.js';
import { doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
    
    cursors: { orders: null, deposits: null, users: null, logs: null, alerts: null },
    
    // 🚀 الكاش المركزي السريع لتغذية قسم المالية ولوحة القيادة
    walletsCache: { totalUsd: 0, details: {} },
    
    data: { 
        deposits: [], orders: [], users: [], cats: [], prods: [], 
        payments: [], banners: [], settings: {}, rates: [], 
        system: {}, adminProfile: {}, tiers: [], countries: [], 
        vault: [], coupons: [], offers: [], logs: [], alerts: [],
        
        usersMap: {}, prodsMap: {}, catsMap: {}, tiersMap: {}, 
        couponsMap: {}, countriesMap: {}, ratesMap: {},
        ordersMap: {}, depositsMap: {}, offersMap: {}, 
        vaultMap: {}, paymentsMap: {} 
    },
    
    filters: {
        deposits: { search: '', start: null, end: null },
        orders: { search: '', start: null, end: null }
    },

    _snapshots: {},

    getWalletsLiquidity: function() {
        return this.walletsCache;
    },

    _deepEqual: function(obj1, obj2) {
        if (obj1 === obj2) return true;
        if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false;
        
        const keys1 = Object.keys(obj1).filter(k => k !== 'updatedAt');
        const keys2 = Object.keys(obj2).filter(k => k !== 'updatedAt');
        
        if (keys1.length !== keys2.length) return false;
        
        for (const key of keys1) {
            if (!keys2.includes(key) || !this._deepEqual(obj1[key], obj2[key])) return false;
        }
        return true;
    },

    _buildSingleMap: function(prop) {
        const arr = Array.isArray(this.data[prop]) ? this.data[prop].filter(Boolean) : [];
        if (prop === 'users') this.data.usersMap = Object.fromEntries(arr.map(u => [String(u.id), u]));
        else if (prop === 'prods') this.data.prodsMap = Object.fromEntries(arr.map(p => [String(p.id), p]));
        else if (prop === 'cats') this.data.catsMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
        else if (prop === 'tiers') this.data.tiersMap = Object.fromEntries(arr.map(t => [String(t.id), t]));
        else if (prop === 'coupons') this.data.couponsMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
        else if (prop === 'orders') this.data.ordersMap = Object.fromEntries(arr.map(o => [String(o.id), o]));
        else if (prop === 'deposits') this.data.depositsMap = Object.fromEntries(arr.map(d => [String(d.id), d]));
        else if (prop === 'offers') this.data.offersMap = Object.fromEntries(arr.map(o => [String(o.id), o])); 
        else if (prop === 'vault') this.data.vaultMap = Object.fromEntries(arr.map(v => [String(v.id), v])); 
        else if (prop === 'payments') this.data.paymentsMap = Object.fromEntries(arr.map(p => [String(p.id), p])); 
        else if (prop === 'rates') {
            this.data.ratesMap = Object.fromEntries(arr.map(r => [String(r.code).toUpperCase(), r]));
        }
        else if (prop === 'countries') {
            this.data.countriesMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
        }
    },    
    
    _buildMaps: function() {
        const mapsToBuild = ['users', 'prods', 'cats', 'tiers', 'coupons', 'countries', 'rates', 'orders', 'deposits', 'offers', 'vault', 'payments'];
        mapsToBuild.forEach(prop => this._buildSingleMap(prop));
    },
    
    _updateSnapshot: function(prop) {
        try { this._snapshots[prop] = structuredClone(this.data[prop]); } 
        catch (e) { this._snapshots[prop] = JSON.parse(JSON.stringify(this.data[prop])); }
    },

    loadData: async function() {
        console.log("🚀 [TeleCard Admin] إقلاع السحابة... جاري تطبيق استراتيجية Pagination...");
        this.isCloudSyncSuccessful = false;

        const arr = v => Array.isArray(v) ? v.filter(Boolean) : [];
        const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

        const fetchArray = async (key) => {
            const res = await FirebaseAdapter.getAll(key);
            return (res && res.length > 0) ? res : [];
        };

        const fetchSingleton = async (key, fallback = {}) => {
            const res = await FirebaseAdapter.getById(key, 'singleton');
            return res ? res : fallback;
        };

        try {
            // 🚀 الجداول المحدودة (بدون Pagination) مسموح لها أن تحمل بالكامل
            const staticResults = await Promise.all([
                fetchArray(DB_KEYS.RATES), fetchArray(DB_KEYS.TIERS), fetchArray(DB_KEYS.CATS), 
                fetchArray('telecard_prods'), fetchArray(DB_KEYS.PAYMENTS), fetchArray(DB_KEYS.BANNERS), 
                fetchSingleton(DB_KEYS.SETTINGS), fetchSingleton(DB_KEYS.POPUP), fetchSingleton(DB_KEYS.SYSTEM), 
                fetchSingleton(DB_KEYS.ADMIN), fetchArray(DB_KEYS.COUNTRIES), fetchArray(DB_KEYS.VAULT), 
                fetchArray(DB_KEYS.COUPONS), fetchArray(DB_KEYS.OFFERS)
            ]);

            const [
                rRates, rTiers, rCats, rProds, rPayments, rBanners, 
                rSettings, rNotif, rSystem, rAdmin, rCountries, 
                rVault, rCoupons, rOffers
            ] = staticResults;

            // 🚀 الجداول اللانهائية (مع Pagination) تسحب 50 سجلاً فقط لحماية الذاكرة
            const dynamicResults = await Promise.all([
                FirebaseAdapter.fetchMoreWithCursor(DB_KEYS.USERS, [], 'createdAt', null, 50),
                FirebaseAdapter.fetchMoreWithCursor(DB_KEYS.ORDERS, [], 'time', null, 50),
                FirebaseAdapter.fetchMoreWithCursor(DB_KEYS.DEPOSITS, [], 'time', null, 50),
                FirebaseAdapter.fetchMoreWithCursor(DB_KEYS.LOGS, [], 'timestamp', null, 50),
                FirebaseAdapter.fetchMoreWithCursor(DB_KEYS.ALERTS, [], 'time', null, 50)
            ]);

            const [rUsersObj, rOrdersObj, rDepositsObj, rLogsObj, rAlertsObj] = dynamicResults;

            this.cursors.users = rUsersObj.newLastDoc;
            this.cursors.orders = rOrdersObj.newLastDoc;
            this.cursors.deposits = rDepositsObj.newLastDoc;
            this.cursors.logs = rLogsObj.newLastDoc;
            this.cursors.alerts = rAlertsObj.newLastDoc;

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

            this.data.users = arr(rUsersObj.data).map(u => ({
                ...u, walletBalance: Number(u.walletBalance ?? u.balance ?? 0), baseCurrency: String(u.baseCurrency || u.base_currency || 'USD').toUpperCase()
            }));

            this.data.prods = arr(rProds).map(p => ({
                ...p, costPrice: Number(p.costPrice || p.cost_price || 0), price: Number(p.price || 0), isFixedPrice: !!(p.isFixedPrice || p.is_fixed_price)
            }));

            this.data.deposits = arr(rDepositsObj.data);
            this.data.orders = arr(rOrdersObj.data);
            this.data.logs = arr(rLogsObj.data);
            this.data.alerts = arr(rAlertsObj.data);
            this.data.cats = arr(rCats);
            
            const normalizeCurrencyList = (val) => {
                const allowed = new Set(this.data.rates.map(c => String(c.code).toUpperCase()));
                const arrVal = Array.isArray(val) ? val : String(val || '').split(',');
                const out = []; const seen = new Set();
                arrVal.map(c => String(c || '').trim().toUpperCase()).forEach(c => { if(c && allowed.has(c) && !seen.has(c)) { seen.add(c); out.push(c); }});
                return out.length ? out : [];
            };

            this.data.payments = arr(rPayments).map(p => ({ ...p, currencies: normalizeCurrencyList(p.currencies).join(',') }));
            this.data.banners = arr(rBanners);
            this.data.notif = obj(rNotif);
            
            this.data.countries = arr(rCountries).map(c => {
                const cId = c.id || c.code || Utils.generateID();
                return { ...c, id: cId, name: String(c.name || c.nameAr || 'دولة جديدة'), flag: String(c.flag || c.flagEmoji || '🌍'), currency: String(c.currency || 'USD').toUpperCase(), dialCode: String(c.dialCode || '+00'), code: String(c.code || cId || 'XX').toUpperCase() };
            });

            if (this.data.countries.length === 0) await this.seedDefaultCountries();

            this.data.vault = arr(rVault);
            this.data.coupons = arr(rCoupons).map(c => ({
                ...c, isActive: c.isActive === true || c.isActive === 'true' || c.is_active === true, 
                value: Number(c.value || 0), minOrder: Number(c.minOrder || 0), maxUses: Number(c.maxUses || 0), usedCount: Number(c.usedCount || 0)
            }));
            this.data.offers = arr(rOffers).map(o => ({ ...o, isActive: o.isActive === true || o.isActive === 'true', value: Number(o.value || 0) }));

            this._buildMaps();
            Object.keys(this.data).forEach(prop => { if(Array.isArray(this.data[prop])) this._updateSnapshot(prop); });

            this.isCloudSyncSuccessful = true;
            return true;

        } catch (error) {
            console.error("[TeleCard Admin] ⛔ فشل حرج في الإقلاع:", error);
            throw error;
        }
    },

    fetchWalletsLiquidityAsync: async function() {
        try {
            const result = await FirebaseAdapter.callFunction('adminGetWalletsLiquidity', {});
            
            if (result && result.success && result.data) {
                this.walletsCache = result.data;
            }
        } catch (error) {
            console.error("🚨 فشل جلب سيولة المحافظ من السيرفر:", error);
        }
        
        return this.walletsCache;
    },

    fetchDashboardStatsAsync: async function(leaderboardPeriod = 'all') {
        const nowTime = Date.now();
        const nowObj = new Date(nowTime);
        let startTime = 0; let endTime = Infinity;
        
        if (leaderboardPeriod === 'this_month') {
            startTime = Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), 1);
        } else if (leaderboardPeriod === 'last_month') {
            startTime = Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth() - 1, 1);
            endTime = Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), 1) - 1; 
        }

        const [ordAgg, depAgg, pOrd, pDep, pKyc, pComp, tUsr, bUsr, liquidity, topUsersRaw] = await Promise.all([
            FirebaseAdapter.getAggregatedStats(DB_KEYS.ORDERS, [['status', '==', 'completed']], {
                revenue: { type: 'sum', field: 'priceBaseUsd' }, profit: { type: 'sum', field: 'pricingSnapshot.netProfitUsd' }, count: { type: 'count' }
            }),
            FirebaseAdapter.getAggregatedStats(DB_KEYS.DEPOSITS, [['status', '==', 'approved']], {
                totalAmount: { type: 'sum', field: 'creditedBaseUsd' }, count: { type: 'count' }
            }),
            FirebaseAdapter.getAggregatedStats(DB_KEYS.ORDERS, [['status', 'in', ['pending', 'processing']]], { total: { type: 'count' }}),
            FirebaseAdapter.getAggregatedStats(DB_KEYS.DEPOSITS, [['status', '==', 'pending']], { total: { type: 'count' }}),
            FirebaseAdapter.getAggregatedStats(DB_KEYS.USERS, [['kycStatus', '==', 'pending']], { total: { type: 'count' }}),
            FirebaseAdapter.getAggregatedStats('telecard_reviews', [['status', '==', 'pending'], ['rating', '<=', 2]], { total: { type: 'count' }}),
            FirebaseAdapter.getAggregatedStats(DB_KEYS.USERS, [], { total: { type: 'count' }}),
            FirebaseAdapter.getAggregatedStats(DB_KEYS.USERS, [['isBanned', '==', true]], { total: { type: 'count' }}),
            this.fetchWalletsLiquidityAsync(),
            FirebaseAdapter.getRecent(DB_KEYS.USERS, 3, 'totalSpent') 
        ]);

        let topHeroes = [];
        if (leaderboardPeriod === 'all') {
            topHeroes = (topUsersRaw || []).map(u => ({
                id: u.id, displayId: u.displayId || String(u.id).substring(0, 8), name: u.fullName || u.username || 'عميل مميز', img: u.profileImage || null, spent: u.totalSpent || 0
            }));
        } else {
            const recentOrdersSnap = await FirebaseAdapter.fetchMoreWithCursor(DB_KEYS.ORDERS, [['status', '==', 'completed'], ['time', '>=', startTime], ['time', '<=', endTime]], 'time', null, 1000);
            const userMapLocal = {};
            const userNameMap = {}; 

            (recentOrdersSnap.data || []).forEach(o => {
                const uid = String(o.userId);
                userMapLocal[uid] = FinancialEngine.safeAdd(userMapLocal[uid] || 0, Number(o.priceBaseUsd || 0));
                
                if (!userNameMap[uid]) {
                    userNameMap[uid] = { 
                        name: o.userDataSnapshot?.fullName || o.userName || 'عميل',
                        displayId: o.userDataSnapshot?.displayId || uid.substring(0, 8) 
                    };
                }
            });
            
            topHeroes = Object.entries(userMapLocal)
                .sort(([, aSpent], [, bSpent]) => bSpent - aSpent).slice(0, 3)
                .map(([uid, spent]) => {
                    const u = this.data.usersMap[uid]; 
                    const fallback = userNameMap[uid] || {};
                    return { 
                        id: uid, 
                        displayId: u?.displayId || fallback.displayId || uid.substring(0, 8), 
                        name: u?.fullName || u?.username || fallback.name || 'عميل', 
                        img: u?.profileImage || null, 
                        spent: spent 
                    };
                });
        }

        const stats = {
            financials: { 
                totalRevenue: ordAgg?.revenue || 0, 
                totalProfit: ordAgg?.profit || 0,
                totalDeposits: depAgg?.totalAmount || 0,
                depositsCount: depAgg?.count || 0
            },
            orders: { completed: ordAgg?.count || 0, pending: pOrd?.total || 0, total: (ordAgg?.count || 0) + (pOrd?.total || 0) },
            deposits: { pending: pDep?.total || 0 },
            users: { total: tUsr?.total || 0, banned: bUsr?.total || 0, active: (tUsr?.total || 0) - (bUsr?.total || 0), topThree: topHeroes },
            wallets: liquidity,
            alerts: [],
            pendingCounts: { orders: pOrd?.total || 0, deposits: pDep?.total || 0, kyc: pKyc?.total || 0, complaints: pComp?.total || 0 }
        };

        this.data.vault.forEach(v => {
            const stock = Number(v.stockCount || 0);
            if (stock === 0) stats.alerts.push({ id: 'vault_empty', poolName: v.name, time: nowTime, poolId: v.id });
            else if (stock <= (v.alertLimit || 5)) stats.alerts.push({ id: 'vault_low', poolName: v.name, count: stock, time: nowTime, poolId: v.id });
        });

        if (stats.alerts.length === 0) stats.alerts.push({ id: 'security_stable', time: 0 });
        stats.alerts.sort((a, b) => parseSafeTime(b.time) - parseSafeTime(a.time));

        return stats;
    },

    fetchSalesBIAsync: async function(range = '30days') {
        try {
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(true, 'جاري تحليل ملايين السجلات عبر محرك السحابة (BI)...');
            
            const result = await FirebaseAdapter.callFunction('adminGetSalesBI', { range });
            
            if (result && result.success) {
                return result.data;
            } else {
                console.warn("السيرفر لم يرجع بيانات التحليل بشكل صحيح، ننتظر تحديث السيرفر...");
                return { rawOrders: [], revenue: 0, profit: 0, cost: 0, count: 0, categories: {}, products: {}, tiers: {} };
            }
        } catch (error) {
            console.error("🚨 Cloud BI Error:", error);
            return null;
        } finally {
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
        }
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
        
        // 🚀 [التحديث المعماري]: استخدام نظام الحزم (Batches) بدلاً من Promise.all لمنع اختناق المتصفح والشبكة
        let currentBatch = FirebaseAdapter.getBatch();
        let operationCount = 0;
        let hasAnyChanges = false;
        
        const commitAndReset = async () => {
            if (operationCount > 0) {
                await currentBatch.commit();
                currentBatch = FirebaseAdapter.getBatch();
                operationCount = 0;
            }
        };

        for (const [id, item] of currentMap.entries()) {
            const old = snapMap.get(id);
            const docRef = doc(FirebaseAdapter.db, targetCollectionKey, id);

            if (!old) {
                if (prop === 'prods' && item.isActive === undefined) item.isActive = true;
                currentBatch.set(docRef, item, { merge: true });
                operationCount++;
                hasAnyChanges = true;
            } else {
                let hasItemChanges = false;
                Object.keys(item).forEach(k => { 
                    if (k !== 'updatedAt' && !this._deepEqual(item[k], old[k])) {
                        hasItemChanges = true; 
                    }
                });

                if (hasItemChanges) { 
                    item.updatedAt = Date.now(); 
                    currentBatch.set(docRef, item, { merge: true });
                    operationCount++;
                    hasAnyChanges = true;
                }
            }
            // 🛡️ قاطع الأمان: فايربيز يرفض أكثر من 500 عملية في الحزمة الواحدة
            if (operationCount >= 400) await commitAndReset();
        }
        
        for (const [id, _] of snapMap.entries()) {
            if (!currentMap.has(id)) {
                const docRef = doc(FirebaseAdapter.db, targetCollectionKey, id);
                currentBatch.delete(docRef);
                operationCount++;
                hasAnyChanges = true;
                if (operationCount >= 400) await commitAndReset();
            }
        }
        
        // تنفيذ أي عمليات متبقية في الحزمة الأخيرة
        await commitAndReset();
        
        if (hasAnyChanges) {
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
        try {
            const result = await FirebaseAdapter.callFunction('adminForceSyncCatalog', {});
            if (result && result.success) return { success: true, message: result.message };
            return { success: false, message: 'تعذر تأكيد المزامنة من السيرفر.' };
        } catch (error) { return { success: false, message: error.message }; }
    },

    // 🚀 [درع الأمان الكلي]: الجداول الثابتة فقط هي التي تمر عبر المزامنة الجماعية (saveCollection)
    saveCountries: function() { return this.saveCollection(DB_KEYS.COUNTRIES, 'countries'); },
    saveRates: function() { return this.saveCollection(DB_KEYS.RATES, 'rates'); },
    saveCoupons: function() { return this.saveCollection(DB_KEYS.COUPONS, 'coupons'); },
    saveTiers: function() { return this.saveCollection(DB_KEYS.TIERS, 'tiers'); },
    saveProducts: function() { return this.saveCollection(DB_KEYS.PRODS, 'prods'); },
    saveCategories: function() { return this.saveCollection(DB_KEYS.CATS, 'cats'); },
    saveVault: function() { return this.saveCollection(DB_KEYS.VAULT, 'vault'); },
    savePayments: function() { return this.saveCollection(DB_KEYS.PAYMENTS, 'payments'); },
    saveBanners: function() { return this.saveCollection(DB_KEYS.BANNERS, 'banners'); },
    saveOffers: function() { return this.saveCollection(DB_KEYS.OFFERS, 'offers'); },
    
    saveSystemSettings: async function() {
        if (!this.isCloudSyncSuccessful) return false;
        try { await FirebaseAdapter.set(DB_KEYS.SETTINGS, 'singleton', this.data.settings); return true; } 
        catch (e) { return false; }
    },
        
    saveAdminProfile: async function() {
        if (!this.isCloudSyncSuccessful) return false;
        try { await FirebaseAdapter.set(DB_KEYS.ADMIN, 'singleton', this.data.adminProfile); return true; } 
        catch (e) { return false; }
    },

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
            const defaultCountry = { id: defaultCountryId, name: 'السعودية', code: 'SA', dialCode: '+966', flag: '🇸🇦', currency: 'SAR', isActive: true, createdAt: Date.now() };
            if (!Array.isArray(this.data.countries)) this.data.countries = [];
            this.data.countries.push(defaultCountry);
            await FirebaseAdapter.set(DB_KEYS.COUNTRIES, defaultCountry.id, defaultCountry);
        } finally { this.isSeedingCountries = false; }
    }
};