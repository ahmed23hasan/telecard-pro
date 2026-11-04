// ============================================================================
// 🗄️ مدير البيانات المركزي (adminData.js) - Enterprise V19.2 💎 (The Masterpiece)
// 🎯 الوظيفة: SSOT، إدارة الذاكرة بذكاء، والاستعلامات التجميعية.
// 🚀 التحديثات المعمارية (V19.2 - Zero-Leak Firewall, XSS Immunity & Schema Unification):
// 1. Zero-Leak Firewall 🧱: جلب الجدار الناري (bannedIps/Devices) من active_configs ومنع تسريبه للوثيقة العامة عند حفظ الإعدادات.
// 2. Write-Time Aggregation ⚡: استبدال جلب 5000 طلب بـ 4 قراءات (Reads) فقط لأبطال الشهر.
// 3. Zero-Read Categories BI 📊: حساب جدول الأقسام في الذاكرة من prodsMap و catsMap بـ 0 قراءات سحابية.
// 4. Isolated KYC State 🪪: حفظ kycPendingUsers في مصفوفة معزولة لمنع اختفائها عند بحث أو فرز العملاء.
// 5. Smart System Dirty-Check 🛡️: منع الكتابة الزائدة على telecard_system و telecard_settings.
// 6. Safe Nested DeleteField 🔒: حذف المفاتيح الفرعية الملغاة (مثل tierPrices) بأمان عبر set + merge.
// 7. Schema Unification 🔗: توحيد ثوابت DB_KEYS، ومعرفات الأقسام (categoryId)، وأيقونة ولون المستوى الافتراضي (icon/color).
// ============================================================================

import { DB_KEYS, normalizeRates } from './adminConfig.js';
import { Utils, EventBus } from './adminUtils.js'; 
import { FirebaseAdapter } from './core/firebaseAdapter.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { FinancialEngine } from './core/financialEngine.js';
import { doc, collection, query, where, orderBy, limit, getDocs, deleteField } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
    walletsCache: { totalUsd: 0, details: {} },
    stats: null,
    
    data: { 
        deposits: [], orders: [], users: [], kycPendingUsers: [],
        cats: [], prods: [], payments: [], banners: [], 
        settings: {}, rates: [], system: {}, adminProfile: {}, 
        tiers: [], countries: [], vault: [], coupons: [], 
        offers: [], logs: [], alerts: [], suppliers: [], 
        reviews: [], tiersStats: {}, dashboardStats: null,
        activeConfigs: {}, // 🛡️ كاش الجدار الناري
        
        usersMap: {}, prodsMap: {}, catsMap: {}, tiersMap: {}, 
        couponsMap: {}, countriesMap: {}, ratesMap: {},
        ordersMap: {}, depositsMap: {}, offersMap: {}, 
        vaultMap: {}, paymentsMap: {}, suppliersMap: {} 
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
        if (typeof obj1.toMillis === 'function' && typeof obj2.toMillis === 'function') return obj1.toMillis() === obj2.toMillis();
        
        if (Array.isArray(obj1) && Array.isArray(obj2)) {
            if (obj1.length !== obj2.length) return false;
            for (let i = 0; i < obj1.length; i++) {
                if (!this._deepEqual(obj1[i], obj2[i])) return false;
            }
            return true;
        }

        if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

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
        if (prop === 'users') {
            const mapObj = Object.fromEntries(arr.map(u => [String(u.id), u]));
            if (Array.isArray(this.data.kycPendingUsers)) {
                this.data.kycPendingUsers.forEach(ku => {
                    if (ku && ku.id && !mapObj[String(ku.id)]) mapObj[String(ku.id)] = ku;
                });
            }
            this.data.usersMap = mapObj;
        }
        else if (prop === 'prods') this.data.prodsMap = Object.fromEntries(arr.map(p => [String(p.id), p]));
        else if (prop === 'cats') this.data.catsMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
        else if (prop === 'tiers') this.data.tiersMap = Object.fromEntries(arr.map(t => [String(t.id), t]));
        else if (prop === 'coupons') this.data.couponsMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
        else if (prop === 'orders') this.data.ordersMap = Object.fromEntries(arr.map(o => [String(o.id), o]));
        else if (prop === 'deposits') this.data.depositsMap = Object.fromEntries(arr.map(d => [String(d.id), d]));
        else if (prop === 'offers') this.data.offersMap = Object.fromEntries(arr.map(o => [String(o.id), o])); 
        else if (prop === 'vault') this.data.vaultMap = Object.fromEntries(arr.map(v => [String(v.id), v])); 
        else if (prop === 'payments') this.data.paymentsMap = Object.fromEntries(arr.map(p => [String(p.id), p])); 
        else if (prop === 'suppliers') this.data.suppliersMap = Object.fromEntries(arr.map(s => [String(s.id), s])); 
        else if (prop === 'rates') this.data.ratesMap = Object.fromEntries(arr.map(r => [String(r.code).toUpperCase(), r]));
        else if (prop === 'countries') this.data.countriesMap = Object.fromEntries(arr.map(c => [String(c.id), c]));
    },    
    
    _buildMaps: function() {
        const mapsToBuild = ['users', 'prods', 'cats', 'tiers', 'coupons', 'countries', 'rates', 'orders', 'deposits', 'offers', 'vault', 'payments', 'suppliers']; 
        mapsToBuild.forEach(prop => this._buildSingleMap(prop));
    },
    
    _updateSnapshot: function(prop) {
        try { this._snapshots[prop] = structuredClone(this.data[prop]); } 
        catch (e) { this._snapshots[prop] = JSON.parse(JSON.stringify(this.data[prop])); }
    },

    loadData: async function(adminUid) {
        console.log("🚀 [TeleCard Admin] إقلاع السحابة... جاري تطبيق استراتيجية التوازي القياسية (Promise.allSettled)...");
        this.isCloudSyncSuccessful = false;

        const arr = v => Array.isArray(v) ? v.filter(Boolean) : [];
        const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

        try {
            // 🚀 [الإصلاح المعماري 1: Zero-Leak Firewall] - إضافة active_configs لقراءة الجدار الناري
            const staticPromises = [
                FirebaseAdapter.getAll(DB_KEYS.RATES), FirebaseAdapter.getAll(DB_KEYS.TIERS), FirebaseAdapter.getAll(DB_KEYS.CATS), 
                FirebaseAdapter.getAll(DB_KEYS.PRODS), FirebaseAdapter.getAll(DB_KEYS.PAYMENTS), FirebaseAdapter.getAll(DB_KEYS.BANNERS), 
                FirebaseAdapter.getById(DB_KEYS.SETTINGS, 'singleton'), FirebaseAdapter.getById(DB_KEYS.POPUP, 'singleton'), FirebaseAdapter.getById(DB_KEYS.SYSTEM, 'singleton'), 
                FirebaseAdapter.getById(DB_KEYS.ADMIN, adminUid || 'singleton'), 
                FirebaseAdapter.getAll(DB_KEYS.COUNTRIES), FirebaseAdapter.getAll(DB_KEYS.VAULT), 
                FirebaseAdapter.getAll(DB_KEYS.COUPONS), FirebaseAdapter.getAll(DB_KEYS.OFFERS), FirebaseAdapter.getAll(DB_KEYS.SUPPLIERS),
                FirebaseAdapter.getAll(DB_KEYS.REVIEWS, 500),
                FirebaseAdapter.getAll('telecard_statistics/all_time/tiers', 100),
                FirebaseAdapter.getById(DB_KEYS.SYSTEM, 'active_configs') 
            ];

        const dynamicPromises = [
    FirebaseAdapter.callFunction('adminGetUsersList', { limit: 50 }),
    FirebaseAdapter.callFunction('adminGetOrdersList', { limit: 50 }),
    FirebaseAdapter.callFunction('adminGetDepositsList', { limit: 50 }),
    FirebaseAdapter.callFunction('adminGetLogsList', { limit: 50 }),
    FirebaseAdapter.fetchMoreWithCursor(DB_KEYS.ALERTS, [], 'time', null, 50),
    getDocs(query(collection(FirebaseAdapter.db, DB_KEYS.USERS), where('kycStatus', '==', 'pending'), limit(200))),
    FirebaseAdapter.callFunction('adminGetDashboardStats', { leaderboardPeriod: 'all' }),
    this.fetchWalletsLiquidityAsync()
];            const [staticResults, dynamicResults] = await Promise.all([
                Promise.allSettled(staticPromises),
                Promise.allSettled(dynamicPromises)
            ]);

            const extract = (res, fallback) => res.status === 'fulfilled' && res.value ? res.value : fallback;
            const extractCloud = (res) => (res.status === 'fulfilled' && res.value && res.value.success) ? res.value : { data: [], pagination: null };

            const rRates = extract(staticResults[0], []);
            const rTiers = extract(staticResults[1], []);
            const rCats = extract(staticResults[2], []);
            const rProds = extract(staticResults[3], []);
            const rPayments = extract(staticResults[4], []);
            const rBanners = extract(staticResults[5], []);
            const rSettings = extract(staticResults[6], {});
            const rNotif = extract(staticResults[7], {});
            const rSystem = extract(staticResults[8], {});
            const rAdmin = extract(staticResults[9], {});
            const rCountries = extract(staticResults[10], []);
            const rVault = extract(staticResults[11], []);
            const rCoupons = extract(staticResults[12], []);
            const rOffers = extract(staticResults[13], []);
            const rSuppliers = extract(staticResults[14], []);
            const rReviews = extract(staticResults[15], []);
            const rTiersStatsList = extract(staticResults[16], []);
            const rActiveConfigs = extract(staticResults[17], {}); // 🛡️ استخراج الكاش السري

            const rUsersCloud = extractCloud(dynamicResults[0]);
            const rOrdersCloud = extractCloud(dynamicResults[1]);
            const rDepositsCloud = extractCloud(dynamicResults[2]);
            const rLogsCloud = extractCloud(dynamicResults[3]);
            const rAlertsObj = extract(dynamicResults[4], { data: [], newLastDoc: null });
            
            const rKycUsersSnap = extract(dynamicResults[5], { docs: [] });
            const rKycUsers = rKycUsersSnap.docs ? rKycUsersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];

            this.cursors.users = rUsersCloud.pagination?.lastDocId || null;
            this.cursors.orders = rOrdersCloud.pagination || null;
            this.cursors.deposits = rDepositsCloud.pagination || null;
            this.cursors.logs = rLogsCloud.pagination || null;
            this.cursors.alerts = rAlertsObj.newLastDoc;

            const normalizedRatesMap = typeof normalizeRates === 'function' ? normalizeRates(rRates) : rRates;
            this.data.rates = Array.isArray(normalizedRatesMap) ? normalizedRatesMap : Object.values(normalizedRatesMap || {});
            
            this.data.settings = obj(rSettings);
            
            // 🛡️ [الإصلاح المعماري 1] دمج الجدار الناري من الكاش السري إلى الذاكرة المحلية حتى تقرأه لوحة القيادة بنجاح
            const activeConfObj = obj(rActiveConfigs);
            this.data.activeConfigs = activeConfObj;
            this.data.settings.bannedIps = Array.isArray(activeConfObj.bannedIps)
                ? activeConfObj.bannedIps
                : (Array.isArray(this.data.settings.bannedIps) ? this.data.settings.bannedIps : []);
            this.data.settings.bannedDevices = Array.isArray(activeConfObj.bannedDevices)
                ? activeConfObj.bannedDevices
                : (Array.isArray(this.data.settings.bannedDevices) ? this.data.settings.bannedDevices : []);

            this.data.system = obj(rSystem);
            this.data.adminProfile = obj(rAdmin);
            
            // 👈 بناء خريطة أرباح وإيرادات المستويات من المجموعة الفرعية
            this.data.tiersStats = Object.fromEntries(
                arr(rTiersStatsList).map(ts => [String(ts.id), {
                    profit: Number(ts.profit || 0),
                    revenue: Number(ts.revenue || 0),
                    count: Number(ts.count || 0)
                }])
            );
            
            this.data.tiers = arr(rTiers).map(t => ({
                ...t, 
                threshold: Number(t.threshold || 0),
                isDefault: !!t.isDefault,
                profitPercent: Number(t.profitPercent ?? 5),
                minProfitUsd: Number(t.minProfitUsd ?? 0)
            }));

            if(this.data.tiers.length === 0 || !this.data.tiers.some(t => t.isDefault)) await this.seedDefaultTiers();

            // 🪪 حفظ طلبات التوثيق المعلقة في مصفوفة معزولة لضمان عدم فقدانها عند بحث أو فرز العملاء
            this.data.kycPendingUsers = arr(rKycUsers).map(u => ({
                ...u, 
                walletBalance: Number(u.walletBalance ?? 0), 
                baseCurrency: String(u.baseCurrency || 'USD').toUpperCase()
            }));

            const combinedUsersMap = new Map();
            arr(rUsersCloud.data).forEach(u => combinedUsersMap.set(String(u.id), u));
            this.data.kycPendingUsers.forEach(u => combinedUsersMap.set(String(u.id), u)); 

            this.data.users = Array.from(combinedUsersMap.values()).map(u => ({
                ...u, 
                walletBalance: Number(u.walletBalance ?? 0), 
                baseCurrency: String(u.baseCurrency || 'USD').toUpperCase()
            }));

            this.data.prods = arr(rProds).map(p => ({
                ...p, 
                costPrice: Number(p.costPrice || 0), 
                price: Number(p.price || 0), 
                isFixedPrice: !!p.isFixedPrice,
                requiresAdminAttention: !!p.requiresAdminAttention, 
                syncNote: p.syncNote || '' 
            }));

            this.data.deposits = arr(rDepositsCloud.data);
            this.data.orders = arr(rOrdersCloud.data); 
            this.data.logs = arr(rLogsCloud.data);
this.data.systemErrors = arr(rLogsCloud.systemErrors);
            this.data.alerts = arr(rAlertsObj.data);
            this.data.cats = arr(rCats);
            this.data.suppliers = arr(rSuppliers); 
            this.data.reviews = arr(rReviews);
            
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
                ...c, 
                isActive: c.isActive === true || c.isActive === 'true', 
                value: Number(c.value || 0), 
                minOrder: Number(c.minOrder || 0), 
                maxUses: Number(c.maxUses || 0), 
                usedCount: Number(c.usedCount || 0)
            }));
            
            this.data.offers = arr(rOffers).map(o => ({ ...o, isActive: o.isActive === true || o.isActive === 'true', value: Number(o.value || 0) }));

            this._buildMaps();
            Object.keys(this.data).forEach(prop => {
                if (Array.isArray(this.data[prop]) || prop === 'system' || prop === 'settings') {
                    this._updateSnapshot(prop);
                }
            });

            this._preloadedDashRaw = {
                dashSettled: dynamicResults[6],
                walletsSettled: dynamicResults[7]
            };
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
        let stats = null;

        let dashResSettled, walletsResSettled;
        if (this._preloadedDashRaw && leaderboardPeriod === 'all') {
            dashResSettled = this._preloadedDashRaw.dashSettled;
            walletsResSettled = this._preloadedDashRaw.walletsSettled;
            this._preloadedDashRaw = null;
        } else {
            [dashResSettled, walletsResSettled] = await Promise.allSettled([
                FirebaseAdapter.callFunction('adminGetDashboardStats', { leaderboardPeriod }),
                this.fetchWalletsLiquidityAsync()
            ]);
        }

        if (dashResSettled && dashResSettled.status === 'fulfilled' && dashResSettled.value && dashResSettled.value.success && dashResSettled.value.data) {
            stats = dashResSettled.value.data;
        } else {
            console.warn("⚠️ تعذر الاتصال بدالة adminGetDashboardStats (ربما لم تُرفع الدوال بعد):", dashResSettled?.reason?.message);
            stats = {
                _isOfflineFallback: true,
                financials: { totalRevenue: 0, totalProfit: 0, totalCost: 0, frozenAssetsUsd: 0, apiProfit: 0, retailProfit: 0, vaultProfit: 0, manualProfit: 0, supplierProfit: 0 },
                orders: { total: 0, completed: 0, pending: 0, rejected: 0, refunded: 0, apiCount: 0, retailCount: 0 },
                deposits: { totalAmount: 0, approvedCount: 0, pending: 0, rejected: 0, refunded: 0, adminCount: 0 },
                users: { total: 0, banned: 0, activeMonth: 0, topThree: [], mostActiveUsers: [], bannedIps: 0, bannedDevices: 0 },
                pendingCounts: { orders: 0, deposits: 0, kyc: 0, complaints: 0 },
                systemAlerts: []
            };
        }

        stats.wallets = (walletsResSettled && walletsResSettled.status === 'fulfilled' && walletsResSettled.value)
            ? walletsResSettled.value
            : { totalUsd: 0, details: {} };        
        const activeConf = this.data.activeConfigs || {};
        const sysSettings = this.data.settings || {};
        const liveBannedIps = Array.isArray(activeConf.bannedIps) ? activeConf.bannedIps : (Array.isArray(sysSettings.bannedIps) ? sysSettings.bannedIps : []);
        const liveBannedDevices = Array.isArray(activeConf.bannedDevices) ? activeConf.bannedDevices : (Array.isArray(sysSettings.bannedDevices) ? sysSettings.bannedDevices : []);
        stats.users.bannedIps = liveBannedIps.length;
        stats.users.bannedDevices = liveBannedDevices.length;
        
        stats.alerts = [];
        try {
            if (Array.isArray(this.data.vault)) {
                this.data.vault.forEach(v => {
                    const stock = Number(v.stockCount || 0);
                    if (stock === 0) stats.alerts.push({ id: 'vault_empty', poolName: v.name, time: nowTime, poolId: v.id });
                    else if (stock <= (v.alertLimit || 5)) stats.alerts.push({ id: 'vault_low', poolName: v.name, count: stock, time: nowTime, poolId: v.id });
                });
            }
        } catch(e) { console.error("Vault Alert Error:", e); }

        stats.alerts.sort((a, b) => parseSafeTime(b.time) - parseSafeTime(a.time));
        this.data.dashboardStats = stats;
        this.stats = stats;

        if (stats.pendingCounts) {
            window.AdminUI?.UsersUI?.updateSidebarKycBadge?.(Number(stats.pendingCounts.kyc || 0));
            const bDep = document.getElementById('badge-dep');
            const bOrd = document.getElementById('badge-ord');
            const dCount = Number(stats.pendingCounts.deposits || 0);
            const oCount = Number(stats.pendingCounts.orders || 0);
            
            if (bDep) {
                if (dCount > 0) { bDep.innerText = Utils.enNum(dCount); bDep.classList.add('active'); bDep.classList.remove('hide-element'); }
                else { bDep.classList.remove('active'); bDep.classList.add('hide-element'); }
            }
            
            if (bOrd) {
                if (oCount > 0) { bOrd.innerText = Utils.enNum(oCount); bOrd.classList.add('active'); bOrd.classList.remove('hide-element'); }
                else { bOrd.classList.remove('active'); bOrd.classList.add('hide-element'); }
            }
        }

        return stats;        
    },
    
    fetchSalesBIAsync: async function(range = '30days') {
        try {
            const result = await FirebaseAdapter.callFunction('adminGetSalesBI', { range });
            if (result && result.success && (result.data || result.curr)) {
                const biPayload = result.data || {
                    range: result.range || range,
                    curr: result.curr,
                    prev: result.prev || { revenue: 0, profit: 0, cost: 0, count: 0 }
                };

                if (biPayload.curr) {
                    const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

                    if (biPayload.curr.products && typeof biPayload.curr.products === 'object') {
                        const catsAgg = {};
                        Object.entries(biPayload.curr.products).forEach(([pId, pStats]) => {
                            const prodObj = this.data.prodsMap?.[pId];
                            if (prodObj && prodObj.name) {
                                pStats.name = prodObj.name;
                            }
                            // 📌 [توحيد معماري]: المعرف القياسي للقسم هو categoryId (أو مصفوفة categoryIds)
                            const catId = prodObj?.categoryId || (Array.isArray(prodObj?.categoryIds) && prodObj.categoryIds[0]) || 'uncategorized';                            
                            const catName = this.data.catsMap?.[catId]?.name || 'أقسام عامة';
                            
                            if (!catsAgg[catId]) {
                                catsAgg[catId] = { id: catId, name: catName, count: 0, revenue: 0, profit: 0 };
                            }
                            catsAgg[catId].count += Number(pStats.count || 0);
                            catsAgg[catId].revenue = round(catsAgg[catId].revenue + Number(pStats.revenue || 0));
                            catsAgg[catId].profit = round(catsAgg[catId].profit + Number(pStats.profit || 0));
                        });
                        if (!biPayload.curr.categories || Object.keys(biPayload.curr.categories).length === 0) {
                            biPayload.curr.categories = catsAgg;
                        }
                    }

                    if (biPayload.curr.tiers && typeof biPayload.curr.tiers === 'object') {
                        Object.entries(biPayload.curr.tiers).forEach(([tId, tStats]) => {
                            const tierObj = this.data.tiersMap?.[tId];
                            if (tierObj && (tierObj.nameAr || tierObj.name)) {
                                tStats.name = tierObj.nameAr || tierObj.name;
                            }
                        });
                    }
                }

                return biPayload;
            }

            throw new Error("لم يتم استلام بيانات صحيحة من السيرفر");

        } catch (error) {
            console.error("🚨 التحليل السحابي انهار:", error);
            return {
                curr: { revenue: 0, profit: 0, cost: 0, count: 0, categories: {}, products: {}, tiers: {}, daily: {}, sources: { api: 0, vault: 0, supplier: 0, manual: 0 } },
                prev: { revenue: 0, profit: 0, cost: 0, count: 0 }
            };
        }
    },

    // 🛡️ دالة مساعدة لحقن deleteField() داخل الكائنات الفرعية (مثل tierPrices و currencySettings) عند استخدام set + merge
    _buildSafeMergeObject: function(newVal, oldVal) {
        if (!newVal || typeof newVal !== 'object' || Array.isArray(newVal) || typeof newVal.toMillis === 'function') {
            return newVal;
        }
        if (!oldVal || typeof oldVal !== 'object' || Array.isArray(oldVal)) {
            return newVal;
        }
        const merged = { ...newVal };
        Object.keys(oldVal).forEach(subKey => {
            if (newVal[subKey] === undefined || !(subKey in newVal)) {
                merged[subKey] = deleteField();
            } else if (
                typeof newVal[subKey] === 'object' && newVal[subKey] !== null && !Array.isArray(newVal[subKey]) &&
                typeof oldVal[subKey] === 'object' && oldVal[subKey] !== null && !Array.isArray(oldVal[subKey])
            ) {
                merged[subKey] = this._buildSafeMergeObject(newVal[subKey], oldVal[subKey]);
            }
        });
        return merged;
    },

    saveCollection: async function(key, prop) {
        if (!this.isCloudSyncSuccessful) return false;
        
        const targetCollectionKey = (prop === 'prods') ? DB_KEYS.PRODS : key;
        const currentArr = this.data[prop] || [];
        const snapArr = this._snapshots[prop] || [];
        
        const validCurrentArr = currentArr.filter(Boolean);
        const currentMap = new Map(validCurrentArr.map(i => {
            if (!i.id) i.id = i.code || Utils.generateID(); 
            return [String(i.id), i];
        }));
        
        const validSnapArr = snapArr.filter(Boolean);
        const snapMap = new Map(validSnapArr.map(i => [String(i.id), i]));
        
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
                let updatePayload = {}; 

                Object.keys(item).forEach(k => { 
                    if (k === 'updatedAt' || item[k] === undefined) return;
                    let isChanged = false;
                    if (typeof item[k] === 'object' && item[k] !== null) {
                        isChanged = !this._deepEqual(item[k], old[k]);
                    } else {
                        isChanged = item[k] !== old[k];
                    }
                    if (isChanged) {
                        hasItemChanges = true; 
                        updatePayload[k] = this._buildSafeMergeObject(item[k], old[k]); 
                    }
                });

                Object.keys(old).forEach(k => {
                    if (k !== 'updatedAt' && (item[k] === undefined || !(k in item))) {
                        hasItemChanges = true;
                        updatePayload[k] = deleteField(); 
                    }
                });

                if (hasItemChanges) { 
                    updatePayload.updatedAt = Date.now(); 
                    currentBatch.set(docRef, updatePayload, { merge: true });
                    operationCount++;
                    hasAnyChanges = true;
                }
            }
            if (operationCount >= 400) await commitAndReset();
        }
        
        for (const [oldId] of snapMap.entries()) {
            if (!currentMap.has(oldId)) {
                currentBatch.delete(doc(FirebaseAdapter.db, targetCollectionKey, oldId));
                operationCount++;
                hasAnyChanges = true;
                if (operationCount >= 400) await commitAndReset();
            }
        }

        await commitAndReset();
        
        // ⚡ تحديث الإعدادات فقط للجداول التي لا تملك تريجر كاش مستقل في السيرفر لمنع الكتابة المزدوجة
        if (hasAnyChanges) {
            if (['cats', 'banners', 'countries'].includes(prop)) {
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
    saveSuppliers: function() { return this.saveCollection(DB_KEYS.SUPPLIERS, 'suppliers'); }, 
    
    // 🚀 [الإصلاح المعماري 1] منع تسريب قوائم الجدار الناري إلى الوثيقة العامة عند الحفظ
    saveSystemSettings: async function() {
        if (!this.isCloudSyncSuccessful) return false;
        try {
            if (!this.data.settings) this.data.settings = {};
            this.data.settings.updatedAt = Date.now();
            
            // 🛡️ فصل قوائم الجدار الناري عن الوثيقة العامة لمنع تسريبها للزوار
            const { bannedIps, bannedDevices, ...publicSettingsPayload } = this.data.settings;
            await FirebaseAdapter.set(DB_KEYS.SETTINGS, 'singleton', publicSettingsPayload);
            
            this._updateSnapshot('settings');

            // 🛡️ عدم الكتابة على وثيقة حالة النظام (الصيانة/التجميد) إلا إذا تغيرت فعلياً
            if (
                this.data.system &&
                Object.keys(this.data.system).length > 0 &&
                !this._deepEqual(this.data.system, this._snapshots.system)
            ) {
                await FirebaseAdapter.set(DB_KEYS.SYSTEM, 'singleton', this.data.system);
                this._updateSnapshot('system');
            }
            return true;
        } catch (e) { return false; }
    },
        
    saveAdminProfile: async function(adminUid) {
        if (!this.isCloudSyncSuccessful) return false;
        try { await FirebaseAdapter.set(DB_KEYS.ADMIN, adminUid || 'singleton', this.data.adminProfile); return true; } 
        catch (e) { return false; }
    },

    addLog: async function(action, details) {
        try {
            const newLog = {
                id: 'LOG_' + Utils.generateID(),
                adminUid: this.data.adminProfile?.name || 'الإدارة',
                action: String(action || ''),
                details: String(details || ''),
                timestamp: Date.now()
            };
            if (!Array.isArray(this.data.logs)) this.data.logs = [];
            this.data.logs.unshift(newLog);
        } catch (e) {}
    },

    seedDefaultTiers: async function() {
        if (this.isSeedingTiers) return;
        this.isSeedingTiers = true;
        try {
            const defaultTierId = 'TIER_DEFAULT'; 
            if (this.data.tiers.some(t => String(t.id) === defaultTierId || t.isDefault)) return;
            const defaultTier = { id: defaultTierId, name: 'عضو جديد', nameAr: 'عضو جديد', type: 'retail', icon: 'fa-user', color: '#FFD700', isDefault: true, threshold: 0, durationDays: 0, profitPercent: 5, minProfitUsd: 0, autoAdvance: true, createdAt: Date.now() };
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
