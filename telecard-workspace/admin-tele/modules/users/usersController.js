// ============================================================================
// 🧠 متحكم المستخدمين (modules/users/usersController.js) - Cloud-Native V18.8 💎
// 🚀 التحديثات المعمارية (V18.8 - Accounting Purity Patch):
// 1. Adapter Purity 🔌: إزالة استيراد (doc) المباشر من Firebase للحفاظ على عزلة الكنترولر 100%.
// 2. Financial Precision 🧮: تصحيح الرياضيات المباشرة في إضافة الأرصدة واستخدام FinancialEngine.safeAdd لمنع تشوه الأرقام العشرية.
// 3. Subtract Math Fix 🛡️: تصحيح الخصم الإداري ليُنقص من (totalDeposit) بدلاً من زيادة (totalSpent).
// 4. Mutex Locks 🔒: حماية كافة العمليات من التكرار والضغط المزدوج.
// 5. Firebase V9 DeleteTier Patch 🛡️: تصحيح خطأ الحذف باستخدام الـ Chunking الموزع و V9 Syntax.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FirebaseAdapter, auth } from '../../core/firebaseAdapter.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { FinancialEngine } from '../../core/financialEngine.js';
// 🚀 [التحديث المعماري]: استيراد doc من فايربيز ليعمل نظام الحزم V9 بنجاح
import { doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const performCloudSearch = async (searchTerm) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return null;

    try {
        let results = [];
        if (term.length > 15) {
            const exactUser = await FirebaseAdapter.getById('telecard_users', term);
            if (exactUser) results.push(exactUser);
        } else {
            const resDisplay = await FirebaseAdapter.fetchMoreWithCursor('telecard_users', [['displayId', '==', term]], 'createdAt', null, 10);
            if (resDisplay && resDisplay.data && resDisplay.data.length > 0) {
                results.push(...resDisplay.data);
            } else {
                 const resEmail = await FirebaseAdapter.fetchMoreWithCursor('telecard_users', [['email', '==', term]], 'createdAt', null, 10);
                 if (resEmail && resEmail.data && resEmail.data.length > 0) {
                     results.push(...resEmail.data);
                 }
            }
        }
        return results.length > 0 ? results : null;
    } catch (e) {
        console.warn("Cloud Search failed:", e);
        return null;
    }
};

export const UsersController = {
    selectedUserId: null,
    selectedTierId: null,
    _actionLocks: new Set(),

    _getUserSafely: async function(userId) {
        let u = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(x => String(x.id) === String(userId));
        if (u) return u;
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري استدعاء بيانات العميل سحابياً...');
        try {
            u = await FirebaseAdapter.getById('telecard_users', String(userId));
            if (u) {
                if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                AdminData.data.usersMap[u.id] = u;
                AdminData.data.users.push(u);
            }
        } catch(e) { console.warn(e); }
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        
        return u;
    },

    searchUsers: async function(q) {
        const query = (q || '').trim();
        EventBus.emit('req-update-state', { userSearch: query });
        
        if (!query) {
            EventBus.emit('req-render-users');
            return;
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري البحث في السحابة...');
        
        try {
            const localResults = AdminData.data.users.filter(u => 
                String(u.id||'').toLowerCase().includes(query.toLowerCase()) || 
                String(u.displayId||'').toLowerCase().includes(query.toLowerCase()) || 
                String(u.fullName || u.name || '').toLowerCase().includes(query.toLowerCase()) || 
                String(u.email||'').includes(query.toLowerCase())
            );

            if (localResults.length === 0) {
                const cloudHits = await performCloudSearch(query);
                if (cloudHits) {
                    cloudHits.forEach(user => {
                        if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                        if (!AdminData.data.usersMap[user.id]) {
                            AdminData.data.users.push(user);
                            AdminData.data.usersMap[user.id] = user;
                        }
                    });
                }
            }
            EventBus.emit('req-render-users');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    toggleUserSort: function() {
        const currentSort = AdminRender?.UsersRender?.state?.sortUsers || 'desc';
        EventBus.emit('req-update-state', { sortUsers: currentSort === 'desc' ? 'asc' : 'desc' });
        EventBus.emit('req-render-users');
    },

    changeUserSort: function(val) {
        EventBus.emit('req-update-state', { userSortCategory: val, sortUsers: 'desc' });
        EventBus.emit('req-render-users');
    },

    fetchUserHistory: async function(userId, isLoadMore = false) {
        const u = await this._getUserSafely(userId);
        if(!u) return;

        const limitCount = isLoadMore ? (AdminData.tempUserHistoryLimit || 25) + 25 : 25;
        AdminData.tempUserHistoryLimit = limitCount;
        
        const loadBtn = document.getElementById('btn-load-more-user-history');
        if (loadBtn) {
            loadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الجلب...';
            loadBtn.disabled = true;
        }

        try {
            const activities = await FirebaseAdapter.getCustomerFullHistory(userId, limitCount);
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

        const newName = Utils.escapeHTML(Utils.getVal('user-edit-name'));
        const newEmail = Utils.escapeHTML(Utils.getVal('user-edit-email'));
        const newPhone = Utils.escapeHTML(Utils.getVal('user-edit-phone'));
        const newCountry = Utils.escapeHTML(Utils.getVal('user-edit-country'));

        if (!newName) return EventBus.emit('req-show-toast', { message: 'يجب إدخال الاسم', type: 'warning' });

        this._actionLocks.add(`edit-user-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ التعديلات...');

        try {
            await FirebaseAdapter.updateDocument('telecard_users', userId, {
                fullName: newName,
                email: newEmail,
                phone: newPhone,
                countryName: newCountry
            });

            u.fullName = newName;
            u.email = newEmail;
            u.phone = newPhone;
            u.countryName = newCountry;

            EventBus.emit('req-render-users');
            if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId);
            AdminUI?.closeModal?.('user-edit');
            
            EventBus.emit('req-show-toast', { message: 'تم تحديث البيانات بنجاح', type: 'success' });
            if (AdminData?.addLog) AdminData.addLog('EDIT_USER', `تعديل بيانات العميل: ${newName}`);

        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'فشل التحديث سحابياً', type: 'error' });
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
                    AdminData.data.users = AdminData.data.users.filter(x => String(x.id) !== String(userId));
                    if (AdminData.data.usersMap) delete AdminData.data.usersMap[userId];
                    
                    EventBus.emit('req-render-users');
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
                if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId);
                
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

                if (u.isBanned) {
                    if (!AdminData.data.settings) AdminData.data.settings = {};
                    let settingsChanged = false;
                    const targetIp = u.lastIp || u.ipAddress || u.ip;
                    if (targetIp && targetIp !== 'غير معروف') {
                        if (!AdminData.data.settings.bannedIps) AdminData.data.settings.bannedIps = [];
                        if (!AdminData.data.settings.bannedIps.includes(targetIp)) {
                            AdminData.data.settings.bannedIps.push(targetIp);
                            settingsChanged = true;
                        }
                    }
                    if (Array.isArray(u.devicePrints) && u.devicePrints.length > 0) {
                        if (!AdminData.data.settings.bannedDevices) AdminData.data.settings.bannedDevices = [];
                        const currentBannedDevices = new Set(AdminData.data.settings.bannedDevices);
                        u.devicePrints.forEach(device => {
                            if (!currentBannedDevices.has(device)) {
                                AdminData.data.settings.bannedDevices.push(device);
                                settingsChanged = true;
                            }
                        });
                    }
                    if (settingsChanged) await AdminData.saveSystemSettings();
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
        if (!ipToBan || ipToBan === 'غير متوفر') {
            return EventBus.emit('req-show-toast', { message: 'لا يوجد عنوان IP مسجل لهذا العميل.', type: 'warning' });
        }

        if (AdminUI && await AdminUI.showConfirm(`سيتم حظر عنوان الـ IP (${ipToBan}) من دخول المتجر نهائياً.\nهل أنت متأكد؟`, 'حظر شبكة العميل')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إضافة الـ IP للجدار الناري...');
            
            try {
                if (!AdminData.data.settings) AdminData.data.settings = {};
                if (!AdminData.data.settings.bannedIps) AdminData.data.settings.bannedIps = [];
                
                if (!AdminData.data.settings.bannedIps.includes(ipToBan)) {
                    AdminData.data.settings.bannedIps.push(ipToBan);
                    await AdminData.saveSystemSettings();
                }
                
                await FirebaseAdapter.updateDocument('telecard_users', userId, { isIpBanned: true });
                const u = await this._getUserSafely(userId);
                if(u) u.isIpBanned = true;

                if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId);
                EventBus.emit('req-show-toast', { message: 'تم حظر الـ IP بنجاح', type: 'success' });
                if (AdminData?.addLog) AdminData.addLog('BAN_IP', `حظر شبكة: ${ipToBan}`);
                
            } catch (error) {
                EventBus.emit('req-show-toast', { message: 'فشل حظر الشبكة', type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    openBalanceAdjust: async function(type, userId) {
        if (!AdminUI || this._actionLocks.has('adjust-balance')) return;
        
        const user = await this._getUserSafely(userId);
        if (!user) return EventBus.emit('req-show-toast', {message:'فشل الوصول للعميل', type:'error'});
        
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
                adminName: AdminData.data.adminProfile?.name || 'الإدارة'
            });
            
            if (result && result.success) {
                const newBal = result.newBalance;
                
                user.walletBalance = newBal;
                user.balance = newBal;
                user.wallet_balance = newBal;
                
                if (type === 'add') {
                    user.totalDeposit = FinancialEngine.safeAdd(user.totalDeposit || 0, adjustAmount);
                } else {
                    user.totalDeposit = FinancialEngine.safeSub(user.totalDeposit || 0, adjustAmount);
                }
                
                AdminData.data.deposits.unshift({
                    id: result.newDeposit?.id || String(Date.now()),
                    displayId: result.newDeposit?.id || String(Date.now()),
                    userId: String(userId),
                    userName: displayName,
                    userDataSnapshot: result.newDeposit?.userDataSnapshot || {
                        fullName: displayName,
                        email: user.email || '',
                        phone: user.phone || '',
                        tierId: user.tierId || 'TIER_DEFAULT',
                        baseCurrency: curCode
                    },
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

                if (AdminRender?.UsersRender?.state?.userHistoryTab === 'deposits') {
                    this.fetchUserHistory(userId, false);
                }

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

    auditUserWallet: async function(userId) {
        if (this._actionLocks.has(`audit-${userId}`)) return;

        const u = await this._getUserSafely(userId);
        if (!u) return;

        const confirm = await AdminUI.showConfirm(`هل أنت متأكد من تفعيل "المحقق المالي" لهذا العميل؟\nسيقوم السيرفر بفحص جميع العمليات وحل أي تشوه في السجلات.`, 'التدقيق المالي السحابي');
        if (!confirm) return;

        this._actionLocks.add(`audit-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تدقيق السجلات المالية سحابياً...');

        try {
            const result = await FirebaseAdapter.callFunction('adminAuditUserWallet', { userId: userId });
            
            if (result && result.success) {
                if (result.data) {
                    u.totalSpent = result.data.spentUsd;
                    u.totalDeposit = result.data.depositUsd;
                    if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId);
                }
                EventBus.emit('req-show-toast', { message: result.message || 'تمت المطابقة', type: 'success' });
            } else {
                throw new Error(result?.message || 'فشل الاتصال بالسيرفر');
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `خطأ: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete(`audit-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    sendCustomNotification: async function(userId) {
        const msg = Utils.escapeHTML(Utils.getVal('user-custom-notif'));
        if (!msg) { EventBus.emit('req-show-toast', {message:'يرجى كتابة الرسالة أولاً', type:'error'}); return; }

        const user = await this._getUserSafely(userId);
        if (user) {
            await FirebaseAdapter.updateDocument('telecard_users', String(userId), {
                adminMessage: msg, 
                hasNewMessage: true
            });
            user.adminMessage = msg; user.hasNewMessage = true;
            
            AdminUI?.UsersUI?.clearCustomNotifInput?.();
            EventBus.emit('req-finish-action', { renderEvent: null, logAction: 'SEND_NOTIF', logDetails: `تنبيه: ${msg}`, toastMsg: `تم الإرسال بنجاح` });
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
            } catch (error) {
                EventBus.emit('req-show-toast', { message: `فشل الإرسال: ${error.message}`, type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    saveTier: async function() {
        if (this._actionLocks.has('save-tier')) return;
        
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
            const isEdit = targetId !== ''; 
            let finalTierId = targetId;
            
            if (isEdit) {
                const idx = tiers.findIndex(x => String(x.id).trim() === targetId);
                if (idx > -1) {
                    tiers[idx] = { ...tiers[idx], name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef };
                } else {
                    finalTierId = targetId;
                    tiers.push({ id: finalTierId, name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef, autoAdvance: true });
                }
            } else {
                finalTierId = 'TIER_' + Utils.generateID();
                tiers.push({ id: finalTierId, name, icon, profit_percent: profit, min_profit_usd: minP, threshold: cond, duration_days: dur, isDefault: isDef, autoAdvance: true });
            }
            
            if (isDef) {
                tiers.forEach(x => { x.isDefault = (String(x.id) === finalTierId); });
            } else {
                const hasDefault = tiers.some(t => t.isDefault === true);
                if (!hasDefault && tiers.length > 0) {
                    tiers[0].isDefault = true; 
                    EventBus.emit('req-show-toast', { message: 'تم تعيين مستوى افتراضي إجبارياً لحماية النظام.', type: 'warning' });
                }
            }
            
            AdminData.data.tiers = tiers;
            if (!AdminData.data.tiersMap) AdminData.data.tiersMap = {};
            
            const updatedTierObj = tiers.find(t => t.id === finalTierId);
            if (updatedTierObj) AdminData.data.tiersMap[finalTierId] = updatedTierObj;

            await AdminData?.saveTiers?.();
            
            if (typeof FirebaseAdapter !== 'undefined' && FirebaseAdapter.callFunction) {
                FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            }

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

    deleteTier: async function(id) {
        if (this._actionLocks.has('del-tier')) return;
        if (!AdminData.data.tiers) return;
        
        const strId = String(id).trim();
        const tierToDelete = AdminData.data.tiersMap[strId] || AdminData.data.tiers.find(t => String(t.id) === strId);
        if (!tierToDelete) return;
        
        if (tierToDelete.isDefault || strId === 'TIER_DEFAULT') {
            EventBus.emit('req-show-toast', { message: 'إجراء أمني مرفوض: لا يمكن حذف المستوى الافتراضي الخالد لحماية النظام.', type: 'error' });
            return;
        }

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
                    let batch = FirebaseAdapter.getBatch();
                    let opCount = 0;
                    
                    for (const u of AdminData.data.users) {
                        if (String(u.tierId) === strId) {
                            u.tierId = String(defaultTier.id); 
                            // 🚀 [التصحيح المعماري]: استخدام V9 Syntax وحماية حد الـ 500 عملية
                            const userRef = doc(FirebaseAdapter.db, 'telecard_users', String(u.id));
                            batch.update(userRef, { tierId: String(defaultTier.id) });
                            opCount++;
                            
                            if (opCount >= 400) {
                                await batch.commit();
                                batch = FirebaseAdapter.getBatch();
                                opCount = 0;
                            }
                        }
                    }
                    if (opCount > 0) await batch.commit();
                }

                AdminData.data.tiers = AdminData.data.tiers.filter(t => String(t.id) !== strId);
                if (AdminData.data.tiersMap) delete AdminData.data.tiersMap[id];
                
                await AdminData?.saveTiers?.();
                
                if (typeof FirebaseAdapter !== 'undefined' && FirebaseAdapter.callFunction) {
                    FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
                }
                
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

    updateUserTier: async function(userId, tierId) {
        if (this._actionLocks.has('update-tier')) return;
        this._actionLocks.add('update-tier');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث المستوى سحابياً بأمان...');
        
        try {
            const result = await FirebaseAdapter.callFunction('adminUpdateUserTier', {
                userId: String(userId),
                newTierId: String(tierId),
                manualOverride: true 
            });

            if (result && result.success) {
                const user = await this._getUserSafely(userId);
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
            const updatePayload = {
                kycStatus: decision === 'approve' ? 'approved' : 'rejected',
                isVerified: decision === 'approve',
                kycReviewDate: Date.now(),
                kycReviewNote: note
            };

            if (decision === 'reject') {
                updatePayload.kycData = FirebaseAdapter.deleteField();
                
                if (u.kycData) {
                   [u.kycData.frontImg, u.kycData.backImg, u.kycData.selfieImg].forEach(img => {
                       if (img) FirebaseAdapter.deleteImageByUrl(img).catch(()=>{});
                   });
                }
            }

            await FirebaseAdapter.updateDocument('telecard_users', userId, updatePayload);

            u.kycStatus = updatePayload.kycStatus;
            u.isVerified = updatePayload.isVerified;
            u.kycReviewNote = note;
            if (decision === 'reject') delete u.kycData;

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
               [u.kycData.frontImg, u.kycData.backImg, u.kycData.selfieImg].forEach(img => {
                   if (img) FirebaseAdapter.deleteImageByUrl(img).catch(()=>{});
               });
            }

            await FirebaseAdapter.updateDocument('telecard_users', userId, {
                kycStatus: 'none',
                isVerified: false,
                kycData: FirebaseAdapter.deleteField(),
                kycReviewNote: 'تم إبطال التوثيق إدارياً'
            });

            u.kycStatus = 'none';
            u.isVerified = false;
            delete u.kycData;
            u.kycReviewNote = 'تم إبطال التوثيق إدارياً';

            if (AdminUI?.UsersUI?.viewUser) AdminUI.UsersUI.viewUser(userId);
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
