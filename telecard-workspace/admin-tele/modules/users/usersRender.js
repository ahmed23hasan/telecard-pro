// ============================================================================
// 👥 محرك رسم المستخدمين (modules/users/usersRender.js)
// 🚀 التحديث: تأمين الفرز السحابي + الرادار الجنائي لكشف الحسابات المتعددة
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { EventBus, Utils } from '../../adminUtils.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UsersTemplates } from './usersTemplates.js'; 

// 🌟 مفسر التوقيت الشامل والآمن (Universal Timestamp Parser)
// يعالج كائنات Firestore Timestamp والنصوص ذات التنسيقات المتعددة مثل (DD/MM/YYYY) لمنع أخطاء الـ NaN أثناء الترتيب الحركي
const parseTimeUniversal = (ts) => {
    if (!ts) return 0;
    
    // 1. إذا كان الكائن عبارة عن Timestamp سحابي من Firestore
    if (ts.seconds !== undefined) return ts.seconds * 1000;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    
    // 2. إذا كانت القيمة بالأصل رقم ملي ثانية (Timestamp)
    if (typeof ts === 'number') return ts;
    
    // 3. معالجة وتأمين نصوص التواريخ والصيغ البريطانية والعربية (DD/MM/YYYY)
    if (typeof ts === 'string') {
        const clean = ts.trim();
        const match = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s*\|\s*(\d{1,2}):(\d{1,2}))?/);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1; // الشهور بأساس 0 في Javascript
            const year = parseInt(match[3], 10);
            const hours = match[4] ? parseInt(match[4], 10) : 0;
            const minutes = match[5] ? parseInt(match[5], 10) : 0;
            return new Date(year, month, day, hours, minutes).getTime();
        }
        const parsed = new Date(clean).getTime();
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

export const UsersRender = {
    state: { userSearch: '', sortUsers: 'desc', userSortCategory: 'newest', currentTierId: null, currentEditUserId: null },

    initListeners: function() {
        EventBus.on('state-update', (newState) => { this.state = { ...this.state, ...newState }; });
        
        // 🌟 تفعيل بروتوكول الاستماع والتحكم الفوري لتبويبات السجل المالي الشامل
        this.setupFullHistoryTabListeners();
    },

    updateUserSortLabel: function() {
        const btn = document.getElementById('btn-user-sort');
        if(btn) btn.innerHTML = UsersTemplates.userSortLabel(this.state.sortUsers === 'asc');
    },

    renderUsers: function() {
        const wrap = document.getElementById('users-container');
        if(!wrap) return;

        let users = Array.isArray(AdminData.data.users) ? [...AdminData.data.users] : [];
        if(!users.length) { wrap.innerHTML = UsersTemplates.emptyUsers(); return; }
        
        // 1. تطبيق فلتر البحث
        const term = (this.state.userSearch || '').toLowerCase();
        if(term) {
            users = users.filter(u => 
                String(u.id||'').toLowerCase().includes(term) || 
                String(u.displayId||'').toLowerCase().includes(term) || 
                String(u.fullName || u.name || '').toLowerCase().includes(term) || 
                String(u.username||'').toLowerCase().includes(term) || 
                String(u.phone||'').includes(term) || 
                String(u.email||'').includes(term)
            );
        }

        // 2. تجهيز مفاتيح التواريخ لترتيب (هذا الشهر، والشهر الماضي)
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

        // 3. الترتيب الذكي (Sorting Logic) المحمي بالمترجم الزمني الشامل
        const sortCat = this.state.userSortCategory || 'newest';
        const isAsc = this.state.sortUsers === 'asc';
        const sortDir = isAsc ? 1 : -1;

        users.sort((a, b) => {
            let valA = 0, valB = 0;

            if (sortCat === 'newest') {
                // 🌟 استخدام المترجم الموحد لمنع انهيار الترتيب بسبب Timestamp
                valA = parseTimeUniversal(a.time || a.joinDate || a.createdAt);
                valB = parseTimeUniversal(b.time || b.joinDate || b.createdAt);
            } 
            else if (sortCat === 'spend_all') {
                valA = Number(a.totalSpent || 0);
                valB = Number(b.totalSpent || 0);
            } 
            else if (sortCat === 'spend_month') {
                valA = Number(a.monthlySpent?.[currentMonthKey] || 0);
                valB = Number(b.monthlySpent?.[currentMonthKey] || 0);
            }
            else if (sortCat === 'spend_last_month') {
                valA = Number(a.monthlySpent?.[lastMonthKey] || 0);
                valB = Number(b.monthlySpent?.[lastMonthKey] || 0);
            }
            else if (sortCat === 'orders_all') {
                valA = Number(a.totalOrdersCount || 0);
                valB = Number(b.totalOrdersCount || 0);
            }
            else if (sortCat === 'orders_month') {
                valA = Number(a.monthlyOrders?.[currentMonthKey] || 0);
                valB = Number(b.monthlyOrders?.[currentMonthKey] || 0);
            }
            else if (sortCat === 'orders_last_month') {
                valA = Number(a.monthlyOrders?.[lastMonthKey] || 0);
                valB = Number(b.monthlyOrders?.[lastMonthKey] || 0);
            }

            if (valA === valB) {
                return (parseTimeUniversal(b.time || b.createdAt) - parseTimeUniversal(a.time || a.createdAt));
            }
            return (valA - valB) * sortDir;
        });

        // 4. الرسم النهائي
        const htmlArray = users.map((u, index) => UsersTemplates.userCard(u, sortCat, currentMonthKey, lastMonthKey, index));
        wrap.innerHTML = `<div class="users-grid">${htmlArray.join('')}</div>`;
        this.updateUserSortLabel();
    },

    viewUser: function(id, preventModalOpen = false) {
        const modal = document.getElementById('m-user-detail'), body = document.getElementById('ud-body');
        if(!modal || !body) return;
        const u = (AdminData.data.users || []).find(x => String(x.id) === String(id)); 
        if(!u) return;
        
        this.state.currentEditUserId = id;
        EventBus.emit('state-update', { currentEditUserId: id });
        
        const bal = Number(u.walletBalance ?? u.balance ?? 0) || 0;
        
        const safeCurrency = Utils.escapeHTML(u.baseCurrency || 'USD');
        const rawName = RenderHelpers._getExplicitName(u);
        
        // 🌟 استبدال المنسق القديم بالمنسق الآمن لتوحيد صيغ تواريخ الإقلاع
        const joinDate = (u.joinDate || u.createdAt || u.date) ? RenderHelpers.formatSafeDate(u.joinDate || u.createdAt || u.date) : 'غير متوفر';

        const tiers = AdminData.data.tiers || [];
        const userTier = tiers.find(t => String(t.id) === String(u.tierId));
        const tierName = userTier ? Utils.escapeHTML(userTier.name) : 'عادي (افتراضي)';

        // 1. جلب الطلبات وإضافة علامة تميزها كطلب
        const userAllOrders = (AdminData.data.orders || []).filter(o => String(o.userId) === String(id)).map(o => ({ ...o, txType: 'order' }));
        
        // 2. جلب الإيداعات وإضافة علامة تميزها كإيداع
        const userAllDeposits = (AdminData.data.deposits || []).filter(d => String(d.userId) === String(id)).map(d => ({ ...d, txType: 'deposit' }));

        // 3. دمج المصفوفتين وترتيبهما زمنياً بشكل صحيح وحمايته بالمرمز الشامل
        const combinedActivity = [...userAllOrders, ...userAllDeposits].sort((a, b) => {
            return parseTimeUniversal(b.time || b.date || b.createdAt) - parseTimeUniversal(a.time || a.date || a.createdAt);
        });

        // 4. اقتطاع أحدث 5 حركات فقط للكرت المصغر بقائمة العميل الشاملة
        const lastActivities = combinedActivity.slice(0, 5);

        // 5. توليد الـ HTML باستخدام القوالب الجديدة المدمجة
        let ordersHtml = lastActivities.length === 0 
            ? UsersTemplates.emptyUserActivity() 
            : lastActivities.map(tx => UsersTemplates.userActivityItem(tx)).join('') + UsersTemplates.userFullHistoryBtn(id);
        
        // =======================================================
        // 🕵️‍♂️ [الرادار الجنائي]: كشف الحسابات المشتركة (Multi-Accounting)
        // =======================================================
        const relatedAccounts = [];
        const userDevices = Array.isArray(u.devicePrints) ? u.devicePrints : [];
        
        if (userDevices.length > 0) {
            (AdminData.data.users || []).forEach(otherUser => {
                if (String(otherUser.id) !== String(u.id) && Array.isArray(otherUser.devicePrints)) {
                    // هل يوجد أي جهاز مشترك بين العميلين؟
                    const hasCommonDevice = otherUser.devicePrints.some(device => userDevices.includes(device));
                    if (hasCommonDevice) {
                        relatedAccounts.push({
                            id: otherUser.id,
                            name: RenderHelpers._getExplicitName(otherUser),
                            isBanned: otherUser.isBanned || otherUser.isIpBanned
                        });
                    }
                }
            });
        }

        const uiData = { 
            bal, safeCurrency, rawName, joinDate, tierName, 
            totalOrdersCount: userAllOrders.length, 
            totalSpent: Number(u.totalSpent || 0),
            relatedAccounts: relatedAccounts // 🌟 تمرير الحسابات المشتركة للقالب
        };
        
        body.innerHTML = UsersTemplates.userDetailBody(u, uiData, ordersHtml);
        this.switchUserTab('overview');
        if(!preventModalOpen) EventBus.emit('req-open-modal', 'user-detail');
    },

    switchUserTab: function(tabId) {
        if (!tabId) return;
        try {
            document.querySelectorAll('.ud-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.ud-tab-content').forEach(content => content.classList.remove('active'));
            
            const targetBtn = document.querySelector(`.ud-tab-btn[data-tab="${tabId}"]`);
            if (targetBtn) targetBtn.classList.add('active');
            
            const targetContent = document.getElementById(tabId) 
                               || document.getElementById(`tab-${tabId}`) 
                               || document.getElementById(`ud-${tabId}`) 
                               || document.getElementById(`ud-tab-${tabId}`);
                               
            if (targetContent) targetContent.classList.add('active');
        } catch (error) {
            console.error("🚨 خطأ في تبديل تبويبات العميل:", error);
        }
    },

    renderTiers: function() {
        const cont = document.getElementById('tiers-container');
        if(!cont) return;
        
        const tiers = Array.isArray(AdminData.data.tiers) ? AdminData.data.tiers : [];
        if(tiers.length === 0) { cont.innerHTML = ''; return; }
        
        const gStats = AdminData.data.system?.globalStats?.tierStats || {};
        
        const userCounts = tiers.reduce((acc, t) => { 
            acc[t.id] = (AdminData.data.users || []).filter(u => String(u.tierId || '') === String(t.id)).length; 
            return acc; 
        }, {});
        
        cont.innerHTML = tiers.map(t => {
            const tStats = gStats[t.id] || { profit: 0, revenue: 0, orderCount: 0 };
            return UsersTemplates.tierCard(t, userCounts[t.id] || 0, tStats);
        }).join('');
    },

    showTierUsersPage: function(tierId) {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        let tierUsersSection = document.getElementById('view-tier-users');
        
        if(!tierUsersSection) {
            tierUsersSection = document.createElement('div');
            tierUsersSection.id = 'view-tier-users';
            tierUsersSection.className = 'section';
            tierUsersSection.innerHTML = UsersTemplates.tierUsersSectionBody();
            document.querySelector('.workspace').appendChild(tierUsersSection);
        }
        
        const tier = (AdminData.data.tiers || []).find(t => String(t.id) === String(tierId));
        this.state.currentTierId = tierId;
        EventBus.emit('state-update', { currentTierId: tierId });

        document.getElementById('tier-users-title').textContent = `عملاء ${tier?.name||'المستوى'}`;
        
        if(tier) {
            document.getElementById('tier-name').textContent = tier.name;
            const iconBox = document.querySelector('.tier-info-card .tic-icon-box i');
            if(iconBox) iconBox.className = `fa-solid ${Utils.escapeHTML(tier.icon||'fa-user')}`;
            
            const gStats = AdminData.data.system?.globalStats?.tierStats || {};
            const tStats = gStats[tier.id] || { profit: 0, revenue: 0 };
            
            const tierInfo = document.querySelector('.tier-info-card .tier-stats');
            if(tierInfo) tierInfo.innerHTML = UsersTemplates.tierInfoStats(tier, tStats);
        }
        
        tierUsersSection.classList.add('active');
        this.renderTierUsersPage();
    },

    renderTierUsersPage: function(){
        const tierId = this.state.currentTierId;
        const list = (AdminData.data.users || []).filter(u => String(u.tierId||'') === String(tierId));
        const tier = (AdminData.data.tiers || []).find(x => String(x.id) === String(tierId));
        
        const durationDays = Number(tier?.duration_days || tier?.duration || 30);
        const durationMs = durationDays * 24 * 60 * 60 * 1000;
        const now = Date.now();

        const container = document.getElementById('tier-users-container');
        if(!container) return;
        if(!list.length){ container.innerHTML = UsersTemplates.emptyTierUsers(); return; }

        const allTiers = AdminData.data.tiers || [];
        const sortedTiers = [...allTiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));

        const htmlArray = list.map(u => {
            let spent = Number(u.tierCycleSpent || 0);
            
            // 🌟 تأمين الوقت باستخدام المترجم المركزي الموحد
            let cycleStart = parseTimeUniversal(u.tierCycleStartDate || now);
            
            if (now - cycleStart > durationMs) {
                spent = 0;
            }

            const nextTier = sortedTiers.find(t => Number(t.threshold || 0) > Number(tier.threshold || 0));
            
            let targetThreshold = 0;
            let isTopTier = false;
            let nextTierName = "المستوى التالي";

            if (nextTier) {
                targetThreshold = Number(nextTier.threshold);
                nextTierName = nextTier.name;
            } else {
                targetThreshold = Number(tier.threshold || 0);
                if (targetThreshold <= 0) targetThreshold = 500; 
                if (spent >= targetThreshold) {
                    isTopTier = true; 
                }
            }

            let pct = 0;
            if (targetThreshold > 0) {
                pct = Math.min(100, Math.max(0, (spent / targetThreshold) * 100));
            } else {
                pct = 100;
            }
            
            return UsersTemplates.tierUserCard(u, spent, targetThreshold, pct, isTopTier, nextTierName, tier);
        });
        
        let html = (UsersTemplates && typeof UsersTemplates.tierUsersSearchBox === 'function') ? UsersTemplates.tierUsersSearchBox() : '';
        container.innerHTML = html + `<div class="tier-users-table">${htmlArray.join('')}</div>`;
    },

    renderKycSystem: function() {
        const target = document.getElementById('kyc-dashboard-target');
        if (!target) return;
        
        const settings = AdminData.data.settings || {};
        const kycConfig = settings.kycConfig || { mode: 'off', targetedTiers: [] };
        const tiers = AdminData.data.tiers || [];
        const users = AdminData.data.users || [];
        const pendingRequests = users.filter(u => u.kycStatus === 'pending');
        const hasAnyKycHistory = users.some(u => u.kycStatus && u.kycStatus !== 'none');

        let requestsHtml = '';
        if (pendingRequests.length > 0) {
            const searchHtml = UsersTemplates.kycSearchBox ? UsersTemplates.kycSearchBox() : '';
            const headerHtml = UsersTemplates.kycPendingHeader ? UsersTemplates.kycPendingHeader(pendingRequests.length) : `<h6 class="mb-3 fw-bold text-warning"><i class="fa-solid fa-file-shield"></i> طلبات بانتظار المراجعة (${pendingRequests.length})</h6>`;
            
            requestsHtml = `
                <div class="mt-4">
                    ${headerHtml}
                    ${searchHtml}
                    <div id="kyc-requests-container" class="kyc-requests-list">
                        ${pendingRequests.map(u => UsersTemplates.kycRequestCard(u)).join('')}
                    </div>
                </div>`;
        } else {
            const emptyType = hasAnyKycHistory ? 'done' : 'empty';
            requestsHtml = UsersTemplates.emptyKycState ? UsersTemplates.emptyKycState(emptyType) : '<div class="empty-state">لا توجد طلبات</div>';
        }
        
        target.innerHTML = UsersTemplates.kycDashboard(kycConfig, tiers) + requestsHtml;
    },

    // =========================================================
    // 🌟 تفاعل التبويبات الفوري للـ Full History Modal وتحديث العداد ديناميكياً
    // =========================================================
    setupFullHistoryTabListeners: function() {
        // دالة تحديث العداد ديناميكياً بناءً على اللوح النشط
        const updateActiveTabCount = () => {
            const modal = document.getElementById('user-full-history-modal');
            if (!modal) return;
            
            const activeTab = modal.querySelector('.fh-tab.active');
            if (!activeTab) return;
            
            const targetPaneId = activeTab.dataset.target;
            const targetPane = document.getElementById(targetPaneId);
            if (targetPane) {
                let count = targetPane.children.length;
                
                // 🌟 الإصلاح الجذري البرمجي: التحقق الشامل من وجود كرت "الحالة الفارغة" بداخل اللوح بالكامل
                if (targetPane.querySelector('.ud-empty-state, .empty-state')) {
                    count = 0;
                }
                
                const badge = document.getElementById('fh-count-badge');
                if (badge) {
                    badge.innerText = count;
                    
                    // تخصيص المسمى العربي المناسب تزامناً مع الفئة المحددة
                    let labelNode = badge.nextSibling;
                    if (!labelNode || labelNode.nodeType !== Node.TEXT_NODE) {
                        labelNode = document.createTextNode('');
                        badge.parentNode.appendChild(labelNode);
                    }
                    
                    if (targetPaneId === 'fh-deposits') {
                        labelNode.nodeValue = ' إيداع';
                    } else if (targetPaneId === 'fh-orders') {
                        labelNode.nodeValue = ' شراء';
                    } else {
                        labelNode.nodeValue = ' حركة';
                    }
                }
            }
        };

        // 1. الاستماع لنقرات تبديل التبويبات الفئوية اليدوية
        document.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.fh-tab');
            if (!tabBtn) return;
            
            const modal = document.getElementById('user-full-history-modal');
            if (!modal) return;
            
            modal.querySelectorAll('.fh-tab').forEach(btn => btn.classList.remove('active'));
            tabBtn.classList.add('active');
            
            const targetPaneId = tabBtn.dataset.target;
            modal.querySelectorAll('.fh-pane').forEach(pane => pane.style.display = 'none');
            
            const targetPane = document.getElementById(targetPaneId);
            if (targetPane) {
                targetPane.style.display = 'block';
                updateActiveTabCount();
            }
        });

        // 2. 🌟 الإصلاح السحري للإقلاع: رصد نقرة فتح السجل المالي الشامل لتحديث العداد تلقائياً فور التحميل
        document.addEventListener('click', (e) => {
            const openBtn = e.target.closest('[data-action="view-user-full-history"]');
            if (!openBtn) return;
            
            // مهلة زمنية صغيرة جداً (150ms) للسماح للمودال بالرسم والفتح، ثم تصفير العداد والعد الحقيقي الموحد
            setTimeout(updateActiveTabCount, 150);
        });
        
        // 3. 🌟 مراقبة المودال سحابياً (MutationObserver) في حال حدوث تحديثات في الخلفية عند اكتمال جلب السيرفر
        const modal = document.getElementById('user-full-history-modal');
        if (modal) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (modal.classList.contains('active')) {
                            // المودال أصبح نشطاً، انتظر قليلاً ليتم تعبئة الحركات ثم حدّث العداد
                            setTimeout(updateActiveTabCount, 150);
                        }
                    }
                });
            });
            observer.observe(modal, { attributes: true });
            
            // مراقبة ألواح الـ Pane أيضاً في حال تغيير محتواها عند اكتمال جلب السجل السحابي من السيرفر
            const panes = modal.querySelectorAll('.fh-pane');
            panes.forEach(pane => {
                const paneObserver = new MutationObserver(() => {
                    if (modal.classList.contains('active')) {
                        updateActiveTabCount();
                    }
                });
                paneObserver.observe(pane, { childList: true });
            });
        }
    }
};