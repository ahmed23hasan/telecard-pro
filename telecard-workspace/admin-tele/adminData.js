// ============================================================================
// 🗄️ مدير البيانات (adminData.js) - بنية ES Modules نقية 100% ☁️
// 🎯 الوظيفة: إدارة حالة البيانات، الحسابات المركزية (SSOT)، وتوفير الفلاتر الذكية
// 🌟 التحديث: حل مشكلة التعليق الصامت (Hanging Promises) + تأمين السحابة ضد المسح
// ============================================================================

import { DB_KEYS, normalizeRates } from './adminConfig.js';
import { Utils } from './adminUtils.js'; 
import { FirebaseAdapter } from './core/firebaseAdapter.js';
import { RenderHelpers } from './core/renderHelpers.js';

export const AdminData = {
    // 🌟 راية الأمان (Data Loss Firewall): تمنع مسح السحابة بالخطأ في حال فشل الجلب
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
    // 🛠️ 1. دالة التهيئة وجلب البيانات من السحابة (النسخة الاحترافية والمحمية)
    // ==========================================
    loadData: async function() {
        console.log("☁️ جاري مزامنة بيانات لوحة الإدارة مع Firestore...");
        
        // إغلاق صمام الأمان عند بدء الجلب
        this.isCloudSyncSuccessful = false;
        let hasCriticalFailure = false; // 👈 سيتغير إذا فشل أي جدول
        
        const arr = v => Array.isArray(v) ? v : [];
        const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
        
        // دوال الجلب المساعدة
        const fetchRecent = async (key, limitCount = 100, orderByField = 'time') => {
            if (FirebaseAdapter.getRecent && typeof FirebaseAdapter.getRecent === 'function') {
                const res = await FirebaseAdapter.getRecent(key, limitCount, orderByField);
                return (res && res.length > 0) ? res : [];
            }
            const res = await FirebaseAdapter.getAll(key);
            return (res && res.length > 0) ? res : [];
        };

        const fetchArray = async (key, fallback = []) => {
            const res = await FirebaseAdapter.getAll(key);
            return (res && res.length > 0) ? res : fallback;
        };

        const fetchSingleton = async (key, fallback = {}) => {
            const res = await FirebaseAdapter.getById(key, 'singleton');
            return res ? res : fallback;
        };

        // 🚀 مصفوفة الوعود (Promises) تم تجهيزها لسباق آمن
        const fetchPromises = [
            fetchArray(DB_KEYS.RATES, []),
            fetchArray(DB_KEYS.TIERS, []),
            fetchRecent(DB_KEYS.USERS, 150, 'createdAt'),
            fetchRecent(DB_KEYS.DEPOSITS, 100, 'time'),
            fetchRecent(DB_KEYS.ORDERS, 100, 'time'),
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
            fetchRecent(DB_KEYS.LOGS, 50, 'timestamp'),
            fetchRecent(DB_KEYS.ALERTS, 50, 'time'),
            fetchArray(DB_KEYS.KYC, [])
        ];

        // مصفوفة الأسماء للطباعة الدقيقة عند الخطأ
        const collectionNames = [
            'RATES', 'TIERS', 'USERS', 'DEPOSITS', 'ORDERS', 'CATS', 'PRODS', 'PAYMENTS', 'BANNERS',
            'SETTINGS', 'POPUP', 'SYSTEM', 'ADMIN', 'COUNTRIES', 'VAULT', 'COUPONS', 'OFFERS', 'LOGS', 'ALERTS', 'KYC'
        ];

        // 🚀 الجلب المتوازي الآمن: تغليف كل طلب بـ catch لمنع التعليق الصامت
        const [
            rawRates, rawTiers, rawUsers, rawDeposits, rawOrders, rawCats, rawProds, 
            rawPayments, rawBanners, rawSettings, rawNotif, rawSystem, rawAdminProfile,
            rawCountries, rawVault, rawCoupons, rawOffers, rawLogs, rawAlerts, rawKyc
        ] = await Promise.all(fetchPromises.map((p, index) => 
            p.catch(e => {
                console.error(`❌ فشل جلب الجدول [${collectionNames[index]}]:`, e.message);
                hasCriticalFailure = true; // رفع حالة التأهب: لا تحفظ البيانات لاحقاً!
                const isObject = ['SETTINGS', 'POPUP', 'SYSTEM', 'ADMIN'].includes(collectionNames[index]);
                return isObject ? {} : [];
            })
        ));

        // 🛑 إذا كان هناك فشل حرج، نوقف الإقلاع هنا لحماية السحابة
        if (hasCriticalFailure) {
            console.error("⛔ جدار الحماية: تم إيقاف المزامنة لحماية البيانات السحابية من المسح بالخطأ.");
            throw new Error("فشل في جلب بعض الجداول الأساسية من Firebase. راجع الكونسول لمعرفة الجدول المعطوب.");
        }

        console.log("✅ تمت الاستجابة من فايربيز لجميع الطلبات!");

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
        
        // 🌟 تطهير ومعايرة بيانات المنتجات
        this.data.prods = arr(rawProds).map(p => {
            const isFixed = p.isFixedPrice === true || p.isFixedPrice === 'true' || p.is_fixed_price === true || p.is_fixed_price === 'true';
            return {
                ...p,
                isFixedPrice: isFixed,
                costPrice: Number(p.costPrice || p.cost_price || 0),
                price: Number(p.price || 0),
                fixedPriceUsd: Number(p.fixedPriceUsd || p.fixed_price_usd || 0)
            };
        });

        this.data.payments = arr(rawPayments).map(p => { return { ...p, currencies: normalizeCurrencyList(p.currencies).join(',') }; });
        this.data.banners = arr(rawBanners);
        this.data.settings = obj(rawSettings);
        this.data.rates = availableRates;
        this.data.notif = obj(rawNotif);
        this.data.system = obj(rawSystem);
        this.data.adminProfile = obj(rawAdminProfile);
        
        // 🌟 ترميم بيانات الدول المجلوبة بذكاء
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
        
        // 🌟 فلتر تطهير ومعايرة الكوبونات
        this.data.coupons = arr(rawCoupons).map(c => ({
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

        // 🌟 فلتر تطهير ومعايرة العروض
        this.data.offers = arr(rawOffers).map(o => ({
            ...o,
            isActive: o.isActive === true || o.isActive === 'true',
            value: Number(o.value || 0),
            expiryDate: o.expiryDate ? Number(o.expiryDate) : null,
            targetProds: Array.isArray(o.targetProds) ? o.targetProds : [],
            visualConfig: (o.visualConfig && typeof o.visualConfig === 'object') ? o.visualConfig : {}
        }));

        this.data.logs = arr(rawLogs);
        this.data.alerts = arr(rawAlerts);
        this.data.kyc = arr(rawKyc);

        // أخذ لقطة لكل البيانات لتشغيل محرك الـ Smart Diffing
        Object.keys(this.data).forEach(prop => this._updateSnapshot(prop));

        // 🌟 فتح صمام الأمان: السحابة تمت قراءتها بنجاح وبشكل كامل دون أخطاء
        this.isCloudSyncSuccessful = true;
        
        if (changedTierAssign) await this.saveUsers(); 
        
        if (this.calculateAllStoreStats) await this.calculateAllStoreStats();
        
        await this.autoAdvanceSweep();
        
        console.log("✅ اكتملت المزامنة الموازية بنجاح بسرعة فائقة وبأقل تكلفة من السحابة.");
        return true; 
    },

    // ==========================================
    // 💾 دوال الحفظ الذكية (Smart Diffing Saver)
    // ==========================================
    saveCollection: async function(key, prop) {
        try {
            // 🌟 الجدار الناري: يمنع الحفظ وحذف الجداول إذا لم يكتمل الجلب
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

    seedDefaultCountries: async function() {
        console.warn("⚠️ جاري تأسيس بنية الدول في السحابة...");
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

    calculateAllStoreStats: async function() {
    console.log("🚀 جاري الاتصال بالسحابة لضبط الإحصائيات المركزية...");
    
    try {
        // 🌟 استخدام المحول المركزي الآمن بدلاً من الاستيراد اليدوي!
        // هذا السطر سيتكفل بالـ CORS والمهلة الزمنية (Timeout) وكل شيء
        const result = await FirebaseAdapter.callFunction('calculateStoreStatsCloud');
        
        if (result && result.success) {
            console.log("✅ السحابة أنهت الحسابات بنجاح.");
            const sysRef = await FirebaseAdapter.getById(DB_KEYS.SYSTEM, 'singleton');
            if (sysRef && sysRef.globalStats) {
                this.data.system.globalStats = sysRef.globalStats;
            }
            return true;
        }
    } catch (error) {
        console.error("❌ فشل الاتصال بالسحابة لحساب الإحصائيات:", error);
        return false;
    }
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

        const sysDoc = d.system || {};
        const rawGStats = sysDoc.globalStats || {};
        
        const stats = {
            financials: rawGStats.financials || { totalRevenue: 0, totalProfit: 0, totalCost: 0 },
            orders: rawGStats.orders || { total: 0, completed: 0, rejected: 0, refunded: 0 },
            deposits: rawGStats.deposits || { total: 0, approved: 0, rejected: 0, refunded: 0 },
            tierStats: rawGStats.tierStats || {},
            users: { total: (d.users || []).length, active: 0, restricted: 0, banned: 0, bannedIps: 0, topThreeSpenders: [], mostActiveUser: null },
            walletsData: this.getWalletsLiquidity(),
            promoStats: rawGStats.promoStats || { totalDiscountAmount: 0, discountedRevenue: 0, totalDiscountedOrders: 0, couponUsageMap: {}, offerUsageMap: {}, topCoupon: 'لا يوجد', topOffer: 'لا يوجد' },
            alerts: [],
            daily: {} 
        };

        // إحصائيات المستخدمين الصغرى
        (d.users || []).forEach(u => { 
            if (u.isIpBanned) stats.users.bannedIps++; 
            if (u.isBanned) stats.users.banned++; 
            else if (u.isRestricted) stats.users.restricted++; 
            else stats.users.active++; 
        });

        // 🌟 بناء الديناميكية المحلية للمخططات والمتصدرين
        const ordersForCharts = (d.orders || []).filter(o => o.status === 'completed');
        
        // 🚀 المُتتبّع الحي الذكي للطلبات: يجمع كم طلب قام به כל عميل ليرد على الشاشة فوراً
        const userLiveOrderCounts = {};

        ordersForCharts.forEach(o => {
            const timeMs = RenderHelpers.parseTime(o.time || o.createdAt || nowTime);
            const dateObj = new Date(timeMs);
            const dKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            
            if (!stats.daily[dKey]) stats.daily[dKey] = { revenue: 0, profit: 0, cost: 0 };
            
            const pricing = o.pricingSnapshot;
            const rev = Number(pricing?.finalPriceUsd || pricing?.finalPrice || o.baseUsd || o.price || 0);
            const prof = Number(pricing?.netProfitUsd || pricing?.profit || 0);
            
            stats.daily[dKey].revenue += rev;
            stats.daily[dKey].profit += prof;

            // 🚀 إضافة رصيد نشاط لهذا العميل المعين
            if (o.userId) {
                userLiveOrderCounts[o.userId] = (userLiveOrderCounts[o.userId] || 0) + 1;
            }
        });

        // ترتيبات التخفيضات 
        let topC = 0; const cMap = stats.promoStats.couponUsageMap || {}; for (let c in cMap) { if (cMap[c] > topC) { topC = cMap[c]; stats.promoStats.topCoupon = c; } }
        let topO = 0; const oMap = stats.promoStats.offerUsageMap || {}; for (let o in oMap) { if (oMap[o] > oMap[topO] || !topO) { topO = oMap[o]; stats.promoStats.topOffer = o; } }

        let lbKey = leaderboardPeriod === 'this_month' ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` : (leaderboardPeriod === 'last_month' ? `${new Date(now.getFullYear(), now.getMonth()-1).getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth()-1).getMonth()+1).padStart(2,'0')}` : '');
        
        let leaderboard = (d.users || []).map(u => ({ 
            id: u.id, 
            displayId: RenderHelpers.formatUserId(u),
            name: u.username ? `@${u.username}` : (u.fullName || 'مستخدم جديد'), 
            img: u.img || null, 
            spent: leaderboardPeriod === 'all' ? (Number(u.totalSpent) || 0) : (Number(u.monthlySpent?.[lbKey]) || 0), 
            count: userLiveOrderCounts[u.id] || 0 // 🚀 قراءة نشاط العميل من الآلة الحاسبة المباشرة!
        }));
        
        stats.users.topThreeSpenders = leaderboard.filter(u => u.spent > 0).sort((a,b) => b.spent - a.spent).slice(0,3);
        stats.users.mostActiveUser = leaderboard.filter(u => u.count > 0).sort((a,b) => b.count - a.count)[0] || null;

        // التنبيهات المضمنة للرادار الذكي
        const twoDays = nowTime - 172800000;
        (d.orders || []).filter(o => o.status === 'completed' && o.couponCode && RenderHelpers.parseTime(o.time || o.createdAt) > twoDays).forEach(o => { stats.alerts.push({ id: 'coupon_used', code: o.couponCode, user: o.userName || 'عميل', orderId: o.id, time: o.time || o.createdAt }); });
        (d.vault || []).forEach(p => { let av = (p.codes || []).filter(c => typeof c === 'string' || c.status === 'available').length; if (av === 0) stats.alerts.push({ id: 'vault_empty', poolId: p.id, poolName: p.name }); else if (av <= (p.alertLimit || 5)) stats.alerts.push({ id: 'vault_low', poolId: p.id, poolName: p.name, count: av }); });
        (d.offers || []).filter(o => o.isActive && o.expiryDate && (o.expiryDate - nowTime) < 259200000).forEach(o => stats.alerts.push({ id: 'offer_expiring', name: o.name, time: o.expiryDate }));

        if (d.users?.length > 0) stats.alerts.push({ id: 'security_stable' });
        stats.alerts.sort((a, b) => RenderHelpers.parseTime(b.time || nowTime) - RenderHelpers.parseTime(a.time || nowTime));
        
        return stats;
    }
};