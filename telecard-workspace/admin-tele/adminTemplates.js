// ============================================================================
// 🎨 موزع القوالب الرئيسي (adminTemplates.js) - نمط الواجهة النظيف (Facade)
// 🎯 الوظيفة: تجميع كافة قوالب الوحدات (HTML Generators) وتصديرها ككائن واحد متكامل.
// 🚀 التحديثات: دمج قوالب الربط التلقائي (Integrations) والمطورين (Developer).
// ============================================================================

import { UITemplates } from './core/uiTemplates.js';
import { OrdersTemplates } from './modules/orders/ordersTemplates.js';
import { FinanceTemplates } from './modules/finance/financeTemplates.js';
import { UsersTemplates } from './modules/users/usersTemplates.js';
import { CatalogTemplates } from './modules/catalog/catalogTemplates.js';
import { MarketingTemplates } from './modules/marketing/marketingTemplates.js';
import { DashboardTemplates } from './modules/dashboard/dashboardTemplates.js';
import { DeveloperTemplates } from './modules/developer/developerTemplates.js'; 
import { IntegrationsTemplates } from './modules/integrations/integrationsTemplates.js'; 

export const AdminTemplates = {
    // 🧩 الأساسيات ومكونات الواجهة (Core UI)
    ...UITemplates,
    
    // 🛒 الطلبات (Orders)
    ...OrdersTemplates,
    
    // 💰 المالية (Finance)
    ...FinanceTemplates,
    
    // 👥 المستخدمين (Users & KYC)
    ...UsersTemplates,
    
    // 📦 الكتالوج (Catalog & Vault)
    ...CatalogTemplates,
    
    // 🎯 التسويق (Marketing & Offers)
    ...MarketingTemplates,
    
    // 📊 لوحة القيادة (Dashboard & Charts)
    ...DashboardTemplates,
    
    // 🛠️ المطورين (API & Webhooks)
    ...DeveloperTemplates, 
    
    // 🔌 الموردين والربط (Suppliers Sync)
    ...IntegrationsTemplates 
};
