// ============================================================================
// 🧠 متحكم المستخدمين (modules/users/usersController.js) - Enterprise V16.10 💎
// 🚀 التحديث الأقصى: 
// 1. Zero-Overwrite Shield 🛡️: ربط ترقية المستوى بالسيرفر (adminUpdateUserTier) لمنع مسح أرصدة المحفظة بالخطأ.
// 2. Immortal Tier Guard 🛡️: منع مشرفي الإدارة من حذف المستوى الافتراضي الخالد (TIER_DEFAULT).
// 3. Smart Fetch Merge: دمج سجلات الذاكرة المحلية مع السيرفر لمنع اختفاء الطلبات الحية.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FirebaseAdapter, auth } from '../../core/firebaseAdapter.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const UsersController = {

    selectedUserId: null,
    selectedTierId: null,
    
    _actionLocks: new Set(),

    searchUsers: function(q) {
        EventBus.emit('req-update-state', { userSearch: (q || '').trim() });
        EventBus.emit('req-render-users');
    },

    toggleUserSort: function() {
        const nextSort = AdminData.sortUsers === 'asc' ? 'desc' : 'asc';
        EventBus.emit('req-update-state', { sortUsers: nextSort });
        EventBus.emit('req-render-users');
    },

    fetchUserHistory: async function(userId, loadMore = false) {
        if (!userId) return;
        
        if (!loadMore) {
            AdminData.tempUserHistoryLimit = 25;
            if (!AdminData.tempUserHistory) AdminData.tempUserHistory = {};
        } else {
            AdminData.tempUserHistoryLimit = (AdminData.tempUserHistoryLimit || 25) + 25;
        }

        if (AdminUI?.toggleLoader && loadMore) AdminUI.toggleLoader(true, 'جاري جلب المزيد من السجلات السحابية...');

        try {
            const fullHistory = await FirebaseAdapter.getCustomerFullHistory(userId, AdminData.tempUserHistoryLimit);
            if (fullHistory) {
                const existingLocal = AdminData.tempUserHistory.all || [];
                const mergedMap = new Map();
                
                existingLocal.forEach(tx => mergedMap.set(tx.id, tx));
                fullHistory.forEach(tx => mergedMap.set(tx.id, tx));
                
                const finalSorted = Array.from(mergedMap.values()).sort((a, b) => {
                    return RenderHelpers.parseTime(b.time || b.date || b.createdAt) - RenderHelpers.parseTime(a.time || a.date || a.createdAt);
                });

                AdminData.tempUserHistory.all = finalSorted;
                EventBus.emit('req-render-user-history'); 
            }
        } catch (error) {
            console.error("[TeleCard] Failed to fetch history:", error);
            if (loadMore) EventBus.emit('req-show-toast', { message: 'تعذر جلب السجلات السحابية', type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader && loadMore) AdminUI.toggleLoader(false);
        }
    },

    changeUserSort: function(sortType) {
        EventBus.emit('req-update-state', { userSortCategory: sortType });
        EventBus.emit('req-render-users');
    },

    saveUserEdits: async function(userId) {
        if (this._actionLocks.has('edit-user')) return;

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

        this._actionLocks.add('edit-user');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ التعديلات...');

        try {
            if (nameInput) {
                const parts = nameInput.split(' ').filter(Boolean);
                const first = parts.shift() || nameInput;
                const last = parts.join(' ').trim();
                user.firstName = first; 
                user.lastName = last;
                user.fullName = last ? `${first} ${last}` : first;
                user.name = first; 
            }

            if (email) user.email = email;
            if (phone) user.phone = phone;
            if (country) user.countryName = country;

            await AdminData?.saveUsers?.();
            const displayName = user.fullName || user.username || user.name || 'العميل';
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-users',
                modalId: 'user-edit',
                logAction: 'EDIT_USER',
                logDetails: `تم تعديل بيانات العميل: ${displayName}`,
                toastMsg: `تم تحديث ملف العميل بنجاح`
            });
            
            setTimeout(() => { EventBus.emit('action-triggered', { action: 'view-user', id: userId }); }, 350);
        } catch (error) {
            EventBus.emit('req-show-toast', {message:'تعذر حفظ التعديلات سحابياً', type:'error'});
        } finally {
            this._actionLocks.delete('edit-user');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    openBalanceAdjust: async function(type, userId) {
        if (!AdminUI || this._actionLocks.has('adjust-balance')) return;
        
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
            EventBus.emit('req-show-toast', { message: `رصيد العميل الحالي لا يكفي.`, type: 'error' });
            return;
        }
        
        this._actionLocks.add('adjust-balance');
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
                EventBus.emit('req-finish-action', { renderEvent: 'req-render-users', logAction: type === 'add' ? 'ADD_BALANCE' : 'SUB_BALANCE', logDetails: preciseMsg, toastMsg: preciseMsg });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete('adjust-balance');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    restrictUser: async function(userId) {
        if (this._actionLocks.has('restrict-user')) return;

        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        const displayName = user.fullName || user.username || user.name || 'العميل';

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من ${user.isRestricted ? 'إلغاء تقييد' : 'تقييد'} حساب (${displayName})؟`)) {
            this._actionLocks.add('restrict-user');
            try {
                user.isRestricted = !user.isRestricted;
                if (user.isRestricted) { user.isBanned = false; user.isActive = false; } 
                else { user.isActive = !user.isBanned; }
                
                await AdminData?.saveUsers?.();
                EventBus.emit('action-triggered', { action: 'view-user', id: userId });
                const msg = `تم ${user.isRestricted ? 'تقييد' : 'إلغاء تقييد'} حساب العميل ${displayName}`;
                
                EventBus.emit('req-finish-action', { renderEvent: 'req-render-users', logAction: user.isRestricted ? 'RESTRICT_USER' : 'UNRESTRICT_USER', logDetails: msg, toastMsg: msg });
            } finally {
                this._actionLocks.delete('restrict-user');
            }
        }
    },

    banUser: async function(userId) {
        if (this._actionLocks.has('ban-user')) return;

        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const displayName = user.fullName || user.username || user.name || 'العميل';
        const isCurrentlyBanned = user.isBanned;
        const actionTitle = isCurrentlyBanned ? 'إلغاء الحظر' : 'الإعدام والحظر السحابي';

        let banReason = '';
        if (!isCurrentlyBanned) {
            banReason = await AdminUI.showPrompt(`⚠️ تحذير: سيتم طرد (${displayName}) وتدمير جلساته.\nأدخل سبب الحظر:`, actionTitle, 'مخالفة الشروط والأحكام');
            if (banReason === null) return; 
        } else {
            if (!await AdminUI.showConfirm(`هل أنت متأكد من إلغاء حظر (${displayName})؟`, actionTitle)) return;
        }

        this._actionLocks.add('ban-user');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تطبيق بروتوكول الأمان...');

        try {
            const newBanStatus = !isCurrentlyBanned;
            const cloudResult = await FirebaseAdapter.callFunction('adminToggleUserBan', { targetUid: String(userId), isBanned: newBanStatus, reason: banReason });

            if (cloudResult && cloudResult.success) {
                user.isBanned = newBanStatus;
                user.banReason = banReason;
                
                if (newBanStatus) { user.isRestricted = false; user.isActive = false; } 
                else { user.isActive = !user.isRestricted; user.banReason = ''; }

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
                    if (settingsChanged) await AdminData.saveSystemSettings();
                }

                await AdminData.saveUsers();
                EventBus.emit('action-triggered', { action: 'view-user', id: userId });
                
                const msg = `تم ${newBanStatus ? 'حظر' : 'إلغاء حظر'} العميل بنجاح`;
                EventBus.emit('req-finish-action', { renderEvent: 'req-render-users', logAction: newBanStatus ? 'BAN_USER' : 'UNBAN_USER', logDetails: msg, toastMsg: msg });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `تعذر تطبيق الحظر: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete('ban-user');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    banUserIp: async function(userId) {
        if (this._actionLocks.has('ban-ip')) return;

        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const displayName = user.fullName || user.username || user.name || 'العميل';
        const targetIp = user.lastIp || user.ipAddress || user.ip || 'غير معروف';

        if (targetIp === 'غير معروف') {
            EventBus.emit('req-show-toast', { message: 'لا يوجد عنوان IP مسجل.', type: 'warning' });
            return;
        }

        const isCurrentlyIpBanned = user.isIpBanned;

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من ${isCurrentlyIpBanned ? 'رفع الحظر عن' : 'حظر'} الـ IP (${targetIp})؟`)) {
            this._actionLocks.add('ban-ip');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث الجدار الناري...');

            try {
                user.isIpBanned = !isCurrentlyIpBanned;
                if (user.isIpBanned) { user.isBanned = true; user.isRestricted = false; user.isActive = false; }

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

                if (settingsChanged) await AdminData.saveSystemSettings();
                await AdminData.saveUsers();
                if (user.isIpBanned) FirebaseAdapter.callFunction('adminToggleUserBan', { targetUid: String(userId), isBanned: true, reason: 'حظر الشبكة' }).catch(()=>{});

                EventBus.emit('action-triggered', { action: 'view-user', id: userId });
                const msg = `تم ${user.isIpBanned ? 'حظر' : 'إلغاء حظر'} الـ IP للعميل`;
                EventBus.emit('req-finish-action', { renderEvent: 'req-render-users', logAction: user.isIpBanned ? 'BAN_IP' : 'UNBAN_IP', logDetails: msg, toastMsg: msg });
            } catch (error) {
                EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء تحديث الحظر.', type: 'error' });
            } finally {
                this._actionLocks.delete('ban-ip');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    sendCustomNotification: async function(userId) {
        const msg = Utils.escapeHTML(Utils.getVal('user-custom-notif'));
        if (!msg) { EventBus.emit('req-show-toast', {message:'يرجى كتابة الرسالة أولاً', type:'error'}); return; }

        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (user) {
            user.adminMessage = msg; user.hasNewMessage = true;
            await AdminData?.saveUsers?.();
            AdminUI?.UsersUI?.clearCustomNotifInput?.();
            EventBus.emit('req-finish-action', { renderEvent: null, logAction: 'SEND_NOTIF', logDetails: `تنبيه: ${msg}`, toastMsg: `تم الإرسال بنجاح` });
        }
    },

    deleteUser: async function(userId) {
        if (this._actionLocks.has('del-user')) return;
        
        const user = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        const confirmation = await AdminUI?.showPrompt?.(`⚠️ سيتم حذف "${displayName}" نهائياً.\nاكتب كلمة "حذف" للتأكيد:`, 'بروتوكول التطهير', '');
        if (confirmation !== 'حذف') return;
        
        this._actionLocks.add('del-user');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تنفيذ التطهير...');
        
        try {
            const result = await FirebaseAdapter.callFunction('adminDeleteUserData', { targetUid: String(userId) });
            if (result && result.success) {
                AdminData.data.users = AdminData.data.users.filter(u => String(u.id) !== String(userId));
                if (AdminData.data.usersMap) delete AdminData.data.usersMap[userId];
                AdminData.data.orders = (AdminData.data.orders || []).filter(o => String(o.userId) !== String(userId));
                AdminData.data.deposits = (AdminData.data.deposits || []).filter(d => String(d.userId) !== String(userId));
                
                if (AdminRender && typeof AdminRender.updateBadges === 'function') AdminRender.updateBadges();

                EventBus.emit('req-finish-action', { renderEvent: 'req-render-users', logAction: 'DELETE_USER', logDetails: `حذف حساب ${displayName}`, toastMsg: `تم التطهير بنجاح` });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل التطهير السحابي`, type: 'error' });
        } finally {
            this._actionLocks.delete('del-user');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    revokeUserKyc: async function(userId) {
        if (!AdminUI || !await AdminUI.showConfirm('⚠️ هل أنت متأكد من إبطال توثيق هذا العميل وحذف هويته؟', 'إبطال التوثيق')) return;

        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (user) {
            if (user.kycData) {
                const imagesToBurn = [user.kycData.frontImg, user.kycData.backImg, user.kycData.selfieImg].filter(Boolean);
                if (imagesToBurn.length > 0) Promise.allSettled(imagesToBurn.map(imgUrl => FirebaseAdapter.deleteImageByUrl(imgUrl)));
            }
            user.kycStatus = 'none'; user.kycData = null;
            await AdminData?.saveUsers?.();
            AdminData?.addLog?.('KYC_REVOKED', `تم إبطال التوثيق`);
            EventBus.emit('action-triggered', { action: 'view-user', id: userId });
            EventBus.emit('req-refresh', { type: 'users' });
            EventBus.emit('req-show-toast', { message: `تم إبطال التوثيق بنجاح`, type: 'success' });
        }
    },
    
    processKycDecision: async function(userId, decision) {
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        user.kycStatus = decision === 'approve' ? 'approved' : 'rejected';
        
        if (decision === 'reject' && user.kycData) {
             const imagesToBurn = [user.kycData.frontImg, user.kycData.backImg, user.kycData.selfieImg].filter(Boolean);
             if (imagesToBurn.length > 0) Promise.allSettled(imagesToBurn.map(imgUrl => FirebaseAdapter.deleteImageByUrl(imgUrl)));
             user.kycData = null;
        }
        
        await AdminData?.saveUsers?.();
        const pendingCount = AdminData.data.users.filter(u => u.kycStatus === 'pending').length;
        AdminUI?.UsersUI?.updateSidebarKycBadge?.(pendingCount);

        EventBus.emit('req-finish-action', { renderEvent: 'req-render-kyc', logAction: null, toastMsg: `تم إرسال قرار التوثيق` });
    },

        saveTier: async function() {
        if (this._actionLocks.has('save-tier')) return;
        
        // 🛡️ 1. جلب الـ ID بذكاء وتنظيفه من أي مسافات لمنع أخطاء المطابقة
        const rawTargetId = Utils.getVal('t-id', '').trim();
        const targetId = Utils.escapeHTML(rawTargetId); 
        
        const name = Utils.escapeHTML(Utils.getVal('t-name', ''));
        const icon = Utils.escapeHTML(Utils.getVal('t-icon', 'fa-user'));
        const profit = Number(Utils.getVal('t-profit', 0));
        const minP = Number(Utils.getVal('t-min', 0));
        const cond = Number(Utils.getVal('t-cond', 0));
        const dur = Number(Utils.getVal('t-dur', 0));
        const isDef = Utils.getCheck('t-default');
        
        if (!name) return EventBus.emit('req-show-toast', { message: 'أدخل اسم المستوى', type: 'error' });
        if (profit <= 0) return EventBus.emit('req-show-toast', { message: 'لا يمكن تعيين ربح 0%', type: 'error' });
        if (minP < 0) return EventBus.emit('req-show-toast', { message: 'قاع الربح لا يمكن أن يكون سالباً.', type: 'error' });

        this._actionLocks.add('save-tier');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات المستوى...');
        
        try {
            const tiers = JSON.parse(JSON.stringify(Array.isArray(AdminData.data.tiers) ? AdminData.data.tiers : []));
            
            // 🛡️ 2. التقييم الصارم لحالة التعديل
            const isEdit = targetId !== ''; 
            let finalTierId = targetId;
            
            if (isEdit) {
                // البحث الدقيق لضمان التطابق
                const idx = tiers.findIndex(x => String(x.id).trim() === targetId);
                
                if (idx > -1) {
                    // تحديث النسخة الموجودة (Overwrite) وليس الاستنساخ
                    tiers[idx] = { ...tiers[idx], name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef };
                } else {
                    finalTierId = targetId;
                    tiers.push({ id: finalTierId, name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef, autoAdvance: true });
                }
            } else {
                // إنشاء مستوى جديد كلياً
                finalTierId = 'TIER_' + Utils.generateID();
                tiers.push({ id: finalTierId, name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef, autoAdvance: true });
            }
            
            // 🛡️ 3. تطبيق قاعدة Highlander للمستوى الافتراضي
            if (isDef) {
                tiers.forEach(x => { x.isDefault = (String(x.id) === finalTierId); });
            } else {
                const hasDefault = tiers.some(t => t.isDefault === true);
                if (!hasDefault && tiers.length > 0) {
                    tiers[0].isDefault = true; 
                    EventBus.emit('req-show-toast', { message: 'تم تعيين مستوى افتراضي إجبارياً لحماية النظام.', type: 'warning' });
                }
            }
            
            // 🛡️ 4. تحديث المصفوفة والخريطة (Map) معاً لضمان مزامنة الواجهة
            AdminData.data.tiers = tiers;
            if (!AdminData.data.tiersMap) AdminData.data.tiersMap = {};
            
            const updatedTierObj = tiers.find(t => t.id === finalTierId);
            if (updatedTierObj) AdminData.data.tiersMap[finalTierId] = updatedTierObj;

            await AdminData?.saveTiers?.();

            const idInput = document.getElementById('t-id');
            if (idInput) idInput.value = finalTierId; 

            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-tiers',
                modalId: 'tier',
                logAction: isEdit ? 'EDIT_TIER' : 'ADD_TIER',
                logDetails: `تحديث مستوى: ${name}`,
                toastMsg: `تم حفظ مستوى (${name}) بنجاح`
            });
        } catch (error) {
            console.error(error);
            EventBus.emit('req-show-toast', { message: 'حدث خطأ غير متوقع أثناء الحفظ', type: 'error' });
        } finally {
            this._actionLocks.delete('save-tier'); 
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    // 🛡️ التحديث المعماري (Immortal Tier Guard)
    deleteTier: async function(id) {
        if (this._actionLocks.has('del-tier')) return;
        if (!AdminData.data.tiers) return;
        
        const strId = String(id).trim();
        const tierToDelete = AdminData.data.tiersMap[strId] || AdminData.data.tiers.find(t => String(t.id) === strId);
        if (!tierToDelete) return;
        
        // 🛡️ الحماية المطلقة: منع حذف المستوى الافتراضي أو المستوى الخالد نهائياً
        if (tierToDelete.isDefault || strId === 'TIER_DEFAULT') {
            EventBus.emit('req-show-toast', { message: 'إجراء أمني مرفوض: لا يمكن حذف المستوى الافتراضي الخالد لحماية النظام.', type: 'error' });
            return;
        }

        // 🛡️ التوجيه الآمن للمستوى الخالد ليكون طوق النجاة للعملاء المنقولين
        const defaultTier = AdminData.data.tiers.find(t => t.isDefault) || AdminData.data.tiers.find(t => String(t.id) === 'TIER_DEFAULT') || AdminData.data.tiers[0];
        if (!defaultTier) {
            EventBus.emit('req-show-toast', { message: 'خطأ حرج: لم يتم العثور على مستوى بديل آمن لنقل العملاء إليه.', type: 'error' });
            return;
        }

        const usersInTier = (AdminData.data.users || []).filter(u => String(u.tierId) === strId);
        const userCount = usersInTier.length;
        
        let msg = userCount > 0 
            ? `⚠️ تنبيه أمان هام!\nهذا المستوى يضم (${userCount}) عميل حالياً.\nسيتم نقلهم جميعاً إلى المستوى الافتراضي (${defaultTier.name}).\nهل أنت متأكد؟` 
            : `هل أنت متأكد من حذف مستوى "${tierToDelete.name}" نهائياً؟`;

        if (AdminUI && await AdminUI.showConfirm(msg, 'تأكيد إزالة المستوى')) {
            this._actionLocks.add('del-tier');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حذف المستوى وتحديث العملاء سحابياً...');
            
            try {
                if (userCount > 0) {
                    AdminData.data.users.forEach(u => { 
                        if (String(u.tierId) === strId) u.tierId = String(defaultTier.id); 
                    });
                    await AdminData?.saveUsers?.();
                }

                AdminData.data.tiers = AdminData.data.tiers.filter(t => String(t.id) !== strId);
                await AdminData?.saveTiers?.();
                
                EventBus.emit('req-render-tiers');
                EventBus.emit('req-render-users');
                EventBus.emit('req-show-toast', { message: `تم الحذف ونقل العملاء بأمان`, type: 'success' });
            } catch (error) {
                EventBus.emit('req-show-toast', { message: `حدث خطأ أثناء الحذف`, type: 'error' });
            } finally {
                this._actionLocks.delete('del-tier');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    // 🛡️ التحديث المعماري (Zero-Overwrite Shield)
    updateUserTier: async function(userId, tierId) {
        if (this._actionLocks.has('update-tier')) return;
        this._actionLocks.add('update-tier');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث المستوى سحابياً بأمان...');
        
        try {
            // 🛡️ استدعاء دالة السيرفر الآمنة لمنع اختفاء الإيداعات أو تدمير المحفظة (No Dirty Writes)
            const result = await FirebaseAdapter.callFunction('adminUpdateUserTier', {
                userId: String(userId),
                newTierId: String(tierId),
                manualOverride: true 
            });

            if (result && result.success) {
                const user = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(u => String(u.id) === String(userId));
                if (user) {
                    user.tierId = tierId; 
                    user.manualTierOverride = true; 
                    user.tierCycleSpent = 0;
                    user.tierCycleStartDate = Date.now();
                }
                
                if(AdminRender && typeof AdminRender.renderTierUsersPage === 'function') {
                   AdminRender.renderTierUsersPage();
                }
                EventBus.emit('req-render-tiers');
                EventBus.emit('action-triggered', { action: 'view-user', id: userId });
                EventBus.emit('req-show-toast', { message: `تم ترقية العميل بنجاح دون المساس برصيده`, type: 'success' });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete('update-tier');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    sendPasswordReset: async function(userId) {
        if (this._actionLocks.has('pwd-reset')) return;

        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user || !user.email) return EventBus.emit('req-show-toast', { message: 'البريد غير متوفر', type: 'error' });

        if (AdminUI && await AdminUI.showConfirm(`تأكيد إرسال رابط استعادة لـ (${user.email})؟`)) {
            this._actionLocks.add('pwd-reset');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إرسال الرابط...');
            
            try {
                await sendPasswordResetEmail(auth, user.email);
                EventBus.emit('req-show-toast', { message: `تم الإرسال بنجاح`, type: 'success' });
            } catch (error) {
                EventBus.emit('req-show-toast', { message: 'فشل الإرسال: ' + error.message, type: 'error' });
            } finally {
                this._actionLocks.delete('pwd-reset');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    confirmTierSelection: function() {
        if (!this.selectedUserId || !this.selectedTierId) {
            return EventBus.emit('req-show-toast', { message: 'حدد مستوى أولاً', type: 'error' });
        }
        
        this.updateUserTier(this.selectedUserId, this.selectedTierId);
        AdminUI?.UsersUI?.closeTierSelection?.();
        
        this.selectedUserId = null; 
        this.selectedTierId = null;
    },

    toggleTierAutoFor: async function(id, isAuto) {
        if (this._actionLocks.has(`toggle-auto-${id}`)) return;
        this._actionLocks.add(`toggle-auto-${id}`);
        
        try {
            const tier = AdminData.data.tiersMap[id] || AdminData.data.tiers.find(t => String(t.id) === String(id));
            if (tier) {
                tier.autoAdvance = isAuto;
                await AdminData?.saveTiers?.();
                EventBus.emit('req-render-tiers');
            }
        } finally {
            this._actionLocks.delete(`toggle-auto-${id}`);
        }
    }
};
