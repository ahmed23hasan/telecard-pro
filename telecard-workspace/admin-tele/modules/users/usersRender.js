// ============================================================================
// 👥 محرك رسم المستخدمين (modules/users/usersRender.js) - Cloud-Native V18.6 💎
// 🚀 التحديثات المعمارية (V18.6 - Infinite Loop Shield): 
// 1. Data Normalization Shield 🛡️: الاعتماد المطلق على الذاكرة المركزية AdminData.
// 2. Infinite Loop Fix 🛡️: إيقاف زر جلب المزيد بشكل قطعي إذا أرجع السيرفر (null).
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UsersTemplates } from './usersTemplates.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const UsersRender = {
    state: { userSearch: '', sortUsers: 'desc', userSortCategory: 'newest', currentTierId: null, currentEditUserId: null, userHistoryTab: 'orders' },

    _renderToken: 0,
    _historyListenerAdded: false,

    initListeners: function() {
        EventBus.on('state-update', (newState) => { this.state = { ...this.state, ...newState }; });
        EventBus.on('req-render-user-history', () => this.renderUserHistoryList());
        
        EventBus.on('req-clear-render-filters', () => {
            this.state.userSearch = '';
        });
        
        this.setupFullHistoryTabListeners();
    },

    updateUserSortLabel: function() {
        const btn = document.getElementById('btn-user-sort');
        if(btn) btn.innerHTML = UsersTemplates.userSortLabel(this.state.sortUsers === 'asc');
    },
    
    loadMoreUsers: async function() {
        const btn = document.querySelector('.btn-load-more');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل من السحابة...';
            btn.disabled = true;
        }

        try {
            const res = await FirebaseAdapter.fetchMoreWithCursor(
                'telecard_users', [], 'createdAt', AdminData.cursors.users, 50
            );

            if (res && res.data && res.data.length > 0) {
                // 🚀 [درع الدمج]: إضافة العملاء الجدد دون مسح القدامى
                AdminData.data.users = [...AdminData.data.users, ...res.data];
                res.data.forEach(u => { AdminData.data.usersMap[String(u.id)] = u; });
                
                // 🛡️ [إصلاح التكرار اللانهائي]: تحديث المؤشر فقط إذا كان هناك المزيد
                if (res.newLastDoc) {
                    AdminData.cursors.users = res.newLastDoc;
                } else {
                    AdminData.cursors.users = null;
                    if (btn) {
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> لا يوجد عملاء أقدم';
                        btn.classList.add('disabled', 'text-muted');
                        btn.disabled = true;
                    }
                }

                this.renderUsers(); 
            } else {
                // 🛡️ إغلاق الزر نهائياً إذا لم يرجع السيرفر أي بيانات
                AdminData.cursors.users = null;
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> لا يوجد عملاء أقدم';
                    btn.classList.add('disabled', 'text-muted');
                    btn.disabled = true;
                }
            }
        } catch (error) {
            console.error("🚨 فشل جلب المزيد من العملاء سحابياً:", error);
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> حاول مجدداً';
                btn.disabled = false;
            }
        }
    },

        renderUsers: function() {
        const wrap = document.getElementById('users-container');
        if(!wrap) return;

        // 🚀 [التحديث المعماري]: الاعتماد المطلق على الذاكرة المركزية المدمجة
        let users = Array.isArray(AdminData.data.users) ? [...AdminData.data.users] : [];

        if (this.state.userSearch) {
            const query = this.state.userSearch.toLowerCase();
            users = users.filter(u => 
                String(u.id||'').toLowerCase().includes(query) || 
                String(u.displayId||'').toLowerCase().includes(query) || 
                String(u.fullName || u.name || '').toLowerCase().includes(query) || 
                String(u.email||'').includes(query)
            );
        }

        if(!users.length) { 
            wrap.innerHTML = this.state.userSearch ? `<div class="empty-state"><i class="fa-solid fa-search"></i><span>لم يتم العثور على العميل "${Utils.escapeHTML(this.state.userSearch)}" في قاعدة البيانات.</span></div>` : UsersTemplates.emptyUsers(); 
            return; 
        }

        const sortCat = this.state.userSortCategory || 'newest';
        const isAsc = this.state.sortUsers === 'asc';
        const sortDir = isAsc ? 1 : -1;

        // 🚀 التحديث المعماري: إزالة الفلاتر الشهرية التالفة والاعتماد على الإجماليات الشاملة فقط
        users.sort((a, b) => {
            let valA = 0,
                valB = 0;
            if (sortCat === 'newest') {
                valA = RenderHelpers.parseTime(a.time || a.joinDate || a.createdAt);
                valB = RenderHelpers.parseTime(b.time || b.joinDate || b.createdAt);
            }
            else if (sortCat === 'spend_all') {
                valA = Number(a.totalSpent || 0);
                valB = Number(b.totalSpent || 0);
            }
            else if (sortCat === 'orders_all') {
                valA = Number(a.totalOrdersCount || 0);
                valB = Number(b.totalOrdersCount || 0);
            }
            
            if (valA === valB) {
                return (RenderHelpers.parseTime(b.time || b.createdAt) - RenderHelpers.parseTime(a.time || a.createdAt));
            }
            return (valA - valB) * sortDir;
        });
        
        this._renderToken = Date.now();
        const currentToken = this._renderToken;
        
        const hasMoreInCloud = AdminData.cursors.users !== null && AdminData.cursors.users !== undefined && !this.state.userSearch;
        const loadMoreHtml = hasMoreInCloud ? `
            <div class="load-more-container mt-15 mb-15 w-100 text-center" id="load-more-users-btn">
                <button class="btn btn-ghost btn-load-more" data-action="load-more-users">
                    <i class="fa-solid fa-angle-down"></i> جلب المزيد من العملاء ☁️
                </button>
            </div>` : '';
        
        wrap.innerHTML = `<div class="users-grid" id="users-grid-container"></div>${loadMoreHtml}`;
        const grid = document.getElementById('users-grid-container');
        
        const chunkSize = 200;
        let currentIndex = 0;
        
        const renderChunk = () => {
            if (this._renderToken !== currentToken) return;
            
            const chunk = users.slice(currentIndex, currentIndex + chunkSize);
            if (chunk.length === 0) {
                this.updateUserSortLabel();
                return;
            }
            
            // تم حذف المتغيرات الشهرية الحالية والماضية من الاستدعاء
            const htmlChunk = chunk.map((u, i) => UsersTemplates.userCard(u, sortCat, '', '', currentIndex + i));
            grid.insertAdjacentHTML('beforeend', htmlChunk.join(''));
            
            currentIndex += chunkSize;
            
            if (currentIndex < users.length) {
                requestAnimationFrame(renderChunk);
            } else {
                this.updateUserSortLabel();
            }
        };
        
        requestAnimationFrame(renderChunk);
    },

    viewUser: function(id, preventModalOpen = false) {
        const modal = document.getElementById('m-user-detail'), body = document.getElementById('ud-body');
        if(!modal || !body) return;
        
        const u = AdminData.data.usersMap?.[id] || (AdminData.data.users || []).find(x => String(x.id) === String(id));
        if(!u) {
            if (window.AdminUI?.showToast) window.AdminUI.showToast("لا يمكن العثور على بيانات هذا العميل حالياً.", "error");
            return;
        }
        
        this.state.currentEditUserId = id;
        EventBus.emit('state-update', { currentEditUserId: id });
        
        const bal = Number(u.walletBalance ?? u.balance ?? 0) || 0;
        const safeCurrency = Utils.escapeHTML(u.baseCurrency || 'USD');
        const rawName = RenderHelpers._getExplicitName(u);
        const joinDate = (u.joinDate || u.createdAt || u.date) ? RenderHelpers.formatSafeDate(u.joinDate || u.createdAt || u.date) : 'غير متوفر';

        const userTier = AdminData.data.tiersMap?.[u.tierId] || AdminData.data.tiers.find(t => String(t.id) === String(u.tierId));
        const tierName = userTier ? Utils.escapeHTML(userTier.name) : 'عادي (افتراضي)';

        const userAllOrders = (AdminData.data.orders || []).filter(o => String(o.userId) === String(id)).map(o => ({ ...o, txType: 'order' }));
        const userAllDeposits = (AdminData.data.deposits || []).filter(d => String(d.userId) === String(id)).map(d => ({ ...d, txType: 'deposit' }));

        const combinedActivity = [...userAllOrders, ...userAllDeposits].sort((a, b) => {
            return RenderHelpers.parseTime(b.time || b.date || b.createdAt) - RenderHelpers.parseTime(a.time || a.date || a.createdAt);
        });

        this.state.userHistoryTab = 'orders';
        AdminData.tempUserHistory = { all: combinedActivity };

        const relatedAccounts = [];
        const userDevices = Array.isArray(u.devicePrints) ? u.devicePrints : [];
        if (userDevices.length > 0) {
            (AdminData.data.users || []).forEach(otherUser => {
                if (String(otherUser.id) !== String(u.id) && Array.isArray(otherUser.devicePrints)) {
                    const hasCommonDevice = otherUser.devicePrints.some(device => userDevices.includes(device));
                    if (hasCommonDevice) {
                        relatedAccounts.push({ id: otherUser.id, name: RenderHelpers._getExplicitName(otherUser), isBanned: otherUser.isBanned || otherUser.isIpBanned });
                    }
                }
            });
        }

        const userReview = (AdminData.data.reviews || []).find(r => String(r.userId) === String(id));

        const uiData = { 
            bal, safeCurrency, rawName, joinDate, tierName, 
            totalOrdersCount: userAllOrders.length, 
            totalSpent: Number(u.totalSpent || 0), 
            relatedAccounts: relatedAccounts,
            userReview: userReview
        };
        
        body.innerHTML = UsersTemplates.userDetailBody(u, uiData);
        this.renderUserHistoryList();
        
        this.switchUserTab('overview');
        if(!preventModalOpen) EventBus.emit('req-open-modal', 'user-detail');

        EventBus.emit('action-triggered', { action: 'fetch-user-history', id: id, loadMore: false });
    },

    switchUserHistoryTab: function(tab, btnEl) {
        this.state.userHistoryTab = tab;
        if (btnEl) {
            const container = btnEl.closest('.sub-tabs-container') || btnEl.parentElement;
            if (container) {
                container.querySelectorAll('.fh-tab').forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                    b.classList.add('btn-ghost');
                });
                btnEl.classList.remove('btn-ghost');
                btnEl.classList.add('active', 'btn-primary');
            }
        }
        this.renderUserHistoryList();
    },

    renderUserHistoryList: function() {
        const listContainer = document.getElementById('user-history-list');
        const loadMoreBtn = document.getElementById('btn-load-more-user-history');
        if (!listContainer) return;

        const tab = this.state.userHistoryTab || 'orders';
        const allHistory = (AdminData.tempUserHistory && AdminData.tempUserHistory.all) ? AdminData.tempUserHistory.all : [];
        
        allHistory.forEach(tx => {
            if (!tx.txType) {
                if (tx.product || tx.prodId || tx.qty) tx.txType = 'order';
                else if (tx.method || tx.methodName || tx.network) tx.txType = 'deposit';
                else tx.txType = 'order'; 
            }
        });
        
        let filteredData = allHistory;
        if (tab === 'orders') filteredData = allHistory.filter(tx => tx.txType === 'order');
        else if (tab === 'deposits') filteredData = allHistory.filter(tx => tx.txType === 'deposit');

        if (filteredData.length === 0) {
            listContainer.innerHTML = UsersTemplates.emptyUserActivity();
        } else {
            listContainer.innerHTML = filteredData.map(tx => UsersTemplates.userActivityItem(tx)).join('');
        }

        const badge = document.getElementById('fh-count-badge');
        if (badge) {
            badge.innerText = filteredData.length;
            let labelNode = badge.nextSibling;
            if (!labelNode || labelNode.nodeType !== Node.TEXT_NODE) {
                labelNode = document.createTextNode('');
                badge.parentNode.appendChild(labelNode);
            }
            if (tab === 'deposits') labelNode.nodeValue = ' إيداع';
            else if (tab === 'orders') labelNode.nodeValue = ' شراء';
            else labelNode.nodeValue = ' حركة';
        }

        const currentLimit = AdminData.tempUserHistoryLimit || 25;
        if (allHistory.length < currentLimit) {
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        } else {
            if (loadMoreBtn) loadMoreBtn.style.display = 'inline-block';
        }
    },

    setupFullHistoryTabListeners: function() {
        if (this._historyListenerAdded) return;
        document.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.fh-tab');
            if (!tabBtn) return;
            const rawTarget = tabBtn.dataset.target || '';
            const tabId = rawTarget.replace('fh-', ''); 
            this.switchUserHistoryTab(tabId, tabBtn);
        });
        this._historyListenerAdded = true;
    },

    switchUserTab: function(tabId) {
        if (!tabId) return;
        try {
            document.querySelectorAll('.ud-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.ud-tab-content').forEach(content => content.classList.remove('active'));
            const targetBtn = document.querySelector(`.ud-tab-btn[data-tab="${tabId}"]`);
            if (targetBtn) targetBtn.classList.add('active');
            const targetContent = document.getElementById(tabId) || document.getElementById(`tab-${tabId}`) || document.getElementById(`ud-${tabId}`) || document.getElementById(`ud-tab-${tabId}`);
            if (targetContent) targetContent.classList.add('active');
        } catch (error) { console.error("🚨 خطأ في تبديل تبويبات العميل:", error); }
    },

    renderTiers: function() {
        const cont = document.getElementById('tiers-container');
        if(!cont) return;
        const tiers = Array.isArray(AdminData.data.tiers) ? AdminData.data.tiers : [];
        if(tiers.length === 0) { cont.innerHTML = ''; return; }
        
        const cloudStats = AdminData.data.cloudStats?.users?.tierCounts || {};
        
        cont.innerHTML = tiers.map(t => {
            const cloudUserCount = cloudStats[t.id];
            let userCount = 0;
            if (cloudUserCount !== undefined) {
                userCount = cloudUserCount;
            } else {
                userCount = (AdminData.data.users || []).filter(u => String(u.tierId) === String(t.id)).length;
            }
            return UsersTemplates.tierCard(t, userCount);
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
        const tier = AdminData.data.tiersMap?.[tierId] || (AdminData.data.tiers || []).find(t => String(t.id) === String(tierId));
        this.state.currentTierId = tierId;
        EventBus.emit('state-update', { currentTierId: tierId });

        document.getElementById('tier-users-title').textContent = `عملاء ${tier?.name||'المستوى'}`;
        if(tier) {
            document.getElementById('tier-name').textContent = tier.name;
            const iconBox = document.querySelector('.tier-info-card .tic-icon-box i');
            if(iconBox) iconBox.className = `fa-solid ${Utils.escapeHTML(tier.icon||'fa-user')}`;
            const tierInfo = document.querySelector('.tier-info-card .tier-stats');
            if(tierInfo) tierInfo.innerHTML = UsersTemplates.tierInfoStats(tier);
        }
        tierUsersSection.classList.add('active');
        this.renderTierUsersPage();
    },

    renderTierUsersPage: function(){
        const tierId = this.state.currentTierId;
        const list = (AdminData.data.users || []).filter(u => String(u.tierId||'') === String(tierId));
        const tier = AdminData.data.tiersMap?.[tierId] || (AdminData.data.tiers || []).find(x => String(x.id) === String(tierId));
        const durationDays = Number(tier?.duration_days || tier?.duration || 30);
        
        const serverNowMs = Date.now();
        const getStartOfUTCDay = (timestampMs) => {
            const d = new Date(timestampMs); d.setUTCHours(0, 0, 0, 0); return d.getTime();
        };
        const todayDay = getStartOfUTCDay(serverNowMs);

        const container = document.getElementById('tier-users-container');
        if(!container) return;

        const searchInputObj = document.querySelector('.tier-search-box-wrapper input');
        const term = searchInputObj ? searchInputObj.value.toLowerCase().trim() : '';

        let filteredList = list;
        if (term) {
            filteredList = list.filter(u => {
                const text = (u.fullName || u.name || u.id || u.displayId || '').toLowerCase();
                return text.includes(term);
            });
        }

        if(!filteredList.length){ 
            let html = (UsersTemplates && typeof UsersTemplates.tierUsersSearchBox === 'function') ? UsersTemplates.tierUsersSearchBox() : '';
            container.innerHTML = html + UsersTemplates.emptyTierUsers(); 
            const newSearchInput = document.querySelector('.tier-search-box-wrapper input');
            if (newSearchInput && term) {
                newSearchInput.value = term;
                newSearchInput.focus();
            }
            return; 
        }

        const allTiers = AdminData.data.tiers || [];
        const sortedTiers = [...allTiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));

        const htmlArray = filteredList.map(u => {
            let spent = Number(u.tierCycleSpent || 0);
            let cycleStartMs = RenderHelpers.parseTime(u.tierCycleStartDate || serverNowMs);
            let cycleStartDay = getStartOfUTCDay(cycleStartMs);
            const daysPassed = (todayDay - cycleStartDay) / (24 * 60 * 60 * 1000);

            if (daysPassed > durationDays) spent = 0;

            const nextTier = sortedTiers.find(t => Number(t.threshold || 0) > Number(tier.threshold || 0));
            let targetThreshold = 0; let isTopTier = false; let nextTierName = "المستوى التالي";

            if (nextTier) { targetThreshold = Number(nextTier.threshold); nextTierName = nextTier.name; } 
            else { targetThreshold = Number(tier.threshold || 0); if (targetThreshold <= 0) targetThreshold = 500; if (spent >= targetThreshold) isTopTier = true; }

            let pct = 0;
            if (targetThreshold > 0) pct = Math.min(100, Math.max(0, (spent / targetThreshold) * 100));
            else pct = 100;
            
            return UsersTemplates.tierUserCard(u, spent, targetThreshold, pct, isTopTier, nextTierName, tier);
        });
        
        let html = (UsersTemplates && typeof UsersTemplates.tierUsersSearchBox === 'function') ? UsersTemplates.tierUsersSearchBox() : '';
        container.innerHTML = html + `<div class="tier-users-table">${htmlArray.join('')}</div>`;

        const newSearchInput = document.querySelector('.tier-search-box-wrapper input');
        if (newSearchInput && term) {
            newSearchInput.value = term;
            newSearchInput.focus();
            newSearchInput.setSelectionRange(term.length, term.length);
        }
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
            requestsHtml = `<div class="mt-4">${headerHtml}${searchHtml}<div id="kyc-requests-container" class="kyc-requests-list">${pendingRequests.map(u => UsersTemplates.kycRequestCard(u)).join('')}</div></div>`;
        } else {
            const emptyType = hasAnyKycHistory ? 'done' : 'empty';
            requestsHtml = UsersTemplates.emptyKycState ? UsersTemplates.emptyKycState(emptyType) : '<div class="empty-state">لا توجد طلبات</div>';
        }
        target.innerHTML = UsersTemplates.kycDashboard(kycConfig, tiers) + requestsHtml;

        setTimeout(() => {
            const searchInput = document.getElementById('kyc-search-input');
            if (searchInput && searchInput.value && window.AdminUI?.UsersUI?.filterKycRequests) { window.AdminUI.UsersUI.filterKycRequests(searchInput.value); }
        }, 10);
    }
};
