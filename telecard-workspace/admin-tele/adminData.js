// ============================================================================
// 🗄️ مدير البيانات المركزي (adminData.js) - النسخة الماسية V9.2 💎
// 🎯 الوظيفة: SSOT (المصدر الوحيد للحقيقة)، معالجة البيانات الضخمة، والبحث اللحظي
// 👑 متوافق بالكامل مع هوية: TeleCard
// 🚀 التحديث الأقصى: 
// 1. [O(1) Hash Maps]: جداول بحث فائقة السرعة.
// 2. [Deep Clone Optimization]: استخدام structuredClone لتخفيف العبء عن الـ RAM.
// 3. [Dynamic Map Updates]: إعادة بناء الخرائط الفردية (Targeted Updates) لتوفير الموارد.
// 4. [Seed Restore 🛡️]: استعادة وتأمين دالة توليد الدول الافتراضية لمنع انهيار البداية الباردة.
// 5. [Vault Radar Fix]: توافق رادار المخزون مع نظام الموردين السحابي (Subcollections).
// ============================================================================

import { DB_KEYS, normalizeRates } from './adminConfig.js';
import { Utils, EventBus } from './adminUtils.js'; 
import { FirebaseAdapter } from './core/firebaseAdapter.js';
import { RenderHelpers } from './core/renderHelpers.js';

export const AdminData = {
    isCloudSyncSuccessful: false,
    isSeedingTiers: false, 
    isSeedingCountries: false, 
// 🏗️ الهيكل: المصفوفات للرسم (UI) والخرائط للعمليات المنطقية (Logic)
    data: { 
        deposits: [], orders: [], users: [], cats: [], prods: [], 
        payments: [], banners: [], settings: {}, rates: [], 
        system: {}, adminProfile: {}, tiers: [], countries: [], 
        vault: [], coupons: [], offers: [], logs: [], alerts: [], kyc: [],
        
        // 🗺️ جداول البحث السريع (Hash Maps) - سرعة O(1)
        usersMap: {}, prodsMap: {}, catsMap: {}, tiersMap: {}, 
        couponsMap: {}, countriesMap: {}, ratesMap: {},
        ordersMap: {}, depositsMap: {} // 🛡️ [تحديث]: إضافة الخرائط المالية المفقودة
    },
    
    filters: {
        deposits: { search: '', start: null, end: null },
        orders: { search: '', start: null, end: null }
    },

    _snapshots: {},

    // 🛡️ [تحديث أمني V9.3]: تحديث خريطة محددة مستهدفة (Targeted Map Rebuild) لمنع هدر الـ RAM
    _buildSingleMap: function(prop) {
        if (prop === 'users') {
            this.data.usersMap = Object.fromEntries(this.data.users.map(u => [String(u.id), u]));
        } else if (prop === 'prods') {
            this.data.prodsMap = Object.fromEntries(this.data.prods.map(p => [String(p.id), p]));
        } else if (prop === 'cats') {
            this.data.catsMap = Object.fromEntries(this.data.cats.map(c => [String(c.id), c]));
        } else if (prop === 'tiers') {
            this.data.tiersMap = Object.fromEntries(this.data.tiers.map(t => [String(t.id), t]));
        } else if (prop === 'coupons') {
            this.data.couponsMap = Object.fromEntries(this.data.coupons.map(c => [String(c.code).toUpperCase(), c]));
        } else if (prop === 'countries') {
            this.data.countriesMap = Object.fromEntries(this.data.countries.map(c => [String(c.id), c]));
        } else if (prop === 'rates') {
            this.data.ratesMap = Object.fromEntries(this.data.rates.map(r => [String(r.code).toUpperCase(), r]));
        } else if (prop === 'orders') {
            // 🛡️ بناء خريطة المشتريات فورا
            this.data.ordersMap = Object.fromEntries(this.data.orders.map(o => [String(o.id), o]));
        } else if (prop === 'deposits') {
            // 🛡️ بناء خريطة الإيداعات فورا
            this.data.depositsMap = Object.fromEntries(this.data.deposits.map(d => [String(d.id), d]));
        }
    },    // 🛡️ بناء جميع الخرائط دفعة واحدة (تستدعى عند الإقلاع والبداية الباردة فقط)
    _buildMaps: function() {
        const mapsToBuild = ['users', 'prods', 'cats', 'tiers', 'coupons', 'countries', 'rates', 'orders', 'deposits'];
        mapsToBuild.forEach(prop => this._buildSingleMap(prop));
    },
    // 🛡️ التحديث: تقليل الضغط على المعالج باستخدام structuredClone 
    _updateSnapshot: function(prop) {
        try {
            this._snapshots[prop] = structuredClone(this.data[prop]);
        } catch (e) {
            this._snapshots[prop] = JSON.parse(JSON.stringify(this.data[prop]));
        }
    },

    // ==========================================
    // 🛠️ 1. محرك جلب البيانات الذكي (Massive Fetch V2)
    // ==========================================
    loadData: async function() {
        console.log("🚀 [TeleCard Admin] جاري حقن البيانات بنظام الجداول O(1)...");
        this.isCloudSyncSuccessful = false;
        let hasCriticalFailure = false; 

        const arr = v => Array.isArray(v) ? v : [];
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

        try {
            const results = await Promise.all([
                fetchArray(DB_KEYS.RATES), fetchArray(DB_KEYS.TIERS), fetchRecent(DB_KEYS.USERS, 200, 'createdAt'),
                fetchRecent(DB_KEYS.DEPOSITS, 150, 'time'), fetchRecent(DB_KEYS.ORDERS, 150, 'time'),
                fetchArray(DB_KEYS.CATS), fetchArray(DB_KEYS.PRODS), fetchArray(DB_KEYS.PAYMENTS),
                fetchArray(DB_KEYS.BANNERS), fetchSingleton(DB_KEYS.SETTINGS), fetchSingleton(DB_KEYS.POPUP),
                fetchSingleton(DB_KEYS.SYSTEM), fetchSingleton(DB_KEYS.ADMIN), fetchArray(DB_KEYS.COUNTRIES),
                fetchArray(DB_KEYS.VAULT), fetchArray(DB_KEYS.COUPONS), fetchArray(DB_KEYS.OFFERS),
                fetchRecent(DB_KEYS.LOGS, 50, 'timestamp'), fetchRecent(DB_KEYS.ALERTS, 50, 'time'),
                fetchArray(DB_KEYS.KYC)
            ]);

            const [
                rRates, rTiers, rUsers, rDeposits, rOrders, rCats, rProds, rPayments, 
                rBanners, rSettings, rNotif, rSystem, rAdmin, rCountries, rVault, 
                rCoupons, rOffers, rLogs, rAlerts, rKyc
            ] = results;

            // 🌟 توحيد البيانات الخام وتحويلها لمصفوفات نظيفة
            const availableRates = normalizeRates(rRates);
            this.data.rates = availableRates;
            this.data.settings = obj(rSettings);
            this.data.system = obj(rSystem);
            this.data.adminProfile = obj(rAdmin);
            
            // 🛡️ معالجة المستويات (Tiers) وتوحيد الحقول
            this.data.tiers = arr(rTiers).map(t => ({
                ...t, 
                threshold: Number(t.threshold || t.condition_amount || 0),
                isDefault: !!(t.isDefault || t.is_default),
                profit_percent: Number(t.profit_percent ?? 5),
                min_profit_usd: Number(t.min_profit_usd ?? 0)
            }));

            if(this.data.tiers.length === 0 || !this.data.tiers.some(t => t.isDefault)) await this.seedDefaultTiers();

            // 🛡️ معالجة المستخدمين (Users)
            this.data.users = arr(rUsers).map(u => ({
                ...u,
                walletBalance: Number(u.walletBalance ?? u.balance ?? 0),
                baseCurrency: (u.baseCurrency || u.base_currency || 'USD').toUpperCase()
            }));

            // 🛡️ معالجة المنتجات (Products)
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
                const allowed = new Set(availableRates.map(c => c.code.toUpperCase()));
                const arrVal = Array.isArray(val) ? val : String(val || '').split(',');
                const out = []; const seen = new Set();
                arrVal.map(c => (c || '').trim().toUpperCase()).forEach(c => {
                    if(c && allowed.has(c) && !seen.has(c)) { seen.add(c); out.push(c); }
                });
                return out.length ? out : [];
            };

            // 🛡️ معالجة طرق الدفع وتوحيد العملات
            this.data.payments = arr(rPayments).map(p => ({
                ...p, 
                currencies: normalizeCurrencyList(p.currencies).join(',') 
            }));

            this.data.banners = arr(rBanners);
            this.data.notif = obj(rNotif);
            
            // 🛡️ معالجة الدول وتأمين الحقول الافتراضية
            this.data.countries = arr(rCountries).map(c => ({
                ...c, 
                name: c.name || c.nameAr || 'دولة جديدة', 
                flag: c.flag || c.flagEmoji || '🌍', 
                currency: c.currency || 'USD', 
                dialCode: c.dialCode || '+00', 
                code: c.code || c.id || 'XX' 
            }));

            // 🛡️ تفعيل الدرع: التحقق وتوليد الدولة الافتراضية إذا كانت القاعدة فارغة (Cold Start)
            if (this.data.countries.length === 0) {
                await this.seedDefaultCountries();
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
            this.data.kyc = rKyc;

            // ⚡ السحر المعماري: بناء جداول البحث O(1)
            this._buildMaps();

            // حفظ لقطة للمقارنة (Diffing Snapshots)
            Object.keys(this.data).forEach(prop => { if(Array.isArray(this.data[prop])) this._updateSnapshot(prop); });

            this.isCloudSyncSuccessful = true;
            await this.autoAdvanceSweep();
            return true;

        } catch (error) {
            console.error("[TeleCard Admin] ⛔ فشل حرج في مزامنة البيانات:", error);
            throw error;
        }
    },

    // ==========================================
    // 📊 محرك الإحصائيات المطور (Stats Engine O(1))
    // ==========================================
    getFilteredSalesStats: function(range = 'all') {
        const orders = (this.data.orders || []).filter(o => o.status === 'completed');
        const now = Date.now();
        let startTime = 0;

        if (range === '7days') startTime = now - (7 * 86400000);
        else if (range === '30days') startTime = now - (30 * 86400000);

        const filteredOrders = range === 'all' ? orders : orders.filter(o => RenderHelpers.parseTime(o.time) >= startTime);

        let revenue = 0, profit = 0, cost = 0;
        let cats = {}, prods = {};

        filteredOrders.forEach(o => {
            const snap = o.pricingSnapshot;
            const rev = Number(snap?.finalPriceUsd || o.price || 0);
            const prof = Number(snap?.netProfitUsd || snap?.profit || 0);
            const cst = Number(snap?.costUsd || (rev - prof));

            revenue += rev; profit += prof; cost += cst;

            // ⚡ استخدام البحث السريع O(1) من الخريطة 
            const pData = this.data.prodsMap[o.prodId];
            const catId = pData?.catId || o.catId || 'root';

            if (!cats[catId]) {
                const catObj = this.data.catsMap[catId];
                cats[catId] = { name: catObj?.name || 'قسم غير معرف', revenue: 0, profit: 0, count: 0 };
            }
            cats[catId].revenue += rev; cats[catId].profit += prof; cats[catId].count++;

            if (!prods[o.prodId]) {
                prods[o.prodId] = { name: pData?.name || o.product || 'منتج محذوف', revenue: 0, profit: 0, count: 0 };
            }
            prods[o.prodId].revenue += rev; prods[o.prodId].profit += prof; prods[o.prodId].count++;
        });

        return { revenue, profit, cost, count: filteredOrders.length, categories: cats, products: prods };
    },

    getDashboardStats: function(leaderboardPeriod = 'all') {
        const d = this.data;
        const nowTime = Date.now();
        const sysStats = d.system?.globalStats || {};
        
        const stats = {
            financials: sysStats.financials || { totalRevenue: 0, totalProfit: 0, totalCost: 0 },
            orders: sysStats.orders || { total: 0, completed: 0, rejected: 0 },
            deposits: sysStats.deposits || { total: 0, approved: 0 },
            users: { total: d.users.length, banned: 0, active: 0, topThree: [] },
            wallets: this.getWalletsLiquidity(),
            alerts: []
        };

        // 🛡️ رادار الأمان والعمليات (O(1) Alerts)
        d.users.forEach(u => u.isBanned ? stats.users.banned++ : stats.users.active++);

        // 1. رادار الكوبونات (آخر 48 ساعة)
        const recentTime = nowTime - 172800000;
        d.orders.filter(o => o.status === 'completed' && o.couponCode && RenderHelpers.parseTime(o.time) > recentTime).forEach(o => {
            const u = this.data.usersMap[o.userId];
            stats.alerts.push({ id: 'coupon_used', code: o.couponCode, user: u?.username || u?.fullName || 'عميل', time: o.time });
        });

        // 2. رادار المخزون (الخزنة المركزية المتوافق مع Subcollections)
        d.vault.forEach(v => {
            // 🛡️ التحديث: قراءة stockCount المحدث من السيرفر مباشرة
            const stock = Number(v.stockCount || v.codes?.length || 0); 
            if (stock === 0) stats.alerts.push({ id: 'vault_empty', poolName: v.name, time: nowTime });
            else if (stock <= (v.alertLimit || 5)) stats.alerts.push({ id: 'vault_low', poolName: v.name, count: stock, time: nowTime });
        });

        // 3. رادار التوثيق المعلق
        const pendingKyc = d.users.filter(u => u.kycStatus === 'pending').length;
        if (pendingKyc > 0) stats.alerts.push({ id: 'kyc_pending', count: pendingKyc, time: nowTime });

        if (stats.alerts.length === 0) stats.alerts.push({ id: 'security_stable', time: 0 });
        stats.alerts.sort((a, b) => RenderHelpers.parseTime(b.time) - RenderHelpers.parseTime(a.time));

        return stats;
    },

    getWalletsLiquidity: function() {
        const liquidity = { totalUsd: 0, details: {} };
        
        this.data.users.forEach(u => {
            const bal = Number(u.walletBalance || 0);
            const curr = u.baseCurrency || 'USD';
            if (!liquidity.details[curr]) liquidity.details[curr] = { sum: 0, count: 0 };
            
            liquidity.details[curr].sum += bal;
            liquidity.details[curr].count++;

            // التحويل السريع للسيولة الإجمالية بـ O(1)
            if (curr === 'USD') liquidity.totalUsd += bal;
            else {
                const rate = this.data.ratesMap[curr];
                liquidity.totalUsd += (bal / (rate?.priceRate || 1));
            }
        });
        return liquidity;
    },

    // ==========================================
    // 💾 نظام الحفظ الذكي (Atomic Collection Save)
    // ==========================================
    saveCollection: async function(key, prop) {
        if (!this.isCloudSyncSuccessful) return false;

        const currentArr = this.data[prop] || [];
        const snapArr = this._snapshots[prop] || [];
        
        const currentMap = new Map(currentArr.map(i => [String(i.id || Utils.generateID()), i]));
        const snapMap = new Map(snapArr.map(i => [String(i.id), i]));
        const promises = [];

        // ⚡ مزامنة التعديلات والإضافات
        currentMap.forEach((item, id) => {
            const old = snapMap.get(id);
            if (!old || JSON.stringify(item) !== JSON.stringify(old)) {
                promises.push(FirebaseAdapter.set(key, id, item));
            }
        });

        // ⚡ مزامنة الحذف
        snapMap.forEach((_, id) => {
            if (!currentMap.has(id)) promises.push(FirebaseAdapter.delete(key, id));
        });

        if (promises.length > 0) await Promise.all(promises);
        
        this._updateSnapshot(prop);
        this._buildSingleMap(prop); // التحديث: إعادة بناء خريطة المصفوفة المعدلة فقط!
        
        return true;
    },

    // دوال الحفظ السريعة
    saveProducts: function() { return this.saveCollection(DB_KEYS.PRODS, 'prods'); },
    saveUsers: function() { return this.saveCollection(DB_KEYS.USERS, 'users'); },
    saveOrders: function() { return this.saveCollection(DB_KEYS.ORDERS, 'orders'); },
    saveDeposits: function() { return this.saveCollection(DB_KEYS.DEPOSITS, 'deposits'); },
    saveVault: function() { return this.saveCollection(DB_KEYS.VAULT, 'vault'); },

    autoAdvanceSweep: async function() {
        const tiers = [...this.data.tiers].sort((a,b) => b.threshold - a.threshold);
        let changed = false;
        const now = Date.now();

        this.data.users.forEach(u => {
            if (u.manualTierOverride) return;
            const currentTier = this.data.tiersMap[u.tierId];
            if (!currentTier) return;

            const cycleStart = Number(u.tierCycleStartDate || now);
            const durationMs = Number(currentTier.duration_days || 30) * 86400000;

            if (now - cycleStart > durationMs) {
                u.tierCycleSpent = 0; u.tierCycleStartDate = now; changed = true;
            }

            const earned = tiers.find(t => t.autoAdvance && u.tierCycleSpent >= t.threshold && t.threshold > currentTier.threshold);
            if (earned) { u.tierId = earned.id; changed = true; }
        });

        if (changed) await this.saveUsers();
    },

    // 🛡️ التوليد الافتراضي لحماية واجهة المتجر من الأخطاء
    seedDefaultTiers: async function() { 
        if (this.isSeedingTiers) return;
        this.isSeedingTiers = true;
        try {
            const defaultTier = { id: 'TIER_' + Utils.generateID(), name: 'عضو جديد', isDefault: true, threshold: 0, duration_days: 3650, profit_percent: 5, autoAdvance: true, createdAt: Date.now() };
            if (!Array.isArray(this.data.tiers)) this.data.tiers = [];
            this.data.tiers.push(defaultTier); 
            await FirebaseAdapter.set(DB_KEYS.TIERS, defaultTier.id, defaultTier);
        } finally { this.isSeedingTiers = false; }
    },

    // 🛡️ [إصلاح الثغرة الحرجة]: دالة توليد الدول الافتراضية المفقودة
    seedDefaultCountries: async function() {
        if (this.isSeedingCountries) return;
        this.isSeedingCountries = true;
        try {
            const defaultCountry = { 
                id: 'COUNTRY_' + Utils.generateID(), 
                name: 'السعودية', 
                code: 'SA', 
                dialCode: '+966', 
                flag: '🇸🇦', 
                currency: 'SAR', 
                isActive: true, 
                createdAt: Date.now() 
            };
            if (!Array.isArray(this.data.countries)) this.data.countries = [];
            this.data.countries.push(defaultCountry);
            await FirebaseAdapter.set(DB_KEYS.COUNTRIES, defaultCountry.id, defaultCountry);
        } finally {
            this.isSeedingCountries = false;
        }
    }
}; 
