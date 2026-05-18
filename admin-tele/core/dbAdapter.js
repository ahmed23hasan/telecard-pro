// ============================================================================
// 🗄️ محرك قاعدة البيانات (core/dbAdapter.js) - النواة الصلبة (Core)
// 🎯 الوظيفة: التخاطب مع IndexedDB بشكل آمن. جاهز للاستبدال بـ Firebase لاحقاً.
// ============================================================================

export const DBAdapter = {
    dbName: 'TelecardAdminDB',
    storeName: 'AdminStore',
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            // 🌟 الحماية ضد التوقف الصامت (Silent Block) 
            // تحدث هذه المشكلة إذا فتح المستخدم لوحة الإدارة في عدة تبويبات (Tabs)
            request.onblocked = () => {
                console.error("🚨 قاعدة البيانات محظورة (Blocked) بسبب تبويب آخر مفتوح! يرجى إغلاق التبويبات الأخرى وتحديث الصفحة.");
                reject(new Error("Database Blocked"));
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async get(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    
    async set(key, value) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.put(value, key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },
    
    async getAllKeys() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
};