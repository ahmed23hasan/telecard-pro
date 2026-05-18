// ============================================================================
// 🧠 متحكم المستخدمين (modules/users/usersController.js)
// الوظيفة: معالجة العمليات المنطقية (Business Logic) للعملاء، المستويات، ونظام التوثيق.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';

export const UsersController = {

    // =========================================================
    // 👥 1. الإدارة العامة للعملاء
    // =========================================================
    searchUsers: function(q) {
        AppController.updateState({ userSearch: (q || '').trim() });
        EventBus.emit('req-render-users');
    },

    toggleUserSort: function() {
        AppController.updateState({ sortUsers: AppController.sortUsers === 'asc' ? 'desc' : 'asc' });
        EventBus.emit('req-render-users');
    },

    changeUserSort: function(sortType) {
        AppController.updateState({ userSortCategory: sortType });
        EventBus.emit('req-render-users');
    },

    saveUserEdits: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const nameInput = Utils.escapeHTML(Utils.getVal('user-edit-name')),
              email = Utils.escapeHTML(Utils.getVal('user-edit-email')),
              phone = Utils.escapeHTML(Utils.getVal('user-edit-phone')),
              country = Utils.escapeHTML(Utils.getVal('user-edit-country')),
              newPwd = Utils.escapeHTML(Utils.getVal('user-pwd-new')),
              confirmPwd = Utils.escapeHTML(Utils.getVal('user-pwd-confirm'));

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            EventBus.emit('req-show-toast', {message:'البريد الإلكتروني غير صحيح', type:'error'});
            return;
        }

        if (newPwd || confirmPwd) {
            if (newPwd.length < 6) {
                EventBus.emit('req-show-toast', {message:'كلمة المرور يجب أن تكون 6 أحرف على الأقل', type:'error'});
                return;
            }
            if (newPwd !== confirmPwd) {
                EventBus.emit('req-show-toast', {message:'كلمة المرور وتأكيدها غير متطابقين', type:'error'});
                return;
            }
            user.pass = newPwd;
        }

        if (nameInput) {
            const parts = nameInput.split(' ').filter(Boolean);
            const first = parts.shift() || nameInput;
            const last = parts.join(' ').trim();
            user.name = first;
            user.lastName = last;
            user.fullName = last ? `${first} ${last}` : first;
        }

        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (country) user.countryName = country;

        await AdminData?.saveUsers?.();
        AppController.finishAction('req-render-users', null, 'EDIT_USER', `تم تعديل بيانات العميل: ${user.name}`, 'تم حفظ التعديلات بنجاح');
        
        setTimeout(() => {
            AdminRender?.viewUser?.(userId, true);
        }, 350);
    },

    openBalanceAdjust: async function(type, userId) {
        if (!AdminUI) return;
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const curCode = (user.baseCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const displayCur = AdminRender?.getCurrencySymbolText?.(curCode) || curCode;
        
        const amount = await AdminUI.showPrompt(`أدخل المبلغ المراد ${type === 'add' ? 'إضافته' : 'خصمه'} (${displayCur}):`, type === 'add' ? 'إضافة رصيد' : 'خصم رصيد', '');
        if (!amount || isNaN(amount) || Number(amount) <= 0) return;

        const currentBal = Number(user.walletBalance ?? user.balance ?? 0);
        const adjustAmount = Number(amount);

        if (type === 'subtract' && adjustAmount > currentBal) {
            EventBus.emit('req-show-toast', {message:'المبلغ المطلوب خصمه أكبر من الرصيد الحالي', type:'error'});
            return;
        }

        const newBal = type === 'add' ? currentBal + adjustAmount : currentBal - adjustAmount;
        user.walletBalance = newBal;
        user.wallet_balance = newBal;
        user.balance = newBal;

        AdminData.data.deposits.push({
            id: String(Date.now()),
            userId: String(userId),
            userName: user.name || '---',
            amount: adjustAmount,
            currency: (user.baseCurrency || 'USD').toUpperCase(),
            creditedAmount: type === 'add' ? adjustAmount : -adjustAmount,
            targetCurrency: (user.baseCurrency || 'USD').toUpperCase(),
            method: type === 'add' ? 'إيداع من الإدارة' : 'خصم من الإدارة',
            status: 'approved',
            time: Date.now()
        });

        await AdminData?.saveUsers?.();
        await AdminData?.saveDeposits?.();

        AdminUI?.UsersUI?.animateBalanceUpdate?.(newBal, curCode, type);
        AppController.finishAction('req-render-users', null, type === 'add' ? 'ADD_BALANCE' : 'SUB_BALANCE', `تم ${type === 'add' ? 'إضافة' : 'خصم'} مبلغ ${adjustAmount} ${displayCur} للعميل ${user.name}`, `تم ${type === 'add' ? 'إضافة' : 'خصم'} ${adjustAmount} ${displayCur} بنجاح`);
    },

    restrictUser: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من ${user.isRestricted ? 'إلغاء تقييد' : 'تقييد'} الحساب؟`)) {
            user.isRestricted = !user.isRestricted;
            if (user.isRestricted) {
                user.isBanned = false;
                user.isActive = false;
            } else {
                user.isActive = !user.isBanned;
            }
            await AdminData?.saveUsers?.();
            AdminRender?.viewUser?.(userId, true);
            AppController.finishAction('req-render-users', null, user.isRestricted ? 'RESTRICT_USER' : 'UNRESTRICT_USER', `تم ${user.isRestricted ? 'تقييد' : 'إلغاء تقييد'} حساب العميل ${user.name}`, null);
        }
    },

    banUser: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من ${user.isBanned ? 'إلغاء حظر' : 'حظر'} الحساب؟`)) {
            user.isBanned = !user.isBanned;
            if (user.isBanned) {
                user.isRestricted = false;
                user.isActive = false;
            } else {
                user.isActive = !user.isRestricted;
            }
            await AdminData?.saveUsers?.();
            AdminRender?.viewUser?.(userId, true);
            AppController.finishAction('req-render-users', null, user.isBanned ? 'BAN_USER' : 'UNBAN_USER', `تم ${user.isBanned ? 'حظر' : 'إلغاء حظر'} حساب العميل ${user.name}`, null);
        }
    },

    banUserIp: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const targetIp = user.ipAddress || user.ip || 'غير معروف';

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من حظر عنوان الـ IP (${targetIp}) للعميل ${user.name}؟\nلن يتمكن أي حساب يستخدم هذا الـ IP من الدخول للمتجر.`)) {
            user.isIpBanned = !user.isIpBanned;
            
            if (user.isIpBanned) {
                user.isBanned = true;
                user.isRestricted = false;
                user.isActive = false;
            }

            if (!AdminData.data.settings) AdminData.data.settings = {};
            if (!AdminData.data.settings.bannedIps) AdminData.data.settings.bannedIps = [];
            if (user.isIpBanned && targetIp !== 'غير معروف' && !AdminData.data.settings.bannedIps.includes(targetIp)) {
                AdminData.data.settings.bannedIps.push(targetIp);
                await AdminData?.saveSystemSettings?.();
            }

            await AdminData?.saveUsers?.();
            AdminRender?.viewUser?.(userId, true);
            AppController.finishAction('req-render-users', null, user.isIpBanned ? 'BAN_IP' : 'UNBAN_IP', `تم ${user.isIpBanned ? 'حظر الـ IP' : 'إلغاء حظر الـ IP'} للعميل ${user.name} (${targetIp})`, null);
        }
    },

    sendCustomNotification: async function(userId) {
        const msg = Utils.escapeHTML(Utils.getVal('user-custom-notif'));
        if (!msg) {
            EventBus.emit('req-show-toast', {message:'يرجى كتابة الرسالة أولاً', type:'error'});
            return;
        }

        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (user) {
            user.adminMessage = msg;
            user.hasNewMessage = true;
            await AdminData?.saveUsers?.();
            AdminUI?.UsersUI?.clearCustomNotifInput?.();
            AppController.finishAction(null, null, 'SEND_NOTIF', `تم إرسال إشعار مخصص للعميل ${user.name}`, 'تم إرسال التنبيه للعميل بنجاح');
        }
    },

    deleteUser: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const confirmMsg = `⚠️ تحذير خطير!\nهل أنت متأكد من حذف الحساب "${user.name}"؟\nاكتب "حذف" للتأكيد:`;
        if (AdminUI && await AdminUI.showPrompt(confirmMsg, 'حذف الحساب', '') === 'حذف') {
            AdminData.data.orders = AdminData.data.orders.filter(o => String(o.userId) !== String(userId));
            AdminData.data.deposits = AdminData.data.deposits.filter(d => String(d.userId) !== String(userId));
            AdminData.data.users = AdminData.data.users.filter(u => String(u.id) !== String(userId));
            
            await AdminData?.saveOrders?.();
            await AdminData?.saveDeposits?.();
            await AdminData?.saveUsers?.();
            AppController.finishAction('req-render-users', null, 'DELETE_USER', `تم حذف حساب العميل ${user.name} وكافة سجلاته`, 'تم حذف الحساب بنجاح');
        }
    },

    // =========================================================
    // 🛡️ 2. نظام التوثيق (KYC)
    // =========================================================
    revokeUserKyc: async function(userId) {
        if (!AdminUI) return;
        const confirmed = await AdminUI.showConfirm('⚠️ تحذير أمني:\nهل أنت متأكد من إبطال توثيق هذا العميل وحذف صور الهوية نهائياً؟\nسيتم إجباره على رفع البيانات من جديد ولن يمكن التراجع عن هذا الإجراء.', 'إبطال التوثيق (KYC)');
        if (!confirmed) return;

        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (user) {
            user.kycStatus = 'none';
            user.kycData = null;
            await AdminData?.saveUsers?.();
            
            if (AdminData?.addLog) AdminData.addLog('KYC_REVOKED', `تم إبطال توثيق وحذف مستندات العميل #${userId} (اشتباه أمني)`);
            AdminRender?.viewUser?.(userId, true);
            AppController.refresh('users');
            EventBus.emit('req-show-toast', { message: 'تم إبطال التوثيق وحذف البيانات بنجاح', type: 'success' });
        }
    },
    // =========================================================
    // 🛡️ معالجة قرار توثيق الهوية (قبول / رفض)
    // =========================================================
    processKycDecision: async function(userId, decision) {
        // 1. البحث عن العميل
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) {
            EventBus.emit('req-show-toast', { message: 'العميل غير موجود', type: 'error' });
            return;
        }

        // 2. تحديث حالة التوثيق (approve -> approved / reject -> rejected)
        user.kycStatus = decision === 'approve' ? 'approved' : 'rejected';
        
        // 3. حفظ التعديلات في قاعدة البيانات
        await AdminData?.saveUsers?.();

        // 4. تسجيل العملية في سجل النشاطات (Logs)
        const actionText = decision === 'approve' ? 'قبول' : 'رفض';
        AdminData?.addLog?.('KYC_DECISION', `تم ${actionText} توثيق العميل: ${user.fullName || user.name || user.username}`);

        // 5. تحديث عداد الشارات في القائمة الجانبية
        const pendingCount = AdminData.data.users.filter(u => u.kycStatus === 'pending').length;
        AdminUI?.UsersUI?.updateSidebarKycBadge?.(pendingCount);

        // 6. تحديث الواجهة وعرض إشعار النجاح
        AppController.finishAction(
            'req-render-kyc', 
            null, 
            null, 
            null, 
            `تم ${actionText} طلب التوثيق بنجاح`
        );
    },

    // =========================================================
    // 👑 3. إدارة المستويات (Tiers)
    // =========================================================
    saveTier: async function() {
        const name = Utils.escapeHTML(Utils.getVal('t-name', ''));
        const icon = Utils.escapeHTML(Utils.getVal('t-icon', 'fa-user'));
        const profit = Number(Utils.getVal('t-profit', 0));
        const minP = Number(Utils.getVal('t-min', 0));
        const cond = Number(Utils.getVal('t-cond', 0));
        const dur = Number(Utils.getVal('t-dur', 0));
        const isDef = Utils.getCheck('t-default');

        if (!name) {
            EventBus.emit('req-show-toast', { message: 'أدخل اسم المستوى', type: 'error' });
            return;
        }

        if (profit < 0 || minP < 0) {
            EventBus.emit('req-show-toast', { message: 'الحقول الرقمية يجب أن تكون موجبة', type: 'error' });
            return;
        }

        const tiers = Array.isArray(AdminData.data.tiers) ? AdminData.data.tiers : [];
        const isEdit = !!AppController.tempEditId;

        if (isEdit) {
            const idx = tiers.findIndex(x => String(x.id) === String(AppController.tempEditId));
            if (idx > -1) {
                tiers[idx] = { ...tiers[idx], name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef };
            }
        } else {
            const nextId = (tiers.length ? Math.max(...tiers.map(x => Number(x.id)||0)) : 0) + 1;
            tiers.push({
                id: String(nextId),
                name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef, autoAdvance: true
            });
        }

        if (isDef) {
            tiers.forEach(x => {
                x.isDefault = (String(x.name) === String(name));
            });
        }

        AdminData.data.tiers = tiers;
        await AdminData?.saveTiers?.();
        AppController.finishAction('req-render-tiers', null, isEdit ? 'EDIT_TIER' : 'ADD_TIER', `تم ${isEdit ? 'تعديل' : 'إضافة'} مستوى التسعير: ${name}`, 'تم حفظ المستوى بنجاح');
    },

    toggleTierAutoFor: async function(id, on) {
        const tiers = Array.isArray(AdminData.data.tiers) ? AdminData.data.tiers : [];
        const idx = tiers.findIndex(x => String(x.id) === String(id));
        if (idx > -1) {
            tiers[idx].autoAdvance = !!on;
            AdminData.data.tiers = tiers;
            await AdminData?.saveTiers?.();
            AdminData?.addLog?.('TOGGLE_TIER_AUTO', `مستوى ${tiers[idx].name} - الانتقال التلقائي: ${on}`);
            await AdminData?.autoAdvanceSweep?.();
            EventBus.emit('req-render-tiers');
            EventBus.emit('req-show-toast', { message: on ? 'تم تفعيل الانتقال التلقائي' : 'تم إيقاف الانتقال التلقائي', type: 'info' });
        }
    },

    deleteTier: async function(id) {
        if (!AdminData.data.tiers) return;
        const strId = String(id).trim();
        const tierToDelete = AdminData.data.tiers.find(t => String(t.id) === strId);
        
        if (!tierToDelete) return;
        if (tierToDelete.isDefault) {
            EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: لا يمكن حذف المستوى الافتراضي الأساسي للنظام.', type: 'error' });
            return;
        }

        const defaultTier = AdminData.data.tiers.find(t => t.isDefault) || AdminData.data.tiers[0];
        if (!defaultTier) {
            EventBus.emit('req-show-toast', { message: 'خطأ حرج: لا يوجد مستوى بديل لنقل العملاء إليه.', type: 'error' });
            return;
        }

        const usersInTier = (AdminData.data.users || []).filter(u => String(u.tierId) === strId);
        const userCount = usersInTier.length;
        
        let msg = userCount > 0 
            ? `⚠️ تنبيه أمان هام!\nهذا المستوى ("${tierToDelete.name}") يضم (${userCount}) عميل حالياً.\n\nبمجرد حذفه، سيتم نقل جميع هؤلاء العملاء تلقائياً إلى المستوى الافتراضي (${defaultTier.name}).\n\nهل أنت متأكد من قرار الحذف؟` 
            : `هل أنت متأكد من حذف مستوى "${tierToDelete.name}" نهائياً؟`;

        if (AdminUI && await AdminUI.showConfirm(msg, 'تأكيد إزالة المستوى')) {
            if (userCount > 0) {
                AdminData.data.users.forEach(u => {
                    if (String(u.tierId) === strId) u.tierId = String(defaultTier.id);
                });
                await AdminData?.saveUsers?.();
            }

            AdminData.data.tiers = AdminData.data.tiers.filter(t => String(t.id) !== strId);
            await AdminData?.saveTiers?.();
            
            AdminData?.addLog?.('DELETE_TIER', `تم حذف مستوى: ${tierToDelete.name} ${userCount > 0 ? `ونقل ${userCount} عميل للافتراضي` : ''}`);
            EventBus.emit('req-render-tiers');
            EventBus.emit('req-render-users');
            EventBus.emit('req-show-toast', { message: 'تم الحذف وتحديث بيانات العملاء بنجاح', type: 'success' });
        }
    },

    updateUserTier: async function(userId, tierId) {
        const idx = (AdminData.data.users || []).findIndex(u => String(u.id) === String(userId));
        if (idx > -1) {
            AdminData.data.users[idx].tierId = tierId;
            AdminData.data.users[idx].manualTierOverride = true;
            AdminData.data.users[idx].tierCycleSpent = 0;
            AdminData.data.users[idx].tierCycleStartDate = Date.now();
            await AdminData?.saveUsers?.();
            
            AdminData?.addLog?.('UPDATE_USER_TIER', `تغيير مستوى العميل ${AdminData.data.users[idx].name} إلى المستوى رقم ${tierId}`);
            AdminRender?.renderTierUsersPage?.();
            EventBus.emit('req-render-tiers');
            EventBus.emit('req-show-toast', { message: 'تم تحديث مستوى العميل وبدء دورة جديدة بنجاح', type: 'success' });
        }
    },

    confirmTierSelection: function() {
        if (!AppController.selectedUserId || !AppController.selectedTierId) return;
        this.updateUserTier(AppController.selectedUserId, AppController.selectedTierId);
        AdminUI?.UsersUI?.closeTierSelection?.();
    }
};