// ============================================================================
// 🧠 متحكم المستخدمين (modules/users/usersController.js)
// الوظيفة: معالجة العمليات المنطقية (Business Logic) للعملاء، المستويات، ونظام التوثيق.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';

// 🌟 استيراد أدوات فايربيز اللازمة لإرسال رابط إعادة تعيين كلمة المرور بأمان
import { auth } from '../../core/firebaseAdapter.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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
              country = Utils.escapeHTML(Utils.getVal('user-edit-country'));

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            EventBus.emit('req-show-toast', {message:'البريد الإلكتروني غير صحيح', type:'error'});
            return;
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
        EventBus.emit('req-show-toast', { message: 'المبلغ المطلوب خصمه أكبر من الرصيد الحالي', type: 'error' });
        return;
    }
    
    EventBus.emit('req-show-loader', true);
    
    try {
        const { getApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
        const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js");
        
        // 🌟 الربط الإجباري بالمنطقة السريعة
        const functions = getFunctions(getApp(), 'us-east1');
        const adjustBalanceCloud = httpsCallable(functions, 'adminAdjustBalance');
        
        const result = await adjustBalanceCloud({
            userId: userId,
            type: type,
            amount: adjustAmount,
            adminName: AdminData.data.adminProfile?.name || 'المدير'
        });
        
        if (result.data.success) {
            const newBal = result.data.newBalance;
            
            // 🌟 تحديث المتغيرات محلياً لتجنب الحاجة لعمل Refresh للصفحة
            user.walletBalance = newBal;
            user.balance = newBal;
            user.wallet_balance = newBal;
            if (type === 'add') {
                user.totalDeposit = Number(user.totalDeposit || 0) + adjustAmount;
            } else {
                user.totalSpent = Number(user.totalSpent || 0) + adjustAmount;
            }
            
            // 🌟 حيلة الـ Optimistic UI: حشر الفاتورة محلياً لتظهر في قائمة الإيداعات فوراً
            AdminData.data.deposits.unshift({
                id: result.data.newDeposit.id,
                displayId: result.data.newDeposit.id,
                userId: String(userId),
                userName: user.name || user.fullName || '---',
                amount: adjustAmount,
                currency: curCode,
                creditedAmount: result.data.newDeposit.creditedAmount,
                targetCurrency: curCode,
                method: type === 'add' ? 'إيداع من الإدارة' : 'خصم من الإدارة',
                status: 'approved',
                time: Date.now() // توقيت تقريبي ريثما يتم جلب الختم من السيرفر عند الريفريش
            });
            
            AdminUI?.UsersUI?.animateBalanceUpdate?.(newBal, curCode, type);
            AppController.finishAction('req-render-users', null, type === 'add' ? 'ADD_BALANCE' : 'SUB_BALANCE', `تم ${type === 'add' ? 'إضافة' : 'خصم'} مبلغ ${adjustAmount} ${displayCur} للعميل ${user.name}`, `تمت العملية بنجاح عبر السحابة ☁️`);
        }
    } catch (error) {
        console.error("Cloud Error:", error);
        EventBus.emit('req-show-toast', { message: 'خطأ سحابي: ' + error.message, type: 'error' });
    } finally {
        EventBus.emit('req-show-loader', false);
    }
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
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) {
            EventBus.emit('req-show-toast', { message: 'العميل غير موجود', type: 'error' });
            return;
        }

        user.kycStatus = decision === 'approve' ? 'approved' : 'rejected';
        await AdminData?.saveUsers?.();

        const actionText = decision === 'approve' ? 'قبول' : 'رفض';
        AdminData?.addLog?.('KYC_DECISION', `تم ${actionText} توثيق العميل: ${user.fullName || user.name || user.username}`);

        const pendingCount = AdminData.data.users.filter(u => u.kycStatus === 'pending').length;
        AdminUI?.UsersUI?.updateSidebarKycBadge?.(pendingCount);

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
    
    // 🛡️ منع نسبة الربح الصفرية والسالبة
    if (profit <= 0) {
        EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: لا يمكن تعيين نسبة ربح 0% أو أقل لحماية أرباح المتجر.', type: 'error' });
        return;
    }
    
    if (minP < 0) {
        EventBus.emit('req-show-toast', { message: 'قاع الربح (Min Profit) لا يمكن أن يكون سالباً.', type: 'error' });
        return;
    }
    
    // أخذ نسخة من المستويات للعمل عليها
    const tiers = Array.isArray(AdminData.data.tiers) ? [...AdminData.data.tiers] : [];
    const isEdit = !!AppController.tempEditId;
    let targetId = null;
    
    if (isEdit) {
        targetId = String(AppController.tempEditId);
        const idx = tiers.findIndex(x => String(x.id) === targetId);
        if (idx > -1) {
            tiers[idx] = { ...tiers[idx], name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef };
        }
    } else {
        // 🌟 [الإصلاح الجذري]: التخلص من محرك Max الفاشل في قراءة النصوص، واستخدام مولّد النظام النظيف
        targetId = 'TIER_' + Utils.generateID();
        
        tiers.push({
            id: targetId,
            name,
            icon,
            profit_percent: profit,
            min_profit_usd: minP,
            threshold: cond,
            duration_days: dur,
            isDefault: isDef,
            autoAdvance: true
        });
    }
    
    // 🛡️ التحديث الاحترافي: الاعتماد على ID بدلاً من الاسم لمنع تضارب الأسماء المتشابهة
    if (isDef) {
        tiers.forEach(x => {
            x.isDefault = (String(x.id) === targetId);
        });
    }
    
    // 🛑 سد الفجوة التي اكتشفتها: منع حفظ النظام بدون أي مستوى افتراضي
    const hasDefault = tiers.some(t => t.isDefault === true);
    if (!hasDefault && tiers.length > 0) {
        EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: يجب أن يحتوي النظام على مستوى افتراضي واحد على الأقل.', type: 'error' });
        return; // إيقاف العملية وعدم الحفظ
    }
    
    // إذا نجحت كل الفحوصات الأمنية، نحفظ البيانات في السحابة
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
    
    // 🔐 إرسال رابط إعادة تعيين كلمة المرور برمجياً
    sendPasswordReset: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user || !user.email) {
            EventBus.emit('req-show-toast', { message: 'البريد الإلكتروني للعميل غير متوفر أو غير صحيح', type: 'error' });
            return;
        }

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من إرسال رابط استعادة وتغيير كلمة المرور إلى البريد (${user.email})؟`)) {
            EventBus.emit('req-show-loader', true);
            try {
                await sendPasswordResetEmail(auth, user.email);
                
                if (AdminData?.addLog) AdminData.addLog('PASSWORD_RESET_SENT', `تم إرسال رابط إعادة تعيين كلمة المرور للعميل: ${user.fullName || user.name}`);
                
                EventBus.emit('req-show-toast', { message: 'تم إرسال رابط إعادة التعيين بنجاح إلى بريد العميل', type: 'success' });
            } catch (error) {
                console.error("Firebase Auth Error:", error);
                EventBus.emit('req-show-toast', { message: 'فشل الإرسال: ' + error.message, type: 'error' });
            } finally {
                EventBus.emit('req-show-loader', false);
            }
        }
    },

        confirmTierSelection: function() {
        // 🛡️ استخدام المتغيرات المحلية بدلاً من AppController
        if (!this.selectedUserId || !this.selectedTierId) {
            EventBus.emit('req-show-toast', { message: 'يرجى تحديد مستوى من القائمة أولاً', type: 'error' });
            return;
        }

        // تنفيذ التحديث وحفظه في السحابة
        this.updateUserTier(this.selectedUserId, this.selectedTierId);
        
        // إغلاق النافذة
        AdminUI?.UsersUI?.closeTierSelection?.();
        
        // تفريغ الذاكرة لمنع تداخل العمليات مستقبلاً
        this.selectedUserId = null;
        this.selectedTierId = null;
    }

};
