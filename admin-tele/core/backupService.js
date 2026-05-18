// ============================================================================
// 💾 خدمة النسخ الاحتياطي (core/backupService.js) - النواة الصلبة
// ============================================================================

import { AdminData } from '../adminData.js';
import { AdminUI } from '../adminUI.js';
import { AdminTemplates } from '../adminTemplates.js';

export const BackupSystem = {
    exportData: async function() { 
        if (!AdminData) return;
        if (AdminUI) AdminUI.toggleLoader(true, AdminTemplates.msgExportStart());
        try {
            await AdminData.exportData();
            if (AdminData.addLog) AdminData.addLog('BACKUP_EXPORT', 'تم تصدير نسخة احتياطية للبيانات');
            if (AdminUI) {
                AdminUI.toggleLoader(false);
                AdminUI.showToast(AdminTemplates.msgExportSuccess(), 'success', 2800);
            }
        } catch(err) {
            if (AdminUI) {
                AdminUI.toggleLoader(false);
                AdminUI.showToast(AdminTemplates.msgExportFail(), 'error', 3000);
            }
        }
    },
    importData: async function(input) { 
        if (!AdminData) return;
        if (AdminUI) AdminUI.toggleLoader(true, AdminTemplates.msgImportStart());
        try {
            await AdminData.importData(input);
            if (AdminData.addLog) AdminData.addLog('BACKUP_IMPORT', 'تم استيراد نسخة احتياطية بنجاح');
            if (AdminUI) AdminUI.showToast(AdminTemplates.msgImportSuccess(), 'success', 3000);
            setTimeout(() => window.location.reload(), 1500);
        } catch(err) {
            if (AdminUI) {
                AdminUI.toggleLoader(false);
                AdminUI.showToast(AdminTemplates.msgImportFail(), 'error', 3200);
            }
        }
    }
};
