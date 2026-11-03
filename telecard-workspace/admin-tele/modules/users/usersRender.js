// ============================================================================
// 👥 محرك رسم المستخدمين (modules/users/usersRender.js) - Cloud-Native V20.0 💎
// 🚀 التحديثات المعمارية (V20.0 - Cloud Multi-Account Radar & 10K-Scale Sync): 
// 1. Cloud Multi-Account Radar 📡: فحص سحابي شامل في Firestore لكشف الحسابات المشتركة في (الأجهزة + IP).
// 2. Server-Side Tier Pagination ☁️: جلب عملاء المستوى سحابياً وحفظهم في usersMap مع حماية مربع البحث.
// 3. DOM Leak Shield 🛡️: تفعيل التدمير الذاتي (dynamic-auto-destroy) لنافذة ملف العميل.
// 4. Unified Progress Engine ⚙️: الاعتماد المطلق على المحرك المالي لرسم شريط تقدم المستوى.
// 5. Isolated KYC & Cloud Profile Fetching ⚡: دمج kycPendingUsers وجلب العملاء غير الموجودين بالكاش سحابياً.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UsersTemplates } from './usersTemplates.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { collection, query, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
            const searchTerm = (this.state.userSearch || '').trim();
            
            const payload = {
                limit: 50,
                lastDocId: AdminData.cursors.users,
                sortCategory: this.state.userSortCategory || 'newest',
                sortDir: this.state.sortUsers || 'desc',
                searchQuery: searchTerm
            };
            
            const res = await FirebaseAdapter.callFunction('adminGetUsersList', payload);
            
            if (res && res.success && res.data && res.data.length > 0) {
                let currentSnapshotData = res.data;
                let accumulatedData = Array.isArray(AdminData.data.users) ? AdminData.data.users : [];
                
                const combinedMap = new Map();
                
                if (searchTerm) {
                    currentSnapshotData.forEach(u => combinedMap.set(u.id, u));
                } else {
                    accumulatedData.forEach(u => combinedMap.set(u.id, u));
                    currentSnapshotData.forEach(u => combinedMap.set(u.id, u));
                }
                
                AdminData.data.users = Array.from(combinedMap.values());
                AdminData.data.users.forEach(u => { AdminData.data.usersMap[String(u.id)] = u; });
                
                if (res.pagination && res.pagination.hasMore) {
                    AdminData.cursors.users = res.pagination.lastDocId;
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
                AdminData.cursors.users = null;
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد نتائج مطابقة';
                    btn.classList.add('disabled', 'text-muted');
                    btn.disabled = true;
                }
                if (searchTerm) {
                    AdminData.data.users = [];
                    this.renderUsers();
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

        let users = Array.isArray(AdminData.data.users) ? [...AdminData.data.users] : [];

        if(!users.length) { 
            wrap.innerHTML = this.state.userSearch ? `<div class="empty-state"><i class="fa-solid fa-search"></i><span>لم يتم العثور على العميل "${Utils.escapeHTML(this.state.userSearch)}" في قاعدة البيانات.</span></div>` : UsersTemplates.emptyUsers(); 
            return; 
        }

        const sortCat = this.state.userSortCategory || 'newest';
        
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

    viewUser: async function(id, preventModalOpen = false) {
        const strId = String(id);
        let u = AdminData.data.usersMap?.[strId] ||
                (AdminData.data.users || []).find(x => String(x.id) === strId) ||
                (AdminData.data.kycPendingUsers || []).find(x => String(x.id) === strId);

        if (!u) {
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(true, 'جاري استدعاء ملف العميل سحابياً...');
            try {
                u = await FirebaseAdapter.getById('telecard_users', strId);
                if (u) {
                    if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                    AdminData.data.usersMap[strId] = u;
                }
            } catch (e) {
                console.error("ViewUser Cloud Fetch Error:", e);
            } finally {
                if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
            }
        }

        if(!u) {
            if (window.AdminUI?.showToast) window.AdminUI.showToast("لا يمكن العثور على بيانات هذا العميل حالياً.", "error");
            return;
        }
        
        this.state.currentEditUserId = strId;
        EventBus.emit('state-update', { currentEditUserId: strId });
        
        const bal = Number(u.walletBalance ?? u.balance ?? 0) || 0;
        const safeCurrency = Utils.escapeHTML(u.baseCurrency || 'USD');
        const rawName = RenderHelpers._getTxName(u);
        const joinDate = (u.joinDate || u.createdAt || u.date) ? RenderHelpers.formatSafeDate(u.joinDate || u.createdAt || u.date) : 'غير متوفر';

        const userTier = AdminData.data.tiersMap?.[u.tierId] || AdminData.data.tiers.find(t => String(t.id) === String(u.tierId));
        const tierName = userTier ? Utils.escapeHTML(userTier.name) : 'عادي (افتراضي)';

        const userAllOrders = (AdminData.data.orders || []).filter(o => String(o.userId) === strId).map(o => ({ ...o, txType: 'order' }));
        const userAllDeposits = (AdminData.data.deposits || []).filter(d => String(d.userId) === strId).map(d => ({ ...d, txType: 'deposit' }));

        const combinedActivity = [...userAllOrders, ...userAllDeposits].sort((a, b) => {
            return RenderHelpers.parseTime(b.time || b.date || b.createdAt) - RenderHelpers.parseTime(a.time || a.date || a.createdAt);
        });

        this.state.userHistoryTab = 'orders';
        AdminData.tempUserHistory = { all: combinedActivity };

        const relatedAccounts = [];
        const userDevices = Array.isArray(u.devicePrints) ? u.devicePrints : [];
        const userLastIp = String(u.lastIp || u.ipAddress || u.ip || '').trim();
        const allCachedUsers = Object.values(AdminData.data.usersMap || {});

        if (userDevices.length > 0 || (userLastIp && userLastIp !== 'غير متوفر')) {
            allCachedUsers.forEach(otherUser => {
                if (!otherUser || String(otherUser.id) === strId || otherUser.isDeleted) return;
                const otherDevices = Array.isArray(otherUser.devicePrints) ? otherUser.devicePrints : [];
                const otherIp = String(otherUser.lastIp || otherUser.ipAddress || otherUser.ip || '').trim();
                
                const hasCommonDevice = userDevices.length > 0 && otherDevices.some(dev => userDevices.includes(dev));
                const hasCommonIp = Boolean(userLastIp && userLastIp !== 'غير متوفر' && otherIp === userLastIp);
                
                if (hasCommonDevice || hasCommonIp) {
                    const reason = (hasCommonDevice && hasCommonIp) ? 'جهاز + IP' : (hasCommonDevice ? 'نفس الجهاز' : 'نفس الـ IP');
                    relatedAccounts.push({
                        id: otherUser.id,
                        name: RenderHelpers._getTxName(otherUser),
                        isBanned: Boolean(otherUser.isBanned || otherUser.isIpBanned),
                        reason
                    });
                }
            });
        }

        const userReview = (AdminData.data.reviews || []).find(r => String(r.userId) === strId);

        const uiData = { 
            bal, safeCurrency, rawName, joinDate, tierName, 
            totalOrdersCount: Math.max(Number(u.totalOrdersCount || 0), userAllOrders.length), 
            totalSpent: Number(u.totalSpent || 0), 
            relatedAccounts: relatedAccounts,
            userReview: userReview
        };        

        let modal = document.getElementById('m-user-detail');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'm-user-detail';
            modal.className = 'modal-overlay dynamic-auto-destroy'; 
            document.body.appendChild(modal);
        }

        const activeTabBtn = modal.querySelector('.ud-tab-btn.active');
        const currentTab = activeTabBtn ? activeTabBtn.dataset.tab : 'overview';

        modal.innerHTML = UsersTemplates.userDetailModal(u, uiData);
        
        this.renderUserHistoryList();
        this.switchUserTab(currentTab);
        
        if(!preventModalOpen) {
            void modal.offsetWidth;
            
            requestAnimationFrame(() => {
                modal.classList.add('active');
            });
            EventBus.emit('req-open-modal', 'user-detail');
        }

        EventBus.emit('action-triggered', { action: 'fetch-user-history', id: strId, loadMore: false });
        this.scanCloudMultiAccountsRadar(u, relatedAccounts);
    },

    scanCloudMultiAccountsRadar: async function(u, initialRelated = []) {
        if (!u || !u.id) return;
        const strId = String(u.id);
        const userDevices = Array.isArray(u.devicePrints) ? u.devicePrints.filter(Boolean).slice(0, 10) : [];
        const userLastIp = String(u.lastIp || u.ipAddress || u.ip || '').trim();
        const hasValidIp = Boolean(userLastIp && userLastIp !== 'غير متوفر' && userLastIp !== 'غير معروف');

        if (userDevices.length === 0 && !hasValidIp) return;

        try {
            const usersCol = collection(FirebaseAdapter.db, 'telecard_users');
            const queries = [];
            if (userDevices.length > 0) {
                queries.push(getDocs(query(usersCol, where('devicePrints', 'array-contains-any', userDevices), limit(15))));
            }
            if (hasValidIp) {
                queries.push(getDocs(query(usersCol, where('lastIp', '==', userLastIp), limit(15))));
            }

            const settledResults = await Promise.allSettled(queries);
            const mergedMap = new Map();
            initialRelated.forEach(item => mergedMap.set(String(item.id), item));

            settledResults.forEach(res => {
                if (res.status !== 'fulfilled' || !res.value) return;
                res.value.forEach(docSnap => {                    
                    if (String(docSnap.id) === strId) return;
                    const otherUser = { id: docSnap.id, ...docSnap.data() };
                    if (otherUser.isDeleted) return;

                    if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                    if (!AdminData.data.usersMap[docSnap.id]) AdminData.data.usersMap[docSnap.id] = otherUser;

                    const otherDevices = Array.isArray(otherUser.devicePrints) ? otherUser.devicePrints : [];
                    const otherIp = String(otherUser.lastIp || otherUser.ipAddress || otherUser.ip || '').trim();

                    const hasCommonDevice = userDevices.length > 0 && otherDevices.some(dev => userDevices.includes(dev));
                    const hasCommonIp = hasValidIp && otherIp === userLastIp;

                    if (hasCommonDevice || hasCommonIp) {
                        const reason = (hasCommonDevice && hasCommonIp) ? 'جهاز + IP' : (hasCommonDevice ? 'نفس الجهاز' : 'نفس الـ IP');
                        mergedMap.set(String(otherUser.id), {
                            id: otherUser.id,
                            name: RenderHelpers._getTxName(otherUser),
                            isBanned: Boolean(otherUser.isBanned || otherUser.isIpBanned),
                            reason
                        });
                    }
                });
            });

            const radarBoxEl = document.getElementById('ud-radar-box-target');
            if (radarBoxEl && this.state.currentEditUserId === strId) {
                radarBoxEl.innerHTML = UsersTemplates.radarBoxContent(Array.from(mergedMap.values()));
            }
        } catch (radarErr) {
            console.warn("⚠️ تعذر فحص رادار الحسابات المتعددة سحابياً:", radarErr.message);
        }
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
        if (filteredData.length < currentLimit && allHistory.length < (currentLimit * 2)) {
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
            const modal = document.getElementById('m-user-detail');
            const root = modal || document;

            root.querySelectorAll('.ud-tab-btn').forEach(btn => btn.classList.remove('active'));
            root.querySelectorAll('.ud-tab-content, #ud-body > div').forEach(content => {
                content.classList.remove('active');
                content.classList.add('hide-element');
                content.style.display = 'none';
            });

            const targetBtn = root.querySelector(`.ud-tab-btn[data-tab="${tabId}"]`);
            if (targetBtn) targetBtn.classList.add('active');

            const targetContent = document.getElementById(tabId) ||
                document.getElementById(`tab-${tabId}`) ||
                document.getElementById(`ud-${tabId}`) ||
                document.getElementById(`ud-tab-${tabId}`);

            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.classList.remove('hide-element');
                targetContent.style.display = 'block';
            }
        } catch (error) { console.error("🚨 خطأ في تبديل تبويبات العميل:", error); }
    },

    renderTiers: async function() {
        const cont = document.getElementById('tiers-container');
        if(!cont) return;
        const tiers = Array.isArray(AdminData.data.tiers) ? AdminData.data.tiers : [];
        if(tiers.length === 0) { 
            cont.innerHTML = UsersTemplates.emptyTiers(); 
            return; 
        }

        const tiersStats = AdminData.data.tiersStats || {};
        const localUsers = Array.isArray(AdminData.data.users) ? AdminData.data.users : [];

        // ⚡ 1. رسم فوري في 0ms من الذاكرة لمنع اختفاء المستويات أثناء انتظار الشبكة
        cont.innerHTML = tiers.map(t => {
            const cachedCount = AdminData.data.tierUserCounts?.[t.id];
            const fallbackLocalCount = localUsers.filter(u => u && !u.isDeleted && String(u.tierId) === String(t.id)).length;
            const userCount = cachedCount !== undefined ? cachedCount : fallbackLocalCount;
            const tStats = tiersStats[String(t.id)] || { profit: 0, revenue: 0 };
            return UsersTemplates.tierCard(t, userCount, tStats);
        }).join('');

        // ☁️ 2. جلب العدد الحقيقي لعملاء كل مستوى من السيرفر في الخلفية وتحديث الرقم فوراً
        if (!AdminData.data.tierUserCounts) {
            AdminData.data.tierUserCounts = {};
            await Promise.all(tiers.map(async (t) => {
                const agg = await FirebaseAdapter.getAggregatedStats(
                    'telecard_users',
                    [['tierId', '==', String(t.id)]],
                    { total: { type: 'count' } }
                );
                const exactCount = agg?.total ?? 0;
                AdminData.data.tierUserCounts[t.id] = exactCount;
                const countEl = document.querySelector(`#tier-card-${t.id} .count-val`);
                if (countEl) countEl.textContent = Utils.enNum(exactCount);
            }));
        }
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
            
            const tStats = AdminData.data.tiersStats?.[String(tier.id)] || { profit: 0, revenue: 0 };
            const tierInfo = document.querySelector('.tier-info-card .tier-stats');
            if(tierInfo) tierInfo.innerHTML = UsersTemplates.tierInfoStats(tier, tStats);
        }
        tierUsersSection.classList.add('active');
        this.renderTierUsersPage();
    },

    renderTierUsersPage: async function(isLoadMore = false, isCloudSearch = false) {
        const tierId = this.state.currentTierId;
        const container = document.getElementById('tier-users-container');
        if(!container) return;

        // 🛡️ ضمان وجود مربع البحث وحاوية البطاقات دون هدم مربع البحث أثناء الكتابة
        if (!container.querySelector('.tier-search-box-wrapper') || (!isLoadMore && !isCloudSearch)) {
            const searchBoxHtml = (UsersTemplates && typeof UsersTemplates.tierUsersSearchBox === 'function') ? UsersTemplates.tierUsersSearchBox() : '';
            container.innerHTML = `${searchBoxHtml}<div class="tier-users-table" id="tier-users-list-target"></div>`;
        }

        const searchInputObj = container.querySelector('.tier-search-box-wrapper input');
        const term = searchInputObj ? searchInputObj.value.toLowerCase().trim() : '';
        const listTarget = document.getElementById('tier-users-list-target') || container;

        const emptySearchLoader = document.getElementById('tier-users-empty-search');
        if (emptySearchLoader) emptySearchLoader.remove();

        if (!isLoadMore) {
            listTarget.innerHTML = '<div class="text-center mt-20 text-muted w-100" style="grid-column: 1 / -1;"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري جلب عملاء المستوى سحابياً...</div>';
        }

        try {
            const payload = {
                limit: 50,
                lastDocId: isLoadMore ? AdminData.cursors[`tier_${tierId}`] : null,
                sortCategory: 'newest',
                sortDir: 'desc',
                searchQuery: term,
                filterByTier: tierId 
            };

            const res = await FirebaseAdapter.callFunction('adminGetUsersList', payload);
            
            let fetchedUsers = [];
            if (res && res.success && res.data) {
                fetchedUsers = res.data;
                if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                fetchedUsers.forEach(u => {
                    if (u && u.id) AdminData.data.usersMap[String(u.id)] = u;
                });

                if (res.pagination && res.pagination.hasMore) {
                    AdminData.cursors[`tier_${tierId}`] = res.pagination.lastDocId;
                } else {
                    AdminData.cursors[`tier_${tierId}`] = null;
                }
            }

            const existingBtn = document.getElementById('btn-load-more-tier');
            if (existingBtn) existingBtn.remove();

            if(!fetchedUsers.length && !isLoadMore){ 
                listTarget.innerHTML = UsersTemplates.emptyTierUsers(); 
                return; 
            }

            const tier = AdminData.data.tiersMap?.[tierId] || (AdminData.data.tiers || []).find(x => String(x.id) === String(tierId));
            const serverNowMs = Date.now();
            const allTiers = AdminData.data.tiers || [];

            const htmlArray = fetchedUsers.map(u => {
                const prog = window.FinancialEngine?.getTierProgress
                    ? window.FinancialEngine.getTierProgress({ ...u, tierId: tier?.id || tierId }, allTiers, serverNowMs)
                    : null;

                const spent = prog ? prog.spent : Number(u.tierCycleSpent || 0);
                const targetThreshold = prog ? prog.targetThreshold : Number(tier?.threshold || 0);
                const isTopTier = prog ? prog.isMaxTier : false;
                const nextTierName = prog?.nextTier ? (prog.nextTier.nameAr || prog.nextTier.name) : "أعلى مستوى";
                const pct = prog ? Math.round(prog.percent) : 100;
                
                return UsersTemplates.tierUserCard(u, spent, targetThreshold, pct, isTopTier, nextTierName, tier || {});
            });
            
            if (!isLoadMore) {
                listTarget.innerHTML = htmlArray.join('');
            } else {
                listTarget.insertAdjacentHTML('beforeend', htmlArray.join(''));
            }

            if (AdminData.cursors[`tier_${tierId}`]) {
                const loadMoreBtnHtml = `
                    <div class="text-center mt-15 w-100" id="btn-load-more-tier">
                        <button type="button" class="btn btn-ghost interactive-scale" data-action="load-more-tier-users">
                            <i class="fa-solid fa-angle-down me-1"></i> تحميل المزيد
                        </button>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', loadMoreBtnHtml);
            }        
        } catch (e) {
            console.error(e);
            listTarget.innerHTML = '<div class="text-danger p-15"><i class="fa-solid fa-triangle-exclamation"></i> فشل جلب العملاء السحابي.</div>';
        }
    },

    renderKycSystem: function() {
        const target = document.getElementById('kyc-dashboard-target');
        if (!target) return;
        const settings = AdminData.data.settings || {};
        const kycConfig = settings.kycConfig || { mode: 'off', targetedTiers: [] };
        const tiers = AdminData.data.tiers || [];

        const kycUsersMap = new Map();
        (AdminData.data.users || []).forEach(u => { if (u && u.id) kycUsersMap.set(String(u.id), u); });
        (AdminData.data.kycPendingUsers || []).forEach(u => { if (u && u.id) kycUsersMap.set(String(u.id), u); });
        const allKnownUsers = Array.from(kycUsersMap.values());

        const pendingRequests = allKnownUsers.filter(u => u.kycStatus === 'pending');
        const hasAnyKycHistory = allKnownUsers.some(u => u.kycStatus && u.kycStatus !== 'none');

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
