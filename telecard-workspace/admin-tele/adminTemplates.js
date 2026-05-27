// ============================================================================
// 🎨 موزع القوالب الرئيسي (adminTemplates.js) - نمط الواجهة النظيف (Facade)
// 🎯 الوظيفة: تجميع كافة قوالب الوحدات وتصديرها ككائن واحد متكامل
// ============================================================================

import { UITemplates } from './core/uiTemplates.js';
import { OrdersTemplates } from './modules/orders/ordersTemplates.js';
import { FinanceTemplates } from './modules/finance/financeTemplates.js';
import { UsersTemplates } from './modules/users/usersTemplates.js';
import { CatalogTemplates } from './modules/catalog/catalogTemplates.js';
import { MarketingTemplates } from './modules/marketing/marketingTemplates.js';
import { DashboardTemplates } from './modules/dashboard/dashboardTemplates.js';
import { DeveloperTemplates } from './modules/developer/developerTemplates.js'; 
import { IntegrationsTemplates } from './modules/integrations/integrationsTemplates.js'; // 👈 استيراد قوالب الربط التلقائي والموردين

export const AdminTemplates = {
    ...UITemplates,
    ...OrdersTemplates,
    ...FinanceTemplates,
    ...UsersTemplates,
    ...CatalogTemplates,
    ...MarketingTemplates,
    ...DashboardTemplates,
    ...DeveloperTemplates, 
    ...IntegrationsTemplates // 👈 دمج قوالب الموردين مع النظام
};
