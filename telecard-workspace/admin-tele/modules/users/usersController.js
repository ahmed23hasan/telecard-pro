// ============================================================================
// 🧠 متحكم المستخدمين (modules/users/usersController.js) - النسخة الماسية V8.5 💎
// الوظيفة: معالجة العمليات المنطقية للعملاء، وتطبيق "الإعدام السحابي" والقوائم السوداء.
// 🚀 التحديث: فك الارتباط الدائري تماماً وتطهير كافة دوال البحث الخطي لنظام O(1)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';

// 🚀 [نقاء هندسي]: تم حذف استيراد AppController تماماً لكسر الارتباط الدائري الميت!
import { FirebaseAdapter, auth } from '../../core/firebaseAdapter.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const UsersController = {

    selectedUserId: null,
    selectedTierId: null,

    // =========================================================
    // 👥 1. الإدارة العامة للعملاء
    // =========================================================
    searchUsers: function(q) {
        // ⚡ التحديث النقي: بث حدث لتحديث الحالة بدلاً من استدعاء AppController المباشر
        EventBus.emit('req-update-state', { userSearch: (q || '').trim() });
        EventBus.emit('req-render-users');
    },

    toggleUserSort: function() {
        const nextSort = AdminData.sortUsers === 'asc' ? 'desc' : 'asc';
        EventBus.emit('req-update-state', { sortUsers: nextSort });
        EventBus.emit('req-render-users');
    },

    // =========================================================
    // 📊 السجل المالي الشامل للعميل (Unified Ledger)
    // =========================================================
    openUserFullHistory: async function(userId) {
        if (!userId) return;
        
        // 1. (Optimistic UI): جلب سريع ومحلي بـ O(1)
        const localOrders = (AdminData.data.orders || []).filter(o => String(o.userId) === String(userId)).map(o => ({ ...o, txType: 'order' }));
        const localDeposits = (AdminData.data.deposits || []).filter(d => String(d.userId) === String(userId)).map(d => ({ ...d, txType: 'deposit' }));
        
        let combinedActivity = [...localOrders, ...localDeposits].sort((a, b) => {
            return (b.time || b.createdAt || b.date) - (a.time || a.createdAt || a.date);
        });

        if (AdminUI?.UsersUI?.renderFullHistoryModal) {
            AdminUI.UsersUI.renderFullHistoryModal(userId, combinedActivity);
        }
        
        // 2. تحديث السجل سحابياً في الخلفية بهدوء
        try {
            const fullHistory = await FirebaseAdapter.getCustomerFullHistory(userId, 25);
            if (fullHistory && fullHistory.length > 0) {
                 AdminUI.UsersUI.renderFullHistoryModal(userId, fullHistory);
            }
        } catch (error) {
            console.error("[TeleCard] Failed to sync full history in background:", error);
        }
    },

    changeUserSort: function(sortType) {
        EventBus.emit('req-update-state', { userSortCategory: sortType });
        EventBus.emit('req-render-users');
    },

    saveUserEdits: async function(userId) {
        // ⚡ استخدام البحث السريع O(1) بدلاً من البحث الخطي
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
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
            
            // ⚡ التحديث النقي: إنهاء الإجراء بحدث موحد
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-users',
                logAction: 'EDIT_USER',
                logDetails: `تم تعديل بيانات العميل: ${displayName}`,
                toastMsg: `تم تحديث ملف العميل (${displayName}) بنجاح`
            });
            
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
        
        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
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
                EventBus.emit('req-refresh', { type: 'deposits' });

                const preciseMsg = `تم ${actionName} مبلغ ${adjustAmount} ${displayCur} للعميل ${displayName}`;
                
                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-users',
                    logAction: type === 'add' ? 'ADD_BALANCE' : 'SUB_BALANCE',
                    logDetails: preciseMsg,
                    toastMsg: preciseMsg
                });
            }
        } catch (error) {
            console.error("Balance Adjust Error:", error);
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    restrictUser: async function(userId) {
        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
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
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-users',
                logAction: user.isRestricted ? 'RESTRICT_USER' : 'UNRESTRICT_USER',
                logDetails: msg,
                toastMsg: msg
            });
        }
    },

    banUser: async function(userId) {
        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const displayName = user.fullName || user.username || user.name || 'العميل';
        const isCurrentlyBanned = user.isBanned;
        const actionTitle = isCurrentlyBanned ? 'إلغاء الحظر' : 'الإعدام والحظر السحابي';

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

            const cloudResult = await FirebaseAdapter.callFunction('adminToggleUserBan', {
                targetUid: String(userId),
                isBanned: newBanStatus,
                reason: banReason
            });

            if (cloudResult && cloudResult.success) {
                user.isBanned = newBanStatus;
                user.banReason = banReason;
                
                if (newBanStatus) {
                    user.isRestricted = false;
                    user.isActive = false;
                } else {
                    user.isActive = !user.isRestricted;
                    user.banReason = '';
                }

                if (newBanStatus) {
                    if (!AdminData.data.settings) AdminData.data.settings = {};
                    let settingsChanged = false;
                    
                    const targetIp = user.lastIp || user.ipAddress || user.ip;
                    if (targetIp && targetIp !== 'غير معروف') {
                        if (!AdminData.data.settings.bannedIps) AdminData.data.settings.bannedIps = [];
                        if (!AdminData.data.settings.bannedIps.includes(targetIp)) {
                            AdminData.data.settings.bannedIps.push(targetIp);
                            settingsChanged = true;
                        }
                    }

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
                    }
                }

                await AdminData.saveUsers();
                AdminRender?.viewUser?.(userId, true);
                
                const msg = `تم ${newBanStatus ? 'حظر وتدمير جلسات' : 'إلغاء حظر'} العميل ${displayName} بنجاح`;
                
                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-users',
                    logAction: newBanStatus ? 'BAN_USER' : 'UNBAN_USER',
                    logDetails: msg,
                    toastMsg: msg
                });
            }
        } catch (error) {
            console.error("Cloud Ban Error:", error);
            EventBus.emit('req-show-toast', { message: `تعذر تطبيق الحظر السحابي: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    banUserIp: async function(userId) {
        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
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
                
                if (user.isIpBanned) {
                    FirebaseAdapter.callFunction('adminToggleUserBan', { targetUid: String(userId), isBanned: true, reason: 'حظر الشبكة والأمان (IP Ban)' }).catch(()=>console.warn("Soft fail on cloud ban"));
                }

                AdminRender?.viewUser?.(userId, true);
                const msg = `تم ${user.isIpBanned ? 'حظر' : 'إلغاء حظر'} الـ IP للعميل ${displayName}`;
                
                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-users',
                    logAction: user.isIpBanned ? 'BAN_IP' : 'UNBAN_IP',
                    logDetails: msg,
                    toastMsg: msg
                });

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

        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (user) {
            const displayName = user.fullName || user.username || user.name || 'العميل';
            user.adminMessage = msg;
            user.hasNewMessage = true;
            await AdminData?.saveUsers?.();
            AdminUI?.UsersUI?.clearCustomNotifInput?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: null,
                logAction: 'SEND_NOTIF',
                logDetails: `تم إرسال إشعار مخصص للعميل ${displayName}`,
                toastMsg: `تم إرسال التنبيه للعميل (${displayName}) بنجاح`
            });
        }
    },

    // =========================================================
// 🗑️ حذف العميل وتطهير السجلات (Cloud Purge Protocol)
// =========================================================
deleteUser: async function(userId) {
    // ⚡ 1. جلب فوري بـ O(1) للبيانات من الخريطة المركزية
    const user = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(u => String(u.id) === String(userId));
    if (!user) return;
    
    const displayName = user.fullName || user.username || user.name || 'العميل';
    const confirmMsg = `⚠️ تحذير أمني خطير!\nأنت على وشك حذف الحساب "${displayName}" وكل سجلاته المالية نهائياً.\nهذا الإجراء سيقوم بتطهير السحابة من كل طلباته وإيداعاته السابقة.\nاكتب كلمة "حذف" للتأكيد النهائي:`;
    
    // 🛡️ 2. التحقق البشري الصارم لمنع الحذف بالخطأ
    const confirmation = await AdminUI?.showPrompt?.(confirmMsg, 'بروتوكول تطهير حساب عميل', '');
    if (confirmation !== 'حذف') return;
    
    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تنفيذ بروتوكول التطهير السحابي...');
    
    try {
        // 🚀 3. [تحديث سحابي]: استدعاء دالة المسح الشامل (التي بنيناها في السيرفر)
        // هذه الدالة ستقوم بمسح: (حساب الـ Auth، بيانات المستخدم، كل طلباته، وكل إيداعاته)
        const result = await FirebaseAdapter.callFunction('adminDeleteUserData', { targetUid: String(userId) });
        
        if (result && result.success) {
            
            // ⚡ 4. التحديث المحلي الفوري لضمان نظافة الذاكرة (Memory Cleanup)
            AdminData.data.users = AdminData.data.users.filter(u => String(u.id) !== String(userId));
            if (AdminData.data.usersMap) delete AdminData.data.usersMap[userId];
            
            // تنظيف الطلبات والإيداعات المعروضة حالياً أمام الأدمن
            AdminData.data.orders = (AdminData.data.orders || []).filter(o => String(o.userId) !== String(userId));
            AdminData.data.deposits = (AdminData.data.deposits || []).filter(d => String(d.userId) !== String(userId));
            
            // 🌟 5. إنهاء الإجراء وإصدار أوامر الرسم السحابية
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-users',
                logAction: 'DELETE_USER',
                logDetails: `تم حذف حساب العميل ${displayName} وتطهير كافة سجلاته من السحابة بنجاح.`,
                toastMsg: `تم تطهير بيانات الحساب (${displayName}) نهائياً`
            });
        }
    } catch (error) {
        console.error("Delete User Critical Error:", error);
        EventBus.emit('req-show-toast', { message: `فشل التطهير السحابي: ${error.message}`, type: 'error' });
    } finally {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
    }
},    // =========================================================
    // 🛡️ 2. نظام التوثيق (KYC)
    // =========================================================
    revokeUserKyc: async function(userId) {
        if (!AdminUI) return;
        const confirmed = await AdminUI.showConfirm('⚠️ تحذير أمني:\nهل أنت متأكد من إبطال توثيق هذا العميل وحذف صور الهوية نهائياً؟\nسيتم إجباره على رفع البيانات من جديد ولن يمكن التراجع عن هذا الإجراء.', 'إبطال التوثيق (KYC)');
        if (!confirmed) return;

        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (user) {
            const displayName = user.fullName || user.username || user.name || 'العميل';
            user.kycStatus = 'none';
            user.kycData = null;
            await AdminData?.saveUsers?.();
            
            if (AdminData?.addLog) AdminData.addLog('KYC_REVOKED', `تم إبطال توثيق وحذف مستندات العميل ${displayName} (اشتباه أمني)`);
            AdminRender?.viewUser?.(userId, true);
            EventBus.emit('req-refresh', { type: 'users' });
            EventBus.emit('req-show-toast', { message: `تم إبطال توثيق العميل (${displayName}) بنجاح`, type: 'success' });
        }
    },
    
    processKycDecision: async function(userId, decision) {
        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
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

        EventBus.emit('req-finish-action', {
            renderEvent: 'req-render-kyc',
            modalId: null,
            logAction: null,
            logDetails: null,
            toastMsg: `تم ${actionText} طلب توثيق العميل (${displayName})`
        });
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

            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-tiers',
                logAction: isEdit ? 'EDIT_TIER' : 'ADD_TIER',
                logDetails: `تحديث مستوى: ${name}`,
                toastMsg: `تم حفظ مستوى (${name}) بنجاح`
            });
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
        
        // ⚡ جلب فوري بـ O(1) بدلاً من البحث الخطي
        const tierToDelete = AdminData.data.tiersMap[strId] || AdminData.data.tiers.find(t => String(t.id) === strId);
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
        // ⚡ جلب فوري بـ O(1) للعميل والمستوى معاً
        const user = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(u => String(u.id) === String(userId));
        if (user) {
            const displayName = user.fullName || user.username || user.name || 'العميل';
            const targetTier = AdminData.data.tiersMap?.[tierId] || AdminData.data.tiers.find(t => String(t.id) === String(tierId));
            const tierName = targetTier ? targetTier.name : 'مستوى جديد';

            user.tierId = tierId;
            user.manualTierOverride = true;
            user.tierCycleSpent = 0;
            user.tierCycleStartDate = Date.now();
            await AdminData?.saveUsers?.();
            
            AdminData?.addLog?.('UPDATE_USER_TIER', `تغيير مستوى العميل ${displayName} إلى (${tierName})`);
            AdminRender?.renderTierUsersPage?.();
            EventBus.emit('req-render-tiers');
            EventBus.emit('req-show-toast', { message: `تم ترقية العميل (${displayName}) إلى (${tierName}) بنجاح`, type: 'success' });
        }
    },
    
    sendPasswordReset: async function(userId) {
        // ⚡ جلب فوري بـ O(1)
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
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