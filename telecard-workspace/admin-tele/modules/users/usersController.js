// ============================================================================
// 🧠 متحكم المستخدمين (modules/users/usersController.js) - Bank Grade 🏦
// الوظيفة: معالجة العمليات المنطقية للعملاء، وتطبيق "الإعدام السحابي" والقوائم السوداء.
// 🌟 التحديث: دمج دالة adminToggleUserBan وتفخيخ الأجهزة (Device Blacklisting)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';

// 🌟 استيراد البوابة الآمنة وأدوات التوثيق
import { FirebaseAdapter, auth } from '../../core/firebaseAdapter.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const UsersController = {

    selectedUserId: null,
    selectedTierId: null,

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
    // =========================================================
    // 📊 السجل المالي الشامل للعميل (Unified Ledger)
    // =========================================================
        openUserFullHistory: async function(userId) {
        if (!userId) return;
        
        // 1. (Optimistic UI): سحب البيانات الموجودة حالياً في الذاكرة لعرضها فوراً
        const localOrders = (AdminData.data.orders || []).filter(o => String(o.userId) === String(userId)).map(o => ({ ...o, txType: 'order' }));
        const localDeposits = (AdminData.data.deposits || []).filter(d => String(d.userId) === String(userId)).map(d => ({ ...d, txType: 'deposit' }));
        
        let combinedActivity = [...localOrders, ...localDeposits].sort((a, b) => {
            return (b.time || b.createdAt || b.date) - (a.time || a.createdAt || a.date);
        });

        // 2. عرض البيانات المحلية فوراً (حتى لو كانت أقل من 50)
        if (AdminUI?.UsersUI?.renderFullHistoryModal) {
            AdminUI.UsersUI.renderFullHistoryModal(userId, combinedActivity);
        }
        
        // 3. جلب الـ 50 حركة كاملة من السيرفر في الخلفية لتحديث النافذة
        try {
            const fullHistory = await FirebaseAdapter.getCustomerFullHistory(userId, 25);
            
            // تحديث النافذة بالبيانات السحابية إذا عادت بنجاح وتحتوي على عناصر
            if (fullHistory && fullHistory.length > 0) {
                 AdminUI.UsersUI.renderFullHistoryModal(userId, fullHistory);
            }
            
        } catch (error) {
            console.error("🚨 السيرفر لم يستجب لجلب السجل الكامل:", error);
            // لن نزعج المدير برسالة خطأ طالما أننا عرضنا البيانات المحلية بنجاح
        }
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
            EventBus.emit('req-show-toast', {message:'صيغة البريد الإلكتروني غير صحيحة', type:'error'});
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

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ التعديلات...');

        try {
            await AdminData?.saveUsers?.();
            const displayName = user.fullName || user.username || user.name || 'العميل';
            AppController.finishAction('req-render-users', null, 'EDIT_USER', `تم تعديل بيانات العميل: ${displayName}`, `تم تحديث ملف العميل (${displayName}) بنجاح`);
            
            setTimeout(() => {
                AdminRender?.viewUser?.(userId, true);
            }, 350);
        } catch (error) {
            EventBus.emit('req-show-toast', {message:'تعذر حفظ التعديلات سحابياً', type:'error'});
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    openBalanceAdjust: async function(type, userId) {
        if (!AdminUI) return;
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        const curCode = (user.baseCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const displayCur = AdminRender?.getCurrencySymbolText?.(curCode) || curCode;
        const actionName = type === 'add' ? 'إضافة' : 'خصم';
        
        const amountStr = await AdminUI.showPrompt(`أدخل المبلغ المراد ${actionName}ه (${displayCur}):`, `${actionName} رصيد للعميل (${displayName})`, '');
        if (!amountStr || isNaN(amountStr) || Number(amountStr) <= 0) return;
        
        const adjustAmount = Number(amountStr);
        const currentBal = Number(user.walletBalance ?? user.balance ?? 0);
        
        if (type === 'subtract' && adjustAmount > currentBal) {
            EventBus.emit('req-show-toast', { message: `رصيد العميل الحالي (${currentBal.toFixed(2)} ${displayCur}) لا يكفي للخصم.`, type: 'error' });
            return;
        }
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, `جاري توثيق عملية الـ ${actionName} سحابياً...`);
        
        try {
            const result = await FirebaseAdapter.callFunction('adminAdjustBalance', {
                userId: String(userId),
                type: type,
                amount: adjustAmount,
                adminName: AdminData.data.adminProfile?.name || 'المدير العام'
            });
            
            if (result && result.success) {
                const newBal = result.newBalance;
                
                user.walletBalance = newBal;
                user.balance = newBal;
                user.wallet_balance = newBal;
                if (type === 'add') {
                    user.totalDeposit = Number(user.totalDeposit || 0) + adjustAmount;
                } else {
                    user.totalSpent = Number(user.totalSpent || 0) + adjustAmount;
                }
                
                // حشر الفاتورة محلياً لتظهر فوراً
                AdminData.data.deposits.unshift({
                    id: result.newDeposit?.id || String(Date.now()),
                    displayId: result.newDeposit?.id || String(Date.now()),
                    userId: String(userId),
                    userName: displayName,
                    amount: adjustAmount,
                    currency: curCode,
                    creditedAmount: type === 'add' ? adjustAmount : -adjustAmount,
                    targetCurrency: curCode,
                    method: type === 'add' ? 'إيداع من الإدارة' : 'خصم من الإدارة',
                    status: 'approved',
                    time: Date.now() 
                });
                
                AdminUI?.UsersUI?.animateBalanceUpdate?.(newBal, curCode, type);
                if (AppController.refresh) AppController.refresh('deposits');

                const preciseMsg = `تم ${actionName} مبلغ ${adjustAmount} ${displayCur} للعميل ${displayName}`;
                AppController.finishAction('req-render-users', null, type === 'add' ? 'ADD_BALANCE' : 'SUB_BALANCE', preciseMsg, preciseMsg);
            }
        } catch (error) {
            console.error("Balance Adjust Error:", error);
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    restrictUser: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const displayName = user.fullName || user.username || user.name || 'العميل';

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من ${user.isRestricted ? 'إلغاء تقييد' : 'تقييد'} حساب (${displayName})؟`)) {
            user.isRestricted = !user.isRestricted;
            if (user.isRestricted) {
                user.isBanned = false;
                user.isActive = false;
            } else {
                user.isActive = !user.isBanned;
            }
            await AdminData?.saveUsers?.();
            AdminRender?.viewUser?.(userId, true);
            const msg = `تم ${user.isRestricted ? 'تقييد' : 'إلغاء تقييد'} حساب العميل ${displayName}`;
            AppController.finishAction('req-render-users', null, user.isRestricted ? 'RESTRICT_USER' : 'UNRESTRICT_USER', msg, msg);
        }
    },

    // =========================================================
    // ⚔️ [الإعدام السحابي]: الحظر الصارم وإدراج الأجهزة في القائمة السوداء
    // =========================================================
    banUser: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const displayName = user.fullName || user.username || user.name || 'العميل';
        const isCurrentlyBanned = user.isBanned;
        const actionTitle = isCurrentlyBanned ? 'إلغاء الحظر' : 'الإعدام والحظر السحابي';

        // 1. تأكيد الإجراء وطلب السبب ليظهر للعميل المطرود
        let banReason = '';
        if (!isCurrentlyBanned) {
            const promptMsg = `⚠️ تحذير: سيتم طرد (${displayName}) وتدمير جلساته عبر كل أجهزته وتفخيخ بصمته.\nأدخل سبب الحظر (سيظهر للعميل):`;
            banReason = await AdminUI.showPrompt(promptMsg, actionTitle, 'مخالفة الشروط والأحكام');
            if (banReason === null) return; 
        } else {
            const confirmUnban = await AdminUI.showConfirm(`هل أنت متأكد من إلغاء حظر (${displayName})؟`, actionTitle);
            if (!confirmUnban) return;
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التواصل مع السيرفر لتطبيق بروتوكول الأمان...');

        try {
            const newBanStatus = !isCurrentlyBanned;

            // 2. التنفيذ السحابي (Revoke Tokens & Set Custom Claims)
            const cloudResult = await FirebaseAdapter.callFunction('adminToggleUserBan', {
                targetUid: String(userId),
                isBanned: newBanStatus,
                reason: banReason
            });

            if (cloudResult && cloudResult.success) {
                
                // 3. تحديث بيانات العميل محلياً
                user.isBanned = newBanStatus;
                user.banReason = banReason;
                
                if (newBanStatus) {
                    user.isRestricted = false;
                    user.isActive = false;
                } else {
                    user.isActive = !user.isRestricted;
                    user.banReason = '';
                }

                // 4. إدراج الأجهزة في القائمة السوداء العالمية (Global Blacklist)
                if (newBanStatus) {
                    if (!AdminData.data.settings) AdminData.data.settings = {};
                    let settingsChanged = false;
                    
                    // أ. حظر الـ IP 
                    const targetIp = user.lastIp || user.ipAddress || user.ip;
                    if (targetIp && targetIp !== 'غير معروف') {
                        if (!AdminData.data.settings.bannedIps) AdminData.data.settings.bannedIps = [];
                        if (!AdminData.data.settings.bannedIps.includes(targetIp)) {
                            AdminData.data.settings.bannedIps.push(targetIp);
                            settingsChanged = true;
                        }
                    }

                    // ب. حظر الأجهزة (Device Prints) 
                    if (Array.isArray(user.devicePrints) && user.devicePrints.length > 0) {
                        if (!AdminData.data.settings.bannedDevices) AdminData.data.settings.bannedDevices = [];
                        const currentBannedDevices = new Set(AdminData.data.settings.bannedDevices);
                        
                        user.devicePrints.forEach(device => {
                            if (!currentBannedDevices.has(device)) {
                                AdminData.data.settings.bannedDevices.push(device);
                                settingsChanged = true;
                            }
                        });
                    }

                    if (settingsChanged) {
                        await AdminData.saveSystemSettings();
                        console.log("🛡️ تم تحديث القائمة السوداء العالمية للـ IP والأجهزة.");
                    }
                }

                // 5. حفظ البيانات وتحديث الواجهة
                await AdminData.saveUsers();
                AdminRender?.viewUser?.(userId, true);
                
                const msg = `تم ${newBanStatus ? 'حظر وتدمير جلسات' : 'إلغاء حظر'} العميل ${displayName} بنجاح`;
                AppController.finishAction('req-render-users', null, newBanStatus ? 'BAN_USER' : 'UNBAN_USER', msg, msg);
            }
        } catch (error) {
            console.error("Cloud Ban Error:", error);
            EventBus.emit('req-show-toast', { message: `تعذر تطبيق الحظر السحابي: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // =========================================================
    // 🛡️ حظر الشبكات والـ IP (IP Blacklist)
    // =========================================================
    banUserIp: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const displayName = user.fullName || user.username || user.name || 'العميل';
        const targetIp = user.lastIp || user.ipAddress || user.ip || 'غير معروف';

        if (targetIp === 'غير معروف') {
            EventBus.emit('req-show-toast', { message: 'لا يوجد عنوان IP مسجل لهذا العميل.', type: 'warning' });
            return;
        }

        const isCurrentlyIpBanned = user.isIpBanned;

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من ${isCurrentlyIpBanned ? 'رفع الحظر عن' : 'حظر'} عنوان الـ IP (${targetIp}) للعميل ${displayName}؟\n${!isCurrentlyIpBanned ? 'لن يتمكن أي حساب يستخدم هذا الـ IP من الدخول للمتجر.' : ''}`)) {
            
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث الجدار الناري للشبكات...');

            try {
                user.isIpBanned = !isCurrentlyIpBanned;
                
                if (user.isIpBanned) {
                    user.isBanned = true;
                    user.isRestricted = false;
                    user.isActive = false;
                }

                if (!AdminData.data.settings) AdminData.data.settings = {};
                if (!AdminData.data.settings.bannedIps) AdminData.data.settings.bannedIps = [];
                
                let settingsChanged = false;

                if (user.isIpBanned) {
                    if (!AdminData.data.settings.bannedIps.includes(targetIp)) {
                        AdminData.data.settings.bannedIps.push(targetIp);
                        settingsChanged = true;
                    }
                } else {
                    // إزالة الـ IP من القائمة السوداء
                    const index = AdminData.data.settings.bannedIps.indexOf(targetIp);
                    if (index > -1) {
                        AdminData.data.settings.bannedIps.splice(index, 1);
                        settingsChanged = true;
                    }
                }

                if (settingsChanged) {
                    await AdminData.saveSystemSettings();
                }

                await AdminData.saveUsers();
                
                // استدعاء صامت لـ Cloud Function لتأكيد الحظر على مستوى التوكن
                if (user.isIpBanned) {
                    FirebaseAdapter.callFunction('adminToggleUserBan', { targetUid: String(userId), isBanned: true, reason: 'حظر الشبكة والأمان (IP Ban)' }).catch(()=>console.warn("Soft fail on cloud ban"));
                }

                AdminRender?.viewUser?.(userId, true);
                const msg = `تم ${user.isIpBanned ? 'حظر' : 'إلغاء حظر'} الـ IP للعميل ${displayName}`;
                AppController.finishAction('req-render-users', null, user.isIpBanned ? 'BAN_IP' : 'UNBAN_IP', msg, msg);

            } catch (error) {
                EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء تحديث حظر الشبكة.', type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
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
            const displayName = user.fullName || user.username || user.name || 'العميل';
            user.adminMessage = msg;
            user.hasNewMessage = true;
            await AdminData?.saveUsers?.();
            AdminUI?.UsersUI?.clearCustomNotifInput?.();
            AppController.finishAction(null, null, 'SEND_NOTIF', `تم إرسال إشعار مخصص للعميل ${displayName}`, `تم إرسال التنبيه للعميل (${displayName}) بنجاح`);
        }
    },

    deleteUser: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const displayName = user.fullName || user.username || user.name || 'العميل';
        const confirmMsg = `⚠️ تحذير خطير!\nهل أنت متأكد من حذف الحساب "${displayName}"؟\nاكتب "حذف" للتأكيد:`;
        
        if (AdminUI && await AdminUI.showPrompt(confirmMsg, 'حذف الحساب', '') === 'حذف') {
            
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح بيانات العميل...');
            
            try {
                AdminData.data.orders = AdminData.data.orders.filter(o => String(o.userId) !== String(userId));
                AdminData.data.deposits = AdminData.data.deposits.filter(d => String(d.userId) !== String(userId));
                AdminData.data.users = AdminData.data.users.filter(u => String(u.id) !== String(userId));
                
                await AdminData?.saveOrders?.();
                await AdminData?.saveDeposits?.();
                await AdminData?.saveUsers?.();
                
                AppController.finishAction('req-render-users', null, 'DELETE_USER', `تم حذف حساب العميل ${displayName} وكافة سجلاته`, `تم مسح حساب (${displayName}) من النظام نهائياً`);
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
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
            const displayName = user.fullName || user.username || user.name || 'العميل';
            user.kycStatus = 'none';
            user.kycData = null;
            await AdminData?.saveUsers?.();
            
            if (AdminData?.addLog) AdminData.addLog('KYC_REVOKED', `تم إبطال توثيق وحذف مستندات العميل ${displayName} (اشتباه أمني)`);
            AdminRender?.viewUser?.(userId, true);
            AppController.refresh('users');
            EventBus.emit('req-show-toast', { message: `تم إبطال توثيق العميل (${displayName}) بنجاح`, type: 'success' });
        }
    },
    
    processKycDecision: async function(userId, decision) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) {
            EventBus.emit('req-show-toast', { message: 'العميل غير موجود', type: 'error' });
            return;
        }

        const displayName = user.fullName || user.username || user.name || 'العميل';
        user.kycStatus = decision === 'approve' ? 'approved' : 'rejected';
        await AdminData?.saveUsers?.();

        const actionText = decision === 'approve' ? 'قبول' : 'رفض';
        AdminData?.addLog?.('KYC_DECISION', `تم ${actionText} توثيق العميل: ${displayName}`);

        const pendingCount = AdminData.data.users.filter(u => u.kycStatus === 'pending').length;
        AdminUI?.UsersUI?.updateSidebarKycBadge?.(pendingCount);

        AppController.finishAction(
            'req-render-kyc', null, null, null, `تم ${actionText} طلب توثيق العميل (${displayName})`
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
        
        if (profit <= 0) {
            EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: لا يمكن تعيين نسبة ربح 0% أو أقل لحماية المتجر.', type: 'error' });
            return;
        }
        
        if (minP < 0) {
            EventBus.emit('req-show-toast', { message: 'قاع الربح لا يمكن أن يكون سالباً.', type: 'error' });
            return;
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات المستوى...');
        
        try {
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
                targetId = 'TIER_' + Utils.generateID();
                tiers.push({
                    id: targetId, name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef, autoAdvance: true
                });
            }
            
            if (isDef) {
                tiers.forEach(x => { x.isDefault = (String(x.id) === targetId); });
            }
            
            const hasDefault = tiers.some(t => t.isDefault === true);
            if (!hasDefault && tiers.length > 0) {
                EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: يجب أن يحتوي النظام على مستوى افتراضي واحد على الأقل.', type: 'error' });
                return; 
            }
            
            AdminData.data.tiers = tiers;
            await AdminData?.saveTiers?.();
            AppController.finishAction('req-render-tiers', null, isEdit ? 'EDIT_TIER' : 'ADD_TIER', `تحديث مستوى: ${name}`, `تم حفظ مستوى (${name}) بنجاح`);
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
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
            EventBus.emit('req-show-toast', { message: on ? `تم تفعيل الانتقال التلقائي لمستوى (${tiers[idx].name})` : `تم إيقاف الانتقال التلقائي لمستوى (${tiers[idx].name})`, type: 'info' });
        }
    },

    deleteTier: async function(id) {
        if (!AdminData.data.tiers) return;
        const strId = String(id).trim();
        const tierToDelete = AdminData.data.tiers.find(t => String(t.id) === strId);
        
        if (!tierToDelete) return;
        if (tierToDelete.isDefault) {
            EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: لا يمكن حذف المستوى الافتراضي الأساسي.', type: 'error' });
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
            ? `⚠️ تنبيه أمان هام!\nهذا المستوى ("${tierToDelete.name}") يضم (${userCount}) عميل حالياً.\nبمجرد حذفه، سيتم نقل جميع هؤلاء العملاء إلى (${defaultTier.name}).\nهل أنت متأكد؟` 
            : `هل أنت متأكد من حذف مستوى "${tierToDelete.name}" نهائياً؟`;

        if (AdminUI && await AdminUI.showConfirm(msg, 'تأكيد إزالة المستوى')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حذف المستوى وتحديث العملاء...');
            
            try {
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
                EventBus.emit('req-show-toast', { message: `تم حذف مستوى (${tierToDelete.name}) بنجاح`, type: 'success' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    updateUserTier: async function(userId, tierId) {
        const idx = (AdminData.data.users || []).findIndex(u => String(u.id) === String(userId));
        if (idx > -1) {
            const user = AdminData.data.users[idx];
            const displayName = user.fullName || user.username || user.name || 'العميل';
            const targetTier = AdminData.data.tiers.find(t => String(t.id) === String(tierId));
            const tierName = targetTier ? targetTier.name : 'مستوى جديد';

            AdminData.data.users[idx].tierId = tierId;
            AdminData.data.users[idx].manualTierOverride = true;
            AdminData.data.users[idx].tierCycleSpent = 0;
            AdminData.data.users[idx].tierCycleStartDate = Date.now();
            await AdminData?.saveUsers?.();
            
            AdminData?.addLog?.('UPDATE_USER_TIER', `تغيير مستوى العميل ${displayName} إلى (${tierName})`);
            AdminRender?.renderTierUsersPage?.();
            EventBus.emit('req-render-tiers');
            EventBus.emit('req-show-toast', { message: `تم ترقية العميل (${displayName}) إلى (${tierName}) بنجاح`, type: 'success' });
        }
    },
    
    sendPasswordReset: async function(userId) {
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user || !user.email) {
            EventBus.emit('req-show-toast', { message: 'البريد الإلكتروني للعميل غير متوفر أو غير صحيح', type: 'error' });
            return;
        }

        const displayName = user.fullName || user.username || user.name || 'العميل';

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من إرسال رابط استعادة وتغيير كلمة المرور إلى البريد (${user.email})؟`)) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إرسال رابط الاستعادة...');
            try {
                await sendPasswordResetEmail(auth, user.email);
                if (AdminData?.addLog) AdminData.addLog('PASSWORD_RESET_SENT', `إرسال رابط إعادة تعيين كلمة المرور للعميل: ${displayName}`);
                EventBus.emit('req-show-toast', { message: `تم إرسال رابط الاستعادة إلى (${displayName}) بنجاح`, type: 'success' });
            } catch (error) {
                console.error("Firebase Auth Error:", error);
                EventBus.emit('req-show-toast', { message: 'فشل الإرسال: ' + error.message, type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    confirmTierSelection: function() {
        if (!this.selectedUserId || !this.selectedTierId) {
            EventBus.emit('req-show-toast', { message: 'يرجى تحديد مستوى من القائمة أولاً', type: 'error' });
            return;
        }

        this.updateUserTier(this.selectedUserId, this.selectedTierId);
        AdminUI?.UsersUI?.closeTierSelection?.();
        
        this.selectedUserId = null;
        this.selectedTierId = null;
    }
};