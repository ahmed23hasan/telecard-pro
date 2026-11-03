// ============================================================================
// 🧠 متحكم المستخدمين (modules/users/usersController.js) - Cloud-Native V20.2 💎
// 🚀 التحديثات المعمارية (V20.2 - Standardized Triggers, KYC & State Sync):
// 1. Unlimited Duration Support ♾️: دعم حفظ المهلة المفتوحة (0 = ∞) في المستويات دون تحويلها قسراً إلى 30 يوماً.
// 2. Isolated KYC Fix 🪪: إجبار تحديث telecard_kyc/{userId} ومسح ملاحظات الرفض السابقة عند القبول عبر deleteField().
// 3. KYC Badge Sync 🔔: مزامنة فورية لعدد طلبات التوثيق المعلقة في القائمة الجانبية عند الرفض أو الإبطال.
// 4. Standard Notification Schema 📨: توحيد بنية الإشعارات الإدارية بإدراج targetType و targetId لتطابق تريجرات السيرفر.
// 5. Active Firewall Sync 🛡️: المزامنة اللحظية لحظر/إزالة أجهزة وشبكات العميل مع وثيقة active_configs المخصصة.
// 6. Zero-Read Balance ⚡: تحديث مصفوفة الإيداعات محلياً عند تعديل رصيد العميل دون إهدار 50 قراءة سحابية.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FirebaseAdapter, auth } from '../../core/firebaseAdapter.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { FinancialEngine } from '../../core/financialEngine.js';

export const UsersController = {
    selectedUserId: null,
    selectedTierId: null,
    _actionLocks: new Set(),

    _getUserSafely: async function(userId) {
        const strId = String(userId);
        let u = AdminData.data.usersMap?.[strId] ||
                (AdminData.data.users || []).find(x => String(x.id) === strId) ||
                (AdminData.data.kycPendingUsers || []).find(x => String(x.id) === strId);
        if (u) {
            if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
            AdminData.data.usersMap[strId] = u;
            return u;
        }
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري استدعاء بيانات العميل سحابياً...');
        try {
            u = await FirebaseAdapter.getById('telecard_users', strId);
            if (u) {
                if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                AdminData.data.usersMap[String(u.id)] = u;
            }
        } catch(e) { 
            console.error("🚨 فشل جلب العميل من السيرفر:", e);
            EventBus.emit('req-show-toast', { message: 'فشل استدعاء بيانات العميل. تأكد من اتصالك.', type: 'error' });
        }
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        
        return u;
    },

    searchUsers: async function(q) {
        const query = (q || '').trim();
        EventBus.emit('req-update-state', { userSearch: query });
        
        AdminData.cursors.users = null;
        AdminData.data.users = [];
        
        EventBus.emit('req-render-users');
        
        if (AdminRender?.UsersRender?.loadMoreUsers) {
            AdminRender.UsersRender.loadMoreUsers();
        }
    },

    toggleUserSort: function() {
        const currentSort = AdminRender?.UsersRender?.state?.sortUsers || 'desc';
        EventBus.emit('req-update-state', { sortUsers: currentSort === 'desc' ? 'asc' : 'desc' });
        
        AdminData.cursors.users = null;
        AdminData.data.users = [];
        
        EventBus.emit('req-render-users');
        if (AdminRender?.UsersRender?.loadMoreUsers) AdminRender.UsersRender.loadMoreUsers();
    },

    changeUserSort: function(val) {
        EventBus.emit('req-update-state', { userSortCategory: val, sortUsers: 'desc' });
        
        AdminData.cursors.users = null;
        AdminData.data.users = [];
        
        EventBus.emit('req-render-users');
        if (AdminRender?.UsersRender?.loadMoreUsers) AdminRender.UsersRender.loadMoreUsers();
    },

    fetchUserHistory: async function(userId, isLoadMore = false) {
        const u = await this._getUserSafely(userId);
        if (!u) return;

        const limitCount = isLoadMore ? (AdminData.tempUserHistoryLimit || 25) + 25 : 25;
        AdminData.tempUserHistoryLimit = limitCount;
        
        const loadBtn = document.getElementById('btn-load-more-user-history');
        if (loadBtn) {
            loadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الجلب...';
            loadBtn.disabled = true;
        }

        try {
            const activities = await FirebaseAdapter.getCustomerFullHistory(userId, limitCount);
            activities.forEach(tx => {
                if (tx.txType === 'order' && AdminData.data.ordersMap) AdminData.data.ordersMap[String(tx.id)] = tx;
                if (tx.txType === 'deposit' && AdminData.data.depositsMap) AdminData.data.depositsMap[String(tx.id)] = tx;
            });
            AdminData.tempUserHistory = { all: activities };
            EventBus.emit('req-render-user-history');
        } catch (error) {
            console.error("فشل جلب سجل العميل:", error);
            EventBus.emit('req-show-toast', { message: 'تعذر جلب السجل المالي سحابياً', type: 'error' });
        } finally {
            if (loadBtn) {
                loadBtn.innerHTML = '<i class="fa-solid fa-angle-down"></i> عرض المزيد (سحابياً)';
                loadBtn.disabled = false;
            }
        }
    },

    saveUserEdits: async function(userId) {
        if (this._actionLocks.has(`edit-user-${userId}`)) return;
        
        const u = await this._getUserSafely(userId);
        if (!u) return;
        
        const newName = Utils.getVal('user-edit-name').trim();
        const newEmail = Utils.getVal('user-edit-email').trim().toLowerCase();
        const newPhone = Utils.getVal('user-edit-phone').trim();
        const newCountry = Utils.getVal('user-edit-country').trim();
        
        if (!newName) return EventBus.emit('req-show-toast', { message: 'يجب إدخال الاسم الكامل', type: 'warning' });
        if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            return EventBus.emit('req-show-toast', { message: 'يرجى إدخال بريد إلكتروني صحيح', type: 'warning' });
        }
        
        this._actionLocks.add(`edit-user-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فحص وتحديث بيانات العميل في المصادقة والسحابة...');
        
        try {
            const res = await FirebaseAdapter.callFunction('adminUpdateUserProfile', {
                targetUid: String(userId),
                fullName: newName,
                email: newEmail,
                phone: newPhone,
                country: newCountry
            });
            
            if (res && res.success && res.updatedData) {
                u.fullName = res.updatedData.fullName;
                u.firstName = res.updatedData.firstName;
                u.lastName = res.updatedData.lastName;
                u.email = res.updatedData.email;
                u.phone = res.updatedData.phone;
                u.country = res.updatedData.country;
                
                EventBus.emit('req-render-users');
                if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId, true);
                AdminUI?.closeModal?.('user-edit');
                
                const successMsg = res.emailChanged ?
                    'تم تحديث بيانات العميل وبريده الإلكتروني في نظام الدخول بنجاح!' :
                    'تم تحديث بيانات العميل بنجاح';
                EventBus.emit('req-show-toast', { message: successMsg, type: 'success' });
                if (AdminData?.addLog) AdminData.addLog('EDIT_USER_PROFILE', `تعديل بيانات العميل: ${u.fullName} (${u.email})`);
            } else {
                throw new Error('لم يؤكد السيرفر عملية التحديث.');
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: error.message || 'فشل التحديث سحابياً', type: 'error' });
        } finally {
            this._actionLocks.delete(`edit-user-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    deleteUser: async function(userId) {
        if (this._actionLocks.has(`del-user-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u) return;

        const msg = `تحذير أمني شديد الخطورة!\nهل أنت متأكد من حذف العميل (${u.fullName || u.username}) بشكل نهائي؟\n(ملاحظة: سيتم محو جميع صوره وهوياته ولن يتمكن من الدخول نهائياً).`;
        
        if (AdminUI && await AdminUI.showConfirm(msg, 'إعدام الحساب')) {
            this._actionLocks.add(`del-user-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تدمير الحساب سحابياً...');

            try {
                const result = await FirebaseAdapter.callFunction('adminDeleteUserData', { targetUid: userId });
                if (result && result.success) {
                    AdminData.data.users = (AdminData.data.users || []).filter(x => String(x.id) !== String(userId));
                    if (Array.isArray(AdminData.data.kycPendingUsers)) {
                        AdminData.data.kycPendingUsers = AdminData.data.kycPendingUsers.filter(x => String(x.id) !== String(userId));
                    }
                    
                    if (AdminData.data.usersMap && AdminData.data.usersMap[userId]) {
                        AdminData.data.usersMap[userId] = {
                            id: userId,
                            fullName: 'حساب محذوف',
                            displayId: 'DELETED',
                            isBanned: true,
                            isDeleted: true
                        };
                    }
                    
                    AdminData.data.tierUserCounts = null;
                    EventBus.emit('req-render-users');
                    EventBus.emit('req-render-kyc');
                    AdminUI?.closeModal?.('user-detail');
                    EventBus.emit('req-show-toast', { message: 'تم تدمير الحساب بالكامل', type: 'success' });
                } else {
                    throw new Error("لم يوافق السيرفر على العملية.");
                }
            } catch (error) {
                EventBus.emit('req-show-toast', { message: `فشل الحذف: ${error.message}`, type: 'error' });
            } finally {
                this._actionLocks.delete(`del-user-${userId}`);
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    restrictUser: async function(userId) {
        if (this._actionLocks.has(`restrict-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u) return;

        const newState = !u.isRestricted;
        const msg = newState 
            ? `هل أنت متأكد من تقييد العميل (${u.fullName || u.username})؟\nلن يتمكن من إجراء أي عملية شراء أو إيداع.`
            : `هل أنت متأكد من رفع التقييد عن العميل؟`;

        if (AdminUI && await AdminUI.showConfirm(msg)) {
            this._actionLocks.add(`restrict-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التنفيذ...');

            try {
                await FirebaseAdapter.updateDocument('telecard_users', userId, { isRestricted: newState });
                u.isRestricted = newState;
                
                EventBus.emit('req-render-users');
                if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId, true);
                
                EventBus.emit('req-show-toast', { message: newState ? 'تم تقييد الحساب' : 'تم رفع التقييد', type: 'success' });
                if (AdminData?.addLog) AdminData.addLog('RESTRICT_USER', `العميل: ${u.fullName || u.username} | الحالة: ${newState}`);
            } catch (error) {
                EventBus.emit('req-show-toast', { message: 'فشل الإجراء السحابي', type: 'error' });
            } finally {
                this._actionLocks.delete(`restrict-${userId}`);
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    banUser: async function(userId) {
        if (this._actionLocks.has(`ban-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u) return;

        const displayName = u.fullName || u.username || u.name || 'العميل';
        const isCurrentlyBanned = u.isBanned;
        const actionTitle = isCurrentlyBanned ? 'إلغاء الحظر' : 'الإعدام والحظر السحابي';

        let banReason = '';
        if (!isCurrentlyBanned) {
            banReason = await AdminUI.showPrompt(`⚠️ تحذير: سيتم طرد (${displayName}) وتدمير جلساته.\nأدخل سبب الحظر:`, actionTitle, 'مخالفة الشروط والأحكام');
            if (banReason === null) return; 
        } else {
            if (!await AdminUI.showConfirm(`هل أنت متأكد من إلغاء حظر (${displayName}) والسماح له بالدخول مجدداً؟`, actionTitle)) return;
        }

        this._actionLocks.add(`ban-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إرسال القرار للسيرفر...');

        try {
            const result = await FirebaseAdapter.callFunction('adminToggleUserBan', { targetUid: userId, isBanned: !isCurrentlyBanned, reason: banReason });
            if (result && result.success) {
                u.isBanned = !isCurrentlyBanned;
                u.banReason = banReason;
                
                if (u.isBanned) { u.isRestricted = false; u.isActive = false; } 
                else { u.isActive = !u.isRestricted; u.banReason = ''; }

                if (!AdminData.data.settings) AdminData.data.settings = {};
                if (!AdminData.data.activeConfigs) AdminData.data.activeConfigs = {};
                if (!Array.isArray(AdminData.data.settings.bannedIps)) AdminData.data.settings.bannedIps = [];
                if (!Array.isArray(AdminData.data.settings.bannedDevices)) AdminData.data.settings.bannedDevices = [];
                if (!Array.isArray(AdminData.data.activeConfigs.bannedIps)) AdminData.data.activeConfigs.bannedIps = [...AdminData.data.settings.bannedIps];
                if (!Array.isArray(AdminData.data.activeConfigs.bannedDevices)) AdminData.data.activeConfigs.bannedDevices = [...AdminData.data.settings.bannedDevices];

                const targetIp = String(u.lastIp || u.ipAddress || u.ip || '').trim();
                const validDevices = Array.isArray(u.devicePrints) ? u.devicePrints.filter(Boolean) : [];
                const firewallUpdates = {};

                if (u.isBanned) {
                    if (validDevices.length > 0) {
                        const currentBannedDevices = new Set(AdminData.data.activeConfigs.bannedDevices);
                        validDevices.forEach(device => {
                            if (!currentBannedDevices.has(device)) {
                                AdminData.data.activeConfigs.bannedDevices.push(device);
                            }
                        });
                        AdminData.data.settings.bannedDevices = [...AdminData.data.activeConfigs.bannedDevices];
                        firewallUpdates.bannedDevices = arrayUnion(...validDevices);
                    }
                } else {
                    if (u.isIpBanned) {
                        await FirebaseAdapter.updateDocument('telecard_users', userId, { isIpBanned: false }).catch(() => {});
                        u.isIpBanned = false;
                    }
                    if (targetIp && AdminData.data.activeConfigs.bannedIps.includes(targetIp)) {
                        AdminData.data.activeConfigs.bannedIps = AdminData.data.activeConfigs.bannedIps.filter(ip => ip !== targetIp);
                        AdminData.data.settings.bannedIps = [...AdminData.data.activeConfigs.bannedIps];
                        firewallUpdates.bannedIps = arrayRemove(targetIp);
                    }
                    if (validDevices.length > 0) {
                        AdminData.data.activeConfigs.bannedDevices = AdminData.data.activeConfigs.bannedDevices.filter(dev => !validDevices.includes(dev));
                        AdminData.data.settings.bannedDevices = [...AdminData.data.activeConfigs.bannedDevices];
                        firewallUpdates.bannedDevices = arrayRemove(...validDevices);
                    }
                }

                if (Object.keys(firewallUpdates).length > 0) {
                    await FirebaseAdapter.set('telecard_system', 'active_configs', firewallUpdates);
                }

                EventBus.emit('action-triggered', { action: 'view-user', id: userId });
                
                const msg = `تم ${u.isBanned ? 'حظر' : 'إلغاء حظر'} العميل بنجاح`;
                EventBus.emit('req-finish-action', { renderEvent: 'req-render-users', logAction: u.isBanned ? 'BAN_USER' : 'UNBAN_USER', logDetails: msg, toastMsg: msg });
            } else {
                throw new Error("تم رفض الطلب من السيرفر");
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `خطأ: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete(`ban-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    banUserIp: async function(userId, ipToBan) {
        const u = await this._getUserSafely(userId);
        if (!u) return;
        const isCurrentlyIpBanned = Boolean(u.isIpBanned);
        const cleanIp = String(ipToBan || '').trim();

        if (!isCurrentlyIpBanned && (!cleanIp || cleanIp === 'غير متوفر')) {
            return EventBus.emit('req-show-toast', { message: 'لا يوجد عنوان IP مسجل لهذا العميل.', type: 'warning' });
        }

        const confirmMsg = isCurrentlyIpBanned
            ? `هل أنت متأكد من رفع حظر الشبكة (IP) عن هذا العميل؟`
            : `سيتم حظر عنوان الـ IP (${cleanIp}) من دخول المتجر نهائياً.\nهل أنت متأكد؟`;

        if (AdminUI && await AdminUI.showConfirm(confirmMsg, isCurrentlyIpBanned ? 'رفع حظر الشبكة' : 'حظر شبكة العميل')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث الجدار الناري...');
            
            try {
                if (!AdminData.data.settings) AdminData.data.settings = {};
                if (!AdminData.data.activeConfigs) AdminData.data.activeConfigs = {};
                if (!Array.isArray(AdminData.data.settings.bannedIps)) AdminData.data.settings.bannedIps = [];
                if (!Array.isArray(AdminData.data.activeConfigs.bannedIps)) AdminData.data.activeConfigs.bannedIps = [...AdminData.data.settings.bannedIps];
                
                if (isCurrentlyIpBanned) {
                    if (cleanIp) {
                        AdminData.data.activeConfigs.bannedIps = AdminData.data.activeConfigs.bannedIps.filter(ip => ip !== cleanIp);
                        AdminData.data.settings.bannedIps = [...AdminData.data.activeConfigs.bannedIps];
                        await FirebaseAdapter.set('telecard_system', 'active_configs', { bannedIps: arrayRemove(cleanIp) });
                    }
                    await FirebaseAdapter.updateDocument('telecard_users', userId, { isIpBanned: false });
                    u.isIpBanned = false;
                } else {
                    if (!AdminData.data.activeConfigs.bannedIps.includes(cleanIp)) {
                        AdminData.data.activeConfigs.bannedIps.push(cleanIp);
                    }
                    AdminData.data.settings.bannedIps = [...AdminData.data.activeConfigs.bannedIps];
                    await FirebaseAdapter.set('telecard_system', 'active_configs', { bannedIps: arrayUnion(cleanIp) });
                    await FirebaseAdapter.updateDocument('telecard_users', userId, { isIpBanned: true });
                    u.isIpBanned = true;
                }

                if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId, true);
                EventBus.emit('req-show-toast', { message: isCurrentlyIpBanned ? 'تم رفع حظر الـ IP بنجاح' : 'تم حظر الـ IP بنجاح', type: 'success' });
                if (AdminData?.addLog) AdminData.addLog(isCurrentlyIpBanned ? 'UNBAN_IP' : 'BAN_IP', `شبكة: ${cleanIp}`);
                
            } catch (error) {
                EventBus.emit('req-show-toast', { message: 'فشل تحديث حظر الشبكة', type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    openBalanceAdjust: async function(type, userId) {
        if (!AdminUI || this._actionLocks.has('adjust-balance')) return;
        
        const user = await this._getUserSafely(userId);
        if (!user) return EventBus.emit('req-show-toast', { message: 'فشل الوصول للعميل', type: 'error' });
        
        const normalizedType = (type === 'subtract' || type === 'deduct') ? 'deduct' : 'add';
        const displayName = user.fullName || user.username || user.name || 'العميل';
        const curCode = (user.baseCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const displayCur = AdminRender?.getCurrencySymbolText?.(curCode) || curCode;
        const actionName = normalizedType === 'add' ? 'إضافة' : 'خصم';
        
        const amountStr = await AdminUI.showPrompt(`أدخل المبلغ المراد ${actionName}ه (${displayCur}):`, `${actionName} رصيد للعميل (${displayName})`, '');
        if (!amountStr || isNaN(amountStr) || Number(amountStr) <= 0) return;
        
        const adjustAmount = Number(amountStr);
        const currentBal = Number(user.walletBalance ?? user.balance ?? 0);
        
        if (normalizedType === 'add' && curCode === 'USD' && adjustAmount > 5000) {
            return EventBus.emit('req-show-toast', { message: 'إجراء أمني: لا يمكن إضافة أكثر من 5000 دولار للعملية الواحدة لمنع الأخطاء المطبعية.', type: 'error' });
        }

        if (normalizedType === 'deduct' && adjustAmount > currentBal) {
            EventBus.emit('req-show-toast', { message: `رصيد العميل الحالي لا يكفي.`, type: 'error' });
            return;
        }
        
        this._actionLocks.add('adjust-balance');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, `جاري توثيق عملية الـ ${actionName} سحابياً...`);
        
        try {
            const idempotencyKey = Utils.generateID();
            
            const result = await FirebaseAdapter.callFunction('adminAdjustBalance', {
                userId: String(userId),
                type: normalizedType,
                amount: adjustAmount,
                idempotencyKey: idempotencyKey, 
                adminName: AdminData.data.adminProfile?.name || 'الإدارة'
            });
            
            if (result && result.success) {
                const newBal = result.newBalance;
                const adjustUsd = Math.abs(Number(result.newDeposit?.creditedBaseUsd ?? adjustAmount));
                
                user.walletBalance = newBal;
                user.balance = newBal;
                user.wallet_balance = newBal;
                
                if (normalizedType === 'add') {
                    user.totalDeposit = FinancialEngine.safeAdd(user.totalDeposit || 0, adjustUsd);
                } else {
                    user.totalDeposit = Math.max(0, FinancialEngine.safeSub(user.totalDeposit || 0, adjustUsd));
                }
                
                if (result.newDeposit) {
                    const localDepDoc = { ...result.newDeposit, time: Date.now(), createdAt: Date.now() };
                    if (!Array.isArray(AdminData.data.deposits)) AdminData.data.deposits = [];
                    AdminData.data.deposits.unshift(localDepDoc);
                    if (!AdminData.data.depositsMap) AdminData.data.depositsMap = {};
                    AdminData.data.depositsMap[String(localDepDoc.id)] = localDepDoc;
                    EventBus.emit('req-render-deposits');
                }

                AdminUI?.UsersUI?.animateBalanceUpdate?.(newBal, curCode, normalizedType);
                if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId, true);

                if (AdminRender?.UsersRender?.state?.userHistoryTab === 'deposits') {
                    this.fetchUserHistory(userId, false);
                }

                const preciseMsg = `تم ${actionName} مبلغ ${adjustAmount} ${displayCur} للعميل ${displayName}`;
                EventBus.emit('req-finish-action', { renderEvent: 'req-render-users', logAction: normalizedType === 'add' ? 'ADD_BALANCE' : 'SUB_BALANCE', logDetails: preciseMsg, toastMsg: preciseMsg });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete('adjust-balance');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    sendPasswordReset: async function(userId) {
        const u = await this._getUserSafely(userId);
        if (!u || !u.email) {
            return EventBus.emit('req-show-toast', { message: 'لا يوجد بريد إلكتروني مسجل لهذا الحساب.', type: 'error' });
        }

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من إرسال رابط إعادة تعيين كلمة المرور إلى:\n${u.email}`, 'تأكيد الإرسال')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إرسال الرابط...');
            try {
                await sendPasswordResetEmail(auth, u.email);
                EventBus.emit('req-show-toast', { message: 'تم إرسال رابط إعادة التعيين لبريد العميل بنجاح', type: 'success' });
                if (AdminData?.addLog) AdminData.addLog('PASSWORD_RESET', `تم إرسال رابط إعادة تعيين لبريد العميل: ${u.fullName || u.username}`);
            } catch (error) {
                let errorMsg = error.message;
                if (error.code === 'auth/user-not-found') errorMsg = 'البريد غير موجود في نظام المصادقة.';
                else if (error.code === 'auth/too-many-requests') errorMsg = 'تم حظر الإرسال مؤقتاً بسبب كثرة المحاولات.';
                
                console.error("Password Reset Failed:", error);
                EventBus.emit('req-show-toast', { message: `فشل الإرسال: ${errorMsg}`, type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    sendCustomNotification: async function(userId) {
        if (this._actionLocks.has(`notif-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u) return;

        const msgInput = document.getElementById('user-custom-notif');
        const message = msgInput ? msgInput.value.trim() : '';

        if (!message) {
            return EventBus.emit('req-show-toast', { message: 'يرجى كتابة نص التنبيه أولاً.', type: 'warning' });
        }

        if (window.AdminUI && !await window.AdminUI.showConfirm(`سيتم إرسال هذا التنبيه للعميل (${u.fullName || u.username}):\n\n"${message}"`, 'إرسال تنبيه مخصص')) return;

        this._actionLocks.add(`notif-${userId}`);
        if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(true, 'جاري إرسال التنبيه سحابياً...');

        try {
            const notifId = `notif_custom_${Date.now()}`;
            await FirebaseAdapter.set(`telecard_users/${userId}/notifications`, notifId, {
                id: notifId,
                title: 'تنبيه إداري',
                message: message,
                type: 'notification',
                targetType: 'notification',
                targetId: notifId,
                createdAt: serverTimestamp(),
                read: false
            });

            if (window.AdminUI?.UsersUI?.clearCustomNotifInput) window.AdminUI.UsersUI.clearCustomNotifInput();
            else if (msgInput) msgInput.value = '';

            EventBus.emit('req-show-toast', { message: 'تم إرسال التنبيه للعميل بنجاح', type: 'success' });
            if (AdminData?.addLog) AdminData.addLog('SEND_NOTIF', `إرسال تنبيه مخصص للعميل: ${u.fullName || u.username}`);

        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل الإرسال: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete(`notif-${userId}`);
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
        }
    },

    saveTier: async function() {
        if (this._actionLocks.has('save-tier')) return;
        
        const targetId = Utils.getVal('t-id', '').trim();
        const isDefaultTier = (targetId === 'TIER_DEFAULT');
        
        const name = Utils.getVal('t-name', '').trim();
        const icon = Utils.getVal('t-icon', 'fa-user').trim();
        let profit = Number(Utils.getVal('t-profit', 0)); 
        const minP = Number(Utils.getVal('t-min', 0));
        
        const cond = isDefaultTier ? 0 : Number(Utils.getVal('t-cond', 0));
        
        const rawDurStr = String(Utils.getVal('t-dur', '')).trim();
        const parsedDur = Number(rawDurStr);
        const dur = isDefaultTier ? 0 : (rawDurStr !== '' && !isNaN(parsedDur) && parsedDur >= 0 ? Math.floor(parsedDur) : 30);
        const isDef = isDefaultTier;
        
        const typeSelectEl = document.getElementById('t-type');
        let type = (!isDefaultTier && typeSelectEl && typeSelectEl.value === 'api') ? 'api' : 'retail';
        
        const minSafeMarginPct = FinancialEngine?.CONFIG?.MIN_MARGIN_PERCENT || 0.5;
        if (!name) return EventBus.emit('req-show-toast', { message: 'أدخل اسم المستوى', type: 'error' });
        if (isNaN(profit) || profit < minSafeMarginPct) {
            return EventBus.emit('req-show-toast', { message: `لا يمكن تعيين نسبة ربح أقل من الحد الأدنى الآمن للنظام (${minSafeMarginPct}%) لحماية رأس المال.`, type: 'error' });
        }
        if (minP < 0) return EventBus.emit('req-show-toast', { message: 'قاع الربح لا يمكن أن يكون سالباً.', type: 'error' });
        const existingTiers = Array.isArray(AdminData.data.tiers) ? AdminData.data.tiers : [];
        
        if (type === 'retail') {
            if (!isDefaultTier && cond <= 0) {
                return EventBus.emit('req-show-toast', { message: 'شرط الترقية ($) لأي مستوى تجزئة إضافي يجب أن يكون أكبر من 0$ (لأن 0$ محجوز للمستوى الافتراضي).', type: 'error' });
            }

            const otherRetailTiers = existingTiers.filter(t => String(t.id) !== targetId && (t.type || 'retail') === 'retail');
            if (!isDefaultTier) {
                const duplicateThresholdTier = otherRetailTiers.find(t => Number(t.threshold || 0) === cond);
                if (duplicateThresholdTier) {
                    return EventBus.emit('req-show-toast', { message: `لا يمكن الحفظ: المستوى (${duplicateThresholdTier.name}) يملك نفس شرط الترقية (${cond}$). يجب أن يكون لكل مستوى شرط مالي مختلف.`, type: 'error' });
                }
            }

            const lowerTierWithCheaperMargin = otherRetailTiers.find(t => Number(t.threshold || 0) < cond && Number(t.profitPercent || 0) < profit);
            const higherTierWithCostlierMargin = otherRetailTiers.find(t => Number(t.threshold || 0) > cond && Number(t.profitPercent || 0) > profit);
            
            if (lowerTierWithCheaperMargin || higherTierWithCostlierMargin) {
                const conflictTier = lowerTierWithCheaperMargin || higherTierWithCostlierMargin;
                const warnMsg = `⚠️ تنبيه تسعير المستويات:\n\nالمستوى (${conflictTier.name}) شرطه (${conflictTier.threshold}$) ونسبة ربحه (${conflictTier.profitPercent}%)، بينما ضبطت هذا المستوى بشرط (${cond}$) ونسبة ربح (${profit}%).\n\nالأصل أنه كلما ارتفع شرط المبلغ ($) تقل نسبة الربح (%) ليحصل العميل المترقي على سعر أرخص.\nهل تريد الحفظ على أي حال؟`;
                if (AdminUI && !await AdminUI.showConfirm(warnMsg, 'تنبيه تدرج الأسعار')) {
                    return; 
                }
            }
        }

        if (profit > 200) {
            profit = 200;
            EventBus.emit('req-show-toast', { message: 'تم تقليص نسبة الربح إلى الحد الأقصى المسموح سحابياً (200%).', type: 'warning' });
        }
        
        this._actionLocks.add('save-tier');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات المستوى...');
        
        try {
            const tiers = JSON.parse(JSON.stringify(existingTiers));
            const isEdit = targetId !== '';
            let finalTierId = targetId;
            
            if (isEdit) {
    const idx = tiers.findIndex(x => String(x.id).trim() === targetId);
    if (idx > -1) {
        tiers[idx] = { ...tiers[idx], name, nameAr: name, icon, type, profitPercent: profit, minProfitUsd: minP, threshold: cond, durationDays: dur, isDefault: isDef };
        delete tiers[idx].badge;
    } else {
        finalTierId = targetId;
        tiers.push({ id: finalTierId, name, nameAr: name, icon, type, profitPercent: profit, minProfitUsd: minP, threshold: cond, durationDays: dur, isDefault: isDef, autoAdvance: true });
    }
} else {
    finalTierId = 'TIER_' + Utils.generateID();
    tiers.push({ id: finalTierId, name, nameAr: name, icon, type, profitPercent: profit, minProfitUsd: minP, threshold: cond, durationDays: dur, isDefault: false, autoAdvance: true });
}            
            tiers.forEach(x => { x.isDefault = (String(x.id) === 'TIER_DEFAULT'); });
            
            AdminData.data.tiers = tiers;
            if (!AdminData.data.tiersMap) AdminData.data.tiersMap = {};
            
            const updatedTierObj = tiers.find(t => t.id === finalTierId);
            if (updatedTierObj) AdminData.data.tiersMap[finalTierId] = updatedTierObj;
            
            await AdminData?.saveTiers?.();
            
            const idInput = document.getElementById('t-id');
            if (idInput) idInput.value = finalTierId;
            
            AdminData.data.tierUserCounts = null;

            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-tiers',
                modalId: 'tier',
                logAction: isEdit ? 'EDIT_TIER' : 'ADD_TIER',
                logDetails: `تحديث مستوى: ${name} (${type})`,
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

    deleteTier: async function(id) {
        if (this._actionLocks.has('del-tier')) return;
        if (!AdminData.data.tiers) return;

        const strId = String(id).trim();
        const tierToDelete = AdminData.data.tiersMap?.[strId] || AdminData.data.tiers.find(t => String(t.id) === strId);
        if (!tierToDelete) return;

        if (tierToDelete.isDefault || strId === 'TIER_DEFAULT') {
            EventBus.emit('req-show-toast', { message: 'إجراء أمني مرفوض: لا يمكن حذف المستوى الافتراضي الخالد لحماية النظام.', type: 'error' });
            return;
        }

        const msg = `هل أنت متأكد من حذف مستوى "${tierToDelete.name}" نهائياً؟\nسيقوم السيرفر بنقل جميع العملاء المرتبطين به إلى المستوى الافتراضي بأمان.`;

        if (AdminUI && await AdminUI.showConfirm(msg, 'تأكيد إزالة المستوى')) {
            this._actionLocks.add('del-tier');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حذف المستوى ونقل العملاء سحابياً...');

            try {
                const result = await FirebaseAdapter.callFunction('adminDeleteTier', { tierId: strId });

                if (result && result.success) {
                    const fallbackTierId = result.fallbackTierId;

                    const resetMigratedUserLocal = (u) => {
                        if (!u) return;
                        if (String(u.tierId) === strId) {
                            u.tierId = fallbackTierId;
                            u.cycleStartTierId = fallbackTierId;
                            u.tierClimbs = [];
                            u.tierCycleSpent = 0;
                            u.isApiMerchant = false;
                            u.manualTierOverride = false;
                        } else if (String(u.cycleStartTierId) === strId) {
                            u.cycleStartTierId = fallbackTierId;
                            u.tierClimbs = [];
                        }
                    };
                    if (AdminData.data.users) AdminData.data.users.forEach(resetMigratedUserLocal);
                    if (AdminData.data.usersMap) Object.values(AdminData.data.usersMap).forEach(resetMigratedUserLocal);
                    AdminData.data.tiers = AdminData.data.tiers.filter(t => String(t.id) !== strId);
                    if (AdminData.data.tiersMap) delete AdminData.data.tiersMap[strId];
                    AdminData._updateSnapshot?.('tiers');

                    AdminData.data.tierUserCounts = null;
                    EventBus.emit('req-render-tiers');
                    EventBus.emit('req-render-users');
                    EventBus.emit('req-show-toast', { message: `تم الحذف ونقل ${result.migratedCount} عميل بأمان`, type: 'success' });
                }
            } catch (error) {
                EventBus.emit('req-show-toast', { message: `حدث خطأ أثناء الحذف: ${error.message}`, type: 'error' });
            } finally {
                this._actionLocks.delete('del-tier');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    updateUserTier: async function(userId, tierId, manualOverride = true) {
        if (this._actionLocks.has('update-tier')) return;
        this._actionLocks.add('update-tier');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث المستوى سحابياً بأمان...');
        
        try {
            const result = await FirebaseAdapter.callFunction('adminUpdateUserTier', {
                userId: String(userId),
                newTierId: String(tierId),
                manualOverride: Boolean(manualOverride) 
            });

            if (result && result.success) {
                const user = await this._getUserSafely(userId);
                const newTier = AdminData.data.tiersMap?.[tierId] || (AdminData.data.tiers || []).find(t => String(t.id) === String(tierId));
                if (user) {
                    user.tierId = tierId;
                    user.cycleStartTierId = tierId;
                    user.tierClimbs = [];
                    user.manualTierOverride = Boolean(manualOverride);
                    user.tierCycleSpent = 0;
                    user.tierCycleStartDate = Date.now();
                    user.tierStreakStartDate = Date.now();
                    
                    if (newTier) {
                        user.isApiMerchant = (newTier.type === 'api');
                    }
                }

                if (AdminRender?.UsersRender?.renderTierUsersPage) {
                    AdminRender.UsersRender.renderTierUsersPage();
                } else if (AdminRender && typeof AdminRender.renderTierUsersPage === 'function') {
                    AdminRender.renderTierUsersPage();
                }
                AdminData.data.tierUserCounts = null;
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

    confirmTierSelection: function() {
        if (!this.selectedUserId || !this.selectedTierId) {
            return EventBus.emit('req-show-toast', { message: 'حدد مستوى أولاً', type: 'error' });
        }
        
        const overrideCheckbox = document.getElementById('tier-manual-override');
        const isManualOverride = overrideCheckbox ? overrideCheckbox.checked : false;

        this.updateUserTier(this.selectedUserId, this.selectedTierId, isManualOverride);
        AdminUI?.UsersUI?.closeTierSelection?.();
        
        this.selectedUserId = null; 
        this.selectedTierId = null;
    },

    toggleTierAutoFor: async function(id, isAuto) {
        if (this._actionLocks.has(`toggle-auto-${id}`)) return;
        this._actionLocks.add(`toggle-auto-${id}`);
        
        try {
            const tier = AdminData.data.tiersMap?.[id] || (AdminData.data.tiers || []).find(t => String(t.id) === String(id));
            if (tier) {
                tier.autoAdvance = isAuto;
                await AdminData?.saveTiers?.();
                EventBus.emit('req-render-tiers');
            }
        } finally {
            this._actionLocks.delete(`toggle-auto-${id}`);
        }
    },

    _sha256: async function(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    generateApiKey: async function(userId) {
        if (this._actionLocks.has(`gen-api-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u || !u.isApiMerchant) return;

        const confirm = await AdminUI.showConfirm(`⚠️ تنبيه أمني: سيتم توليد مفتاح API جديد وحفظ بصمته سحابياً، وسيتم إبطال أي مفتاح سابق تلقائياً. المفتاح الجديد سيظهر لك مرة واحدة فقط لنسخه وإرساله للعميل.\n\nهل أنت متأكد؟`, 'توليد مفتاح ربط جديد');
        if (!confirm) return;

        this._actionLocks.add(`gen-api-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توليد وتشفير المفتاح سحابياً...');

        try {
            const rawKey = 'TC_API_' + Utils.generateID() + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            const hashedKey = await this._sha256(rawKey);

            await FirebaseAdapter.updateDocument('telecard_users', userId, { apiKeyHash: hashedKey });
            
            const successMsg = `
                <div class="alert alert-success mt-10 mb-0">
                    <h5 class="fw-bold mb-10"><i class="fa-solid fa-check-circle me-1"></i> تم توليد المفتاح بنجاح!</h5>
                    <p class="fs-13 text-dark mb-10">انسخ المفتاح التالي وأرسله للعميل. <b>لن يظهر هذا المفتاح مرة أخرى أبداً</b> لأسباب أمنية.</p>
                    <div class="p-10 bg-body rounded border user-select-all" style="word-break: break-all; font-family: monospace; cursor: copy;">
                        ${rawKey}
                    </div>
                </div>
            `;
            
            await AdminUI.showAlert(successMsg, 'اكتمل التوليد');
            
            if (AdminData?.addLog) AdminData.addLog('GENERATE_API_KEY', `تم إعادة تعيين مفتاح الـ API للتاجر: ${u.fullName || u.username}`);
            
            u.apiKeyHash = hashedKey; 
            if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId, true); 

        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'فشل توليد المفتاح سحابياً', type: 'error' });
        } finally {
            this._actionLocks.delete(`gen-api-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    saveWebhook: async function(userId) {
        if (this._actionLocks.has(`save-webhook-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u || !u.isApiMerchant) return;

        const urlInput = Utils.getVal('dev-webhook-url', '').trim();
        const secretInput = Utils.getVal('dev-webhook-secret', '').trim();

        if (urlInput && !urlInput.startsWith('https://')) {
            return EventBus.emit('req-show-toast', { message: 'رابط الـ Webhook يجب أن يكون آمناً ويبدأ بـ https://', type: 'error' });
        }

        this._actionLocks.add(`save-webhook-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات الربط...');

        try {
            await FirebaseAdapter.updateDocument('telecard_users', userId, {
                webhookUrl: urlInput || null,
                webhookSecret: secretInput || null
            });

            u.webhookUrl = urlInput;
            u.webhookSecret = secretInput;
            
            EventBus.emit('req-show-toast', { message: 'تم حفظ إعدادات الـ Webhook بنجاح', type: 'success' });
            if (AdminData?.addLog) AdminData.addLog('SAVE_WEBHOOK', `تم تحديث مسار الربط للتاجر: ${u.fullName || u.username}`);
            
            if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId, true);

        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'فشل حفظ الإعدادات سحابياً', type: 'error' });
        } finally {
            this._actionLocks.delete(`save-webhook-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    processKycDecision: async function(userId, decision) {
        if (this._actionLocks.has(`kyc-${userId}`)) return;
        this._actionLocks.add(`kyc-${userId}`);

        const u = await this._getUserSafely(userId);
        if (!u) {
            this._actionLocks.delete(`kyc-${userId}`);
            return;
        }

        let note = '';
        if (decision === 'reject') {
            const result = await AdminUI.showPrompt('يرجى ذكر سبب رفض المستندات (سيظهر للعميل):', 'سبب الرفض');
            if (result === null) { 
                this._actionLocks.delete(`kyc-${userId}`);
                return; 
            }
            note = result.trim();
        } else {
            const confirm = await AdminUI.showConfirm(`هل أنت متأكد من صحة المستندات والموافقة على توثيق حساب العميل (${u.fullName || u.username})؟`);
            if (!confirm) {
                this._actionLocks.delete(`kyc-${userId}`);
                return;
            }
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري معالجة الطلب سحابياً...');

        try {
            const hasCompletedInitialSetup = Boolean(u.identityCompletedAt || u.isVerified === true);
const updatePayload = {
    kycStatus: decision === 'approve' ? 'approved' : 'rejected',
    isVerified: decision === 'approve' ? true : hasCompletedInitialSetup,
    kycReviewedAt: serverTimestamp(),
    kycReviewNote: decision === 'approve' ? FirebaseAdapter.deleteField() : note
};

if (decision === 'reject') {
    updatePayload.kycData = FirebaseAdapter.deleteField();
    
    if (u.kycData) {
        let imagesToDelete = [u.kycData.frontImg, u.kycData.backImg, u.kycData.selfieImg];
        if (Array.isArray(u.kycData.docs)) {
            u.kycData.docs.forEach(docItem => {
                imagesToDelete.push(typeof docItem === 'string' ? docItem : docItem.url);
            });
        }
        
        imagesToDelete.forEach(img => {
            if (img && typeof img === 'string') FirebaseAdapter.deleteImageByUrl(img).catch(() => {});
        });
    }
}

await FirebaseAdapter.updateDocument('telecard_users', userId, updatePayload);

// 🚀 تحديث وثيقة telecard_kyc/{userId} بالحقل القياسي الموحد kycReviewNote
const targetKycDocId = String(u.kycDocId || userId);
await FirebaseAdapter.set('telecard_kyc', targetKycDocId, {
    userId: String(userId),
    status: updatePayload.kycStatus,
    kycReviewNote: decision === 'approve' ? FirebaseAdapter.deleteField() : note,
    updatedAt: serverTimestamp()
}).catch(() => {});
            u.kycStatus = updatePayload.kycStatus;
            u.isVerified = updatePayload.isVerified;
            if (decision === 'approve') {
                delete u.kycReviewNote;
            } else {
                u.kycReviewNote = note;
            }
            if (decision === 'reject') delete u.kycData;

            if (Array.isArray(AdminData.data.kycPendingUsers)) {
                AdminData.data.kycPendingUsers = AdminData.data.kycPendingUsers.filter(usr => String(usr.id) !== String(userId));
            }
            const remainingPending = Array.isArray(AdminData.data.kycPendingUsers)
                ? AdminData.data.kycPendingUsers.length
                : (AdminData.data.users || []).filter(usr => usr.kycStatus === 'pending').length;
            AdminUI?.UsersUI?.updateSidebarKycBadge?.(remainingPending);

            EventBus.emit('req-render-kyc');
            EventBus.emit('req-show-toast', { message: decision === 'approve' ? 'تم توثيق الحساب بنجاح' : 'تم رفض التوثيق ومسح المستندات', type: 'success' });
            
            if (AdminData?.addLog) AdminData.addLog(`KYC_${decision.toUpperCase()}`, `العميل: ${u.fullName || u.username}`);

        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'تعذر حفظ القرار سحابياً', type: 'error' });
        } finally {
            this._actionLocks.delete(`kyc-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    revokeUserKyc: async function(userId) {
        if (this._actionLocks.has(`revoke-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u) return;

        const confirm = await AdminUI.showConfirm(`⚠️ تحذير أمني خطير!\nهل أنت متأكد من إبطال توثيق هذا العميل ومسح مستنداته نهائياً من النظام؟\nسيؤدي هذا إلى تجميد قدرته على الشراء إذا كان نظام التوثيق مفروضاً.`, 'إبطال التوثيق');
        if (!confirm) return;

        this._actionLocks.add(`revoke-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إبطال التوثيق وتدمير المستندات سحابياً...');

        try {
            if (u.kycData) {
                let imagesToDelete = [u.kycData.frontImg, u.kycData.backImg, u.kycData.selfieImg];
                if (Array.isArray(u.kycData.docs)) {
                    u.kycData.docs.forEach(docItem => {
                        imagesToDelete.push(typeof docItem === 'string' ? docItem : docItem.url);
                    });
                }
                imagesToDelete.forEach(img => {
                    if (img && typeof img === 'string') FirebaseAdapter.deleteImageByUrl(img).catch(() => {});
                });
            }

            await FirebaseAdapter.updateDocument('telecard_users', userId, {
                kycStatus: 'none',
                kycData: FirebaseAdapter.deleteField(),
                kycReviewNote: 'تم إبطال التوثيق إدارياً'
            });

            const targetKycDocId = String(u.kycDocId || userId);
            await FirebaseAdapter.delete('telecard_kyc', targetKycDocId).catch(() => {});

            u.kycStatus = 'none';
            delete u.kycData;
            u.kycReviewNote = 'تم إبطال التوثيق إدارياً';

            if (Array.isArray(AdminData.data.kycPendingUsers)) {
                AdminData.data.kycPendingUsers = AdminData.data.kycPendingUsers.filter(usr => String(usr.id) !== String(userId));
            }
            const remainingPending = Array.isArray(AdminData.data.kycPendingUsers)
                ? AdminData.data.kycPendingUsers.length
                : (AdminData.data.users || []).filter(usr => usr.kycStatus === 'pending').length;
            AdminUI?.UsersUI?.updateSidebarKycBadge?.(remainingPending);

            if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId, true);
            EventBus.emit('req-render-kyc');
            EventBus.emit('req-show-toast', { message: 'تم إبطال التوثيق وتدمير المستندات بنجاح', type: 'success' });
            if (AdminData?.addLog) AdminData.addLog('KYC_REVOKED', `إبطال توثيق العميل: ${u.fullName || u.username}`);

        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'فشل إبطال التوثيق', type: 'error' });
        } finally {
            this._actionLocks.delete(`revoke-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    }
};
