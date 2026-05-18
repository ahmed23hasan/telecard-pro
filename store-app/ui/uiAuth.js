// ============================================================================
// 🪪 وحدة الهوية والأمان (uiAuth.js)
// 🎯 الوظيفة: الملف الشخصي، التوثيق (KYC)، الأمان، والإعدادات
// 🚀 التحديث: تأمين قراءة الـ DOM، إزالة الـ Magic Strings (DRY)، وتحسين الأداء
// ============================================================================

import { Utils } from '../utils.js';                    
import { DataManager, LiveStoreData } from '../dataManager.js'; 

// 🌟 [إصلاح هندسي] تعريف الثوابت لمنع التكرار (DRY) وسهولة التعديل المستقبلي
const DEFAULT_AVATAR_URL = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

export const UIAuth = {

            openProfileInfo: function() {
        if(typeof this.resetUI === 'function') this.resetUI();
        
        // 🌟 مزامنة حية للبيانات
        if(DataManager.syncUser) DataManager.syncUser();
        if(typeof this.updateProfileDisplay === 'function') this.updateProfileDisplay();

        if (!DataManager.user) return;
        const user = DataManager.user;
        const isVerified = (user.kycStatus === 'approved' || user.kycStatus === 'verified'); // 🌟 حالة التوثيق الحقيقية

        // 🌟 [المنطق الجديد] تحديد الاسم: نستخدم الاسم الرسمي الموثق فور توفر الحالة
        const fullName = typeof this._getFullName === 'function' ? this._getFullName(user) : (user.name || 'العميل');
        
        const usernameVal = user.username ? `@${user.username}` : '---';
        const countryTxt = user.countryName || user.country || 'غير محدد';
        const emailTxt = (user.email && user.email.trim()) ? user.email : 'غير محدد';
        const phoneTxt = (user.phone && user.phone.trim()) ? user.phone : 'غير محدد';
        
        // 🌟 التعديل الأول: عرض الـ ID القصير أو اقتطاع جزء من الـ UID
        const idTxt = user.displayId || (user.id ? user.id.substring(0, 6) : '--');

        const displayNameEl = document.getElementById('display-name');
        const editNameEl = document.getElementById('edit-name-input');
        const usernameEl = document.getElementById('profile-info-username');
        const emailEl = document.getElementById('profile-info-email');
        const phoneEl = document.getElementById('profile-info-phone');
        const countryEl = document.getElementById('profile-info-country');
        const baseCurrView = document.getElementById('profile-base-curr-text');
        const idBadge = document.getElementById('profile-client-id');
        const tierView = document.getElementById('profile-info-tier');
        const tierIconBox = document.getElementById('profile-tier-icon-box');
        const sidebarName = document.getElementById('cs-user-name'); 
        
        // 🌟 تحديث الاسم في اللوحة الجانبية لضمان التطابق التام
        if (sidebarName) sidebarName.textContent = fullName;

        // 🌟 التحكم في وضع التعديل (القلم)
        const editBtnToggle = document.getElementById('profile-edit-toggle');
        if (editBtnToggle) {
            // إخفاء زر التعديل نهائياً إذا كان الحساب موثقاً
            editBtnToggle.style.display = isVerified ? 'none' : 'flex';
            const icon = editBtnToggle.querySelector('i'); 
            if (icon) icon.className = 'fa-solid fa-pen'; 
        }
        
        if (displayNameEl && editNameEl) { 
            displayNameEl.textContent = fullName;
            displayNameEl.classList.remove('d-none'); 
            editNameEl.classList.add('d-none'); 
            editNameEl.value = fullName;
        }

        if(usernameEl) usernameEl.textContent = usernameVal;
        if(emailEl) emailEl.textContent = emailTxt;

        // 🌟 تحديث حقل الهاتف مع التفاعل الذي اتفقنا عليه
        if(phoneEl) {
            phoneEl.innerHTML = `<span dir="ltr">${phoneTxt}</span>`;
            const phoneCard = phoneEl.closest('.info-card-item');
            if (phoneCard && !phoneCard._boundPhoneClick) {
                phoneCard.style.cursor = 'pointer';
                phoneCard.onclick = () => {
                    if(typeof this.showToast === 'function') {
                        this.showToast('هذا الرقم مرتبط بحسابك الأساسي. لتغييره يرجى التواصل مع الدعم الفني.', 'info');
                    }
                };
                phoneCard._boundPhoneClick = true;
            }
        }
        
        if(countryEl) countryEl.textContent = countryTxt;
        if(idBadge) idBadge.textContent = idTxt;
        if(baseCurrView) { const base = (user.baseCurrency || user.base_currency || 'USD').toUpperCase(); baseCurrView.textContent = base; }
        
        // 🌟 التعديل الثاني: التحقق الصارم من المستوى (لا يوجد افتراضي، إما مستوى حقيقي أو ---)
        const userTierId = user.tierId || user.tier;
        const currentTier = (LiveStoreData.tiers || []).find(t => String(t.id) === String(userTierId));

        if (tierView) {
            const tierName = currentTier ? (currentTier.nameAr || currentTier.name) : '---';
            const tierColor = currentTier ? (currentTier.color || '#FFD700') : '#9ca3af'; // رمادي إذا لم يوجد مستوى
            let iconClass = currentTier ? (currentTier.icon || 'fa-solid fa-medal') : 'fa-solid fa-circle-exclamation';
            if (!iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) iconClass = 'fa-solid ' + iconClass;

            tierView.innerHTML = `<div class="tier-view-wrapper"><span>${Utils.safeText(tierName)}</span><i class="${Utils.safeText(iconClass.trim())}" style="color: ${tierColor};"></i></div>`;
            if (tierIconBox) { tierIconBox.style.color = tierColor; }
        }

        const currentAvatar = user.img || DEFAULT_AVATAR_URL;
        const imgEl = document.getElementById('profile-img');
        const sidebarAvatar = document.getElementById('cs-avatar');
        const cameraBtn = document.getElementById('avatar-menu-trigger');
        const fileInput = document.getElementById('avatar-upload-input');
        
        if(imgEl) imgEl.src = currentAvatar;
        if(sidebarAvatar) sidebarAvatar.src = currentAvatar;
        
        const handleAvatarClick = (e) => {
            e.stopPropagation();
            if (DataManager.user && DataManager.user.img && DataManager.user.img !== DEFAULT_AVATAR_URL) {
                this.toggleAvatarMenu(e);
            } else {
                if(fileInput) fileInput.click();
            }
        };

        if(imgEl && !imgEl._boundClick) { 
            imgEl.addEventListener('click', handleAvatarClick); 
            imgEl.style.cursor = 'pointer'; 
            imgEl._boundClick = true; 
        }
        
        if(cameraBtn && !cameraBtn._boundClick) {
            cameraBtn.addEventListener('click', handleAvatarClick);
            cameraBtn._boundClick = true;
        }

        if(fileInput && !fileInput._boundChange) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if(file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        const url = evt.target.result;
                        if(imgEl) imgEl.src = url; 
                        if(sidebarAvatar) sidebarAvatar.src = url; 
                        if (DataManager.updateUserProfile) DataManager.updateUserProfile({ img: url });
                    };
                    reader.readAsDataURL(file);
                }
            });
            fileInput._boundChange = true;
        }

        // حماية إضافية لحدث النقر (يعمل فقط إذا كان الزر ظاهراً)
        if(editBtnToggle && !editBtnToggle._boundClick) {
            editBtnToggle.addEventListener('click', (e) => {
             if (DataManager.user.kycStatus === 'approved' || DataManager.user.kycStatus === 'verified') return; // حماية برمجية حقيقية

                e.stopPropagation(); 
                const icon = editBtnToggle.querySelector('i');
                const isEditing = !editNameEl.classList.contains('d-none');

                if(isEditing) {
                    const newName = editNameEl.value.trim();
                    if(newName) {
                        const parts = newName.split(' ');
                        const fName = parts.shift() || 'العميل'; 
                        const lName = parts.join(' ').trim();
                        if (DataManager.updateUserProfile) DataManager.updateUserProfile({ name: fName, lastName: lName });
                    }
                    displayNameEl.classList.remove('d-none'); editNameEl.classList.add('d-none');
                    if(icon) icon.className = 'fa-solid fa-pen'; 
                    if(typeof this.showToast === 'function') this.showToast('تم حفظ الاسم بنجاح', 'success');
                    this.updateProfileDisplay();
                } else {
                    displayNameEl.classList.add('d-none'); editNameEl.classList.remove('d-none');
                    editNameEl.focus();
                    if(icon) icon.className = 'fa-solid fa-check'; 
                }
            });
            editBtnToggle._boundClick = true;
        }
        
        if(typeof this.openModal === 'function') this.openModal('profile-info');
    },
    closeProfileInfo: function() { if(typeof this.closeModal === 'function') this.closeModal('profile-info'); },

    toggleAvatarMenu: function(event) {
        if (event) event.stopPropagation(); 
        const menu = document.getElementById('avatar-action-menu');
        if (!menu) return;
        
        menu.classList.toggle('active');
        if (typeof this.sfx === 'function') this.sfx('nav');

        if (menu.classList.contains('active')) {
            const closeMenu = (e) => {
                if (!menu.contains(e.target) && !e.target.closest('#avatar-menu-trigger') && !e.target.closest('#profile-img')) {
                    menu.classList.remove('active');
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }
    },

                updateProfileDisplay: function() {
        try {
            // 1. جلب العناصر من الواجهة
            const guestCard = document.getElementById('guest-sidebar-card');
            const userCard = document.getElementById('user-sidebar-card');
            const navDeposit = document.getElementById('nav-item-deposit');
            const navPayments = document.getElementById('nav-item-payments');
            const navOrders = document.getElementById('nav-item-orders');
            const navNotif = document.getElementById('nav-item-notif');
            const logoutBtn = document.getElementById('sidebar-logout-btn');
            
            // 🌟 جلب صناديق التنبيهات
            const alertCard = document.getElementById('sb-profile-alert');
            const kycContainer = document.getElementById('sidebar-kyc-container');

            // 🌟 2. حالة الضيف (Guest State)
            if (!DataManager || !DataManager.user) {
                if (guestCard) guestCard.style.display = 'block';
                if (userCard) userCard.style.display = 'none';
                if (navDeposit) navDeposit.style.display = 'none';
                if (navPayments) navPayments.style.display = 'none';
                if (navOrders) navOrders.style.display = 'none';
                if (navNotif) navNotif.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'none';
                
                // 🛑 الإصلاح الجذري: إخفاء تنبيهات إكمال البيانات والتوثيق تماماً للضيف
                if (alertCard) alertCard.style.display = 'none';
                if (kycContainer) kycContainer.style.display = 'none';
                
                // إيقاف التنفيذ هنا لأن الزائر ضيف ولا يمتلك بيانات لطباعتها
                return; 
            }

            // 🌟 3. حالة المستخدم المسجل (Auth State)
            if (guestCard) guestCard.style.display = 'none';
            if (userCard) userCard.style.display = 'block';
            if (navDeposit) navDeposit.style.display = 'flex';
            if (navPayments) navPayments.style.display = 'flex';
            if (navOrders) navOrders.style.display = 'flex';
            if (navNotif) navNotif.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'flex';

            // 4. طباعة بيانات المستخدم 
            const user = DataManager.user;
            const fullName = typeof this._getFullName === 'function' ? this._getFullName(user) : user.name;
            
            const nameEl = document.getElementById('cs-name'); 
            const displayNameEl = document.getElementById('display-name'); 

            if(nameEl) nameEl.textContent = fullName;
            if(displayNameEl) displayNameEl.textContent = fullName;

            // إظهار تنبيه إكمال الحساب للمستخدم المسجل فقط إذا لم يكمل بياناته
            if (alertCard) {
                alertCard.style.display = user.isVerified ? 'none' : 'flex';
            }

            const sidebarAvatar = document.getElementById('cs-avatar');
            if(sidebarAvatar) {
                sidebarAvatar.src = user.img || DEFAULT_AVATAR_URL;
            }
            
            // تحديث الرقم ليكون الرقم القصير (Display ID)
            const idEl = document.getElementById('cs-id'); 
            if(idEl) idEl.textContent = user.displayId || (user.id ? user.id.substring(0, 6) : '---');
            
            this.updateSidebarTier();
            
            // تحديث حالة التوثيق KYC
            if(typeof this.renderKycUI === 'function') this.renderKycUI();
            if(typeof this.checkKycCelebration === 'function') this.checkKycCelebration();
            
        } catch(e) { console.error('Error updating profile display:', e); }
    },
    deleteProfileImage: function() {
        if(!DataManager.user) return;
        const imgEl = document.getElementById('profile-img');
        const sidebarAvatar = document.getElementById('cs-avatar');
        
        if(imgEl) imgEl.src = DEFAULT_AVATAR_URL; 
        if(sidebarAvatar) sidebarAvatar.src = DEFAULT_AVATAR_URL; 
        
        const deleteBtn = document.getElementById('inline-delete-avatar-btn');
        if(deleteBtn) deleteBtn.classList.remove('active');
        
        const menu = document.getElementById('avatar-action-menu');
        if (menu) menu.classList.remove('active');
        
        try {
            // 🌟 التحديث عبر البوابة الشرعية الموحدة
            if (DataManager.updateUserProfile) {
                DataManager.updateUserProfile({ img: null });
            }
            localStorage.removeItem('telecard_user_image_' + DataManager.user.id);
            if(typeof this.showToast === 'function') this.showToast('تم حذف الصورة الشخصية', 'success'); 
            if(typeof this.sfx === 'function') this.sfx('success'); 
        } catch(e) { 
            if(typeof this.showToast === 'function') this.showToast('تعذر حذف الصورة', 'error'); 
        }
    },

        updateSidebarTier: async function() {
        if (!DataManager.user) return; 
        
        const userTierId = DataManager.user.tierId || DataManager.user.tier;
        const currentTier = (LiveStoreData.tiers || []).find(t => String(t.id) === String(userTierId));
        const tierBtn = document.getElementById('sidebar-rank-btn');
        
        if (tierBtn) {
            let iconClass = currentTier ? (currentTier.icon || 'fa-solid fa-medal') : 'fa-solid fa-circle-exclamation'; 
            if (!iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) {
                iconClass = 'fa-solid ' + iconClass;
            }
            const tierName = currentTier ? (currentTier.nameAr || currentTier.name) : '---';
            const tierColor = currentTier ? (currentTier.color || '#FFD700') : '#9ca3af'; 
            
            tierBtn.innerHTML = `<i class="${Utils.safeText(iconClass.trim())}"></i> ${Utils.safeText(tierName)}`;
            tierBtn.style.setProperty('--tier-color', tierColor);
            if(typeof this.hexToRgb === 'function') tierBtn.style.setProperty('--tier-rgb', this.hexToRgb(tierColor));
        }
    },

    loadUserImageAutomatically: function() {
        if(!DataManager.user) return; 
        const sidebarAvatar = document.getElementById('cs-avatar');
        if(!sidebarAvatar) return;
        sidebarAvatar.classList.add('loading');
        const savedImage = localStorage.getItem('telecard_user_image_' + DataManager.user.id);
        
        if(savedImage) { this.applyUserImage(savedImage); } 
        else if(DataManager.user.img) { this.loadUserImageWithFallback(DataManager.user.img); } 
        else { this.loadUserImageWithFallback(DEFAULT_AVATAR_URL); }
    },
    
    loadUserImageWithFallback: function(imageUrl) {
        if (!DataManager.user) return;
        const tempImg = new Image();
        tempImg.onload = () => { this.applyUserImage(imageUrl); localStorage.setItem('telecard_user_image_' + DataManager.user.id, imageUrl); };
        tempImg.onerror = () => { this.applyUserImage(DEFAULT_AVATAR_URL); localStorage.setItem('telecard_user_image_' + DataManager.user.id, DEFAULT_AVATAR_URL); };
        tempImg.src = imageUrl;
    },

    applyUserImage: function(imageUrl) {
        const sidebarAvatar = document.getElementById('cs-avatar');
        if(!sidebarAvatar) return;
        sidebarAvatar.src = imageUrl;
        setTimeout(() => { sidebarAvatar.classList.remove('loading'); }, 300);
    },

    openSettings: function() { if(typeof this.resetUI === 'function') this.resetUI(); this.renderSettingsUI(); if(typeof this.openModal === 'function') this.openModal('settings'); },
    closeSettings: function() { if(typeof this.closeModal === 'function') this.closeModal('settings'); },

    renderSettingsUI: function() {
        const prefs = DataManager.prefs || {}; 
        const soundOn = prefs.sound !== false;
        const soundBtn = document.getElementById('setting-sound-toggle'), soundLabel = document.getElementById('setting-sound-label');
        if(soundBtn) soundBtn.classList.toggle('on', soundOn); if(soundLabel) soundLabel.textContent = soundOn ? 'مفعل' : 'مغلق';

        const mode = prefs.theme === 'light' || document.body.classList.contains('light-mode') ? 'light' : 'dark';
        const themeBtn = document.getElementById('setting-theme-toggle'), themeLabel = document.getElementById('setting-theme-label');
        if(themeBtn) themeBtn.classList.toggle('on', mode === 'light'); if(themeLabel) themeLabel.textContent = mode === 'light' ? 'نهاري' : 'ليلي';
    },

    toggleThemePref: function() {
        const newMode = document.body.classList.contains('light-mode') ? 'dark' : 'light';
        if(typeof this.setThemePref === 'function') this.setThemePref(newMode);
        if(typeof this.sfx === 'function') this.sfx('nav');
    },

    setThemePref: function(mode) {
        const body = document.body; const isLight = mode === 'light';
        body.classList.toggle('light-mode', isLight);
        localStorage.setItem('telecard_theme', isLight ? 'light' : 'dark');
        if(DataManager.prefs) { DataManager.prefs.theme = isLight ? 'light' : 'dark'; if(DataManager.savePrefs) DataManager.savePrefs(); }
        const icon = document.getElementById('theme-toggle-icon'); if(icon) icon.className = isLight ? 'fa-solid fa-moon' : 'sun-dots-icon';
        this.renderSettingsUI();
    },

    initTheme: function() {
        const saved = (DataManager.prefs && DataManager.prefs.theme) ? DataManager.prefs.theme : (localStorage.getItem('telecard_theme') || 'dark');
        this.setThemePref(saved === 'light' ? 'light' : 'dark');
    },

    toggleSoundPref: function() {
        if (DataManager.prefs) { DataManager.prefs.sound = !DataManager.prefs.sound; if (DataManager.savePrefs) DataManager.savePrefs(); }
        this.renderSettingsUI(); if(typeof this.sfx === 'function') this.sfx('nav');
    },

    toggleSecurityPref: function() { if(typeof this.showToast === 'function') this.showToast('قريباً: سيتم تفعيل هذه الميزة في التحديث القادم', 'info'); },

    openPasswordDialog: function() {
        if(typeof this.resetUI === 'function') this.resetUI();
        const hint = document.getElementById('profile-password-hint');
        if(hint) { hint.textContent = ''; hint.classList.remove('error','success'); }
        ['pass-current','pass-new','pass-confirm'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
        if(typeof this.openModal === 'function') this.openModal('pass-change'); 
    },

    closePasswordDialog: function() { if(typeof this.closeModal === 'function') this.closeModal('pass-change'); },

    handlePasswordSubmit: function() {
        const hint = document.getElementById('profile-password-hint');
        const currentInput = document.getElementById('pass-current');
        const newInput = document.getElementById('pass-new');
        const confirmInput = document.getElementById('pass-confirm');
        
        if(hint) { hint.textContent = ''; hint.classList.remove('error','success'); }

        const currentVal = (currentInput?.value || '').trim();
        const newVal = (newInput?.value || '').trim();
        const confirmVal = (confirmInput?.value || '').trim();

        if(!DataManager || typeof DataManager.submitPasswordChange !== 'function') return;

        const result = DataManager.submitPasswordChange(currentVal, newVal, confirmVal);

        if (result.success) {
            if(hint) { hint.textContent = result.msg; hint.classList.add('success'); }
            this.closePasswordDialog();
            if(typeof this.showToast === 'function') this.showToast(result.msg, 'success');
        } else {
            if(hint) { hint.textContent = result.msg; hint.classList.add('error'); }
            if(typeof this.showToast === 'function') this.showToast(result.msg, 'error');
        }
    },

    filterCountries: function(query) {
        const items = document.querySelectorAll('#countries-list-target .dropdown-item');
        const term = query.toLowerCase();
        items.forEach(item => {
            const name = item.querySelector('.country-name') ? item.querySelector('.country-name').innerText.toLowerCase() : item.innerText.toLowerCase();
            item.style.display = name.includes(term) ? 'flex' : 'none';
        });
    },    

    selectCountry: function(name, prefix, phoneLen) {
        const textEl = document.getElementById('selected-country-text');
        const hiddenInput = document.getElementById('reg-country');
        const prefixEl = document.getElementById('phone-prefix');
        const phoneInp = document.getElementById('reg-phone'); 
        const dropdown = document.getElementById('country-dropdown');

        if (textEl) textEl.innerText = name;
        if (hiddenInput) hiddenInput.value = name;
        if (prefixEl) prefixEl.innerHTML = `<span class="num-en">${prefix}</span>`;
        if (phoneInp) { phoneInp.value = ''; phoneInp.maxLength = phoneLen || 10; phoneInp.placeholder = `أدخل رقم هاتفك`; }
        if (dropdown) dropdown.classList.remove('open');
        if(typeof this.sfx === 'function') this.sfx('nav');
    },

    saveIdentityData: function() {
        const countryEl = document.getElementById('selected-country-text');
        const phoneEl = document.getElementById('reg-phone');
        
        const country = countryEl ? countryEl.innerText : '';
        const phone = phoneEl ? phoneEl.value : '';

        if (!country || country === 'اختر الدولة...' || !phone || phone.trim() === '') {
            if(typeof this.showToast === 'function') this.showToast('يرجى تعبئة جميع الحقول', 'error'); return;
        }

        // 🌟 التحديث عبر البوابة الشرعية الموحدة
        if (DataManager.updateUserProfile) {
            DataManager.updateUserProfile({
                country: country,
                phone: phone,
                isVerified: true
            });
        }

        if(typeof this.updateProfileDisplay === 'function') this.updateProfileDisplay();

        const inputsWrap = document.getElementById('identity-inputs-wrap');
        const statusWrap = document.getElementById('identity-verified-status');
        
        if (inputsWrap) inputsWrap.style.display = 'none';
        if (statusWrap) statusWrap.classList.remove('hide-element');
        if(typeof this.sfx === 'function') this.sfx('success');
    },

    renderKycUI: function() {
        if (!DataManager.user) return;
        const user = DataManager.user;
        const status = user.kycStatus || 'none';
        
        const isKycApproved = (status === 'approved' || status === 'verified');
        
        const userNames = document.querySelectorAll('.user-display-name, .sb-name, #display-name, #cs-name');
        userNames.forEach(el => {
            const oldBadge = el.querySelector('.pro-verified-badge');
            if (oldBadge) oldBadge.remove();
            if (isKycApproved) {
                el.insertAdjacentHTML('beforeend', `<span class="pro-verified-badge" title="حساب موثق"><i class="fa-solid fa-certificate badge-star"></i><i class="fa-solid fa-check badge-check"></i></span>`);
            }
        });
        
        const kycContainer = document.getElementById('sidebar-kyc-container');
        if (!kycContainer) return;

        const settings = LiveStoreData.settings || {};
        const kycConfig = settings.kycConfig || { mode: 'off', targetedTiers: [] };
        
        let isRequiredBySystem = false;
        if (kycConfig.mode === 'all') {
            isRequiredBySystem = true;
        } else if (kycConfig.mode === 'specific' || kycConfig.mode === 'spec') {
            const targets = kycConfig.targetedTiers || [];
            if (targets.map(id => String(id)).includes(String(user.tierId))) {
                isRequiredBySystem = true;
            }
        }

        if (isKycApproved || !isRequiredBySystem) {
            kycContainer.innerHTML = '';
            return;
        }

        if (status === 'pending') {
            kycContainer.innerHTML = `
                <div class="sb-kyc-banner kyc-pending" onclick="ClientSystem.openKycStatusModal('pending')">
                    <span><i class="fa-solid fa-hourglass-half"></i> هويتك قيد المراجعة</span>
                    <i class="fa-solid fa-chevron-left"></i>
                </div>`;
        } else {
            kycContainer.innerHTML = `
                <div class="sb-kyc-banner kyc-required" onclick="ClientSystem.closeSidebar(); ClientSystem.openModal('kyc-upload')">
                    <span><i class="fa-solid fa-shield-halved"></i> التحقق من الهوية (KYC)</span>
                    <i class="fa-solid fa-chevron-left"></i>
                </div>`;
        }
    },
    
    prepareKycModalState: function() {
        const user = DataManager.user;
        const alertBox = document.getElementById('kyc-rejection-alert');
        const reasonText = document.getElementById('kyc-rejection-reason');
        
        if (!alertBox || !reasonText || !user) return;

        if (user.kycStatus === 'rejected') {
            reasonText.textContent = user.kycNote || 'يرجى إعادة رفع الصور بشكل أوضح والتأكد من مطابقة البيانات.';
            alertBox.classList.remove('d-none');
        } else {
            alertBox.classList.add('d-none');
        }
    },

    closeKycModal: function() { if(typeof this.closeModal === 'function') this.closeModal('kyc-upload'); },
    
    openKycStatusModal: function(state) {
        if(typeof this.closeSidebar === 'function') this.closeSidebar();
        const content = document.getElementById('kyc-status-content');
        if(!content) return;
        
        if (state === 'approved' || state === 'verified') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-shield-halved kyc-status-icon verified"></i><h3 class="fw-bold text-main mb-10">حسابك موثق ومحمي</h3><p class="text-muted fs-13 line-height-lg">شكراً لثقتك بنا. بياناتك محفوظة بأعلى معايير التشفير. يمكنك الآن الإيداع والشراء بكامل الصلاحيات.</p></div>`;
        } else if (state === 'pending') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-hourglass-half kyc-status-icon pending"></i><h3 class="fw-bold text-main mb-10">جاري مراجعة البيانات</h3><p class="text-muted fs-13 line-height-lg">طلبك الآن على طاولة الإدارة للمراجعة. قد يستغرق الأمر بعض الوقت، سيتم إشعارك فور الانتهاء.</p></div>`;
        }
        if(typeof this.openModal === 'function') this.openModal('kyc-status');
    },
                checkKycCelebration: function() {
        const user = DataManager.user;
        if (!user) return;

        // 🌟 الإصلاح الجذري: استخدام حالة KYC الحقيقية كبوصلة للقرار
        const isKycApproved = (user.kycStatus === 'approved' || user.kycStatus === 'verified');
        const celebrationKey = `kyc_celebrated_${user.id}`;

        // الذكاء العكسي: إذا لم يكن الحساب موثقاً بالهوية، نحذف الذاكرة
        if (!isKycApproved) {
            localStorage.removeItem(celebrationKey);
            return;
        }

        if (localStorage.getItem(celebrationKey)) return;

        localStorage.setItem(celebrationKey, 'true');

        setTimeout(() => {
            if(typeof this.openModal === 'function') this.openModal('kyc-celebration');
            if(typeof this.sfx === 'function') this.sfx('success'); 
        }, 1500);
    },
    closeKycStatusModal: function() { if(typeof this.closeModal === 'function') this.closeModal('kyc-status'); },

    // =========================================================
    // 📸 معالجة وعرض صور توثيق الهوية (KYC Image Handler)
    // =========================================================
    handleKycImage: function(input, previewId) {
        const file = input.files && input.files[0];
        const parentBox = input.closest('.kyc-upload-box');
        const previewImg = document.getElementById(previewId);

        if (!file) {
            if (previewImg) previewImg.src = '';
            if (parentBox) parentBox.classList.remove('has-img');
            return;
        }

        if (!file.type.startsWith('image/')) {
            if (typeof this.showToast === 'function') this.showToast('عذراً، يجب إرفاق ملف صورة (JPG, PNG)', 'error');
            if (typeof this.sfx === 'function') this.sfx('error');
            
            input.value = ''; 
            if (previewImg) previewImg.src = '';
            if (parentBox) parentBox.classList.remove('has-img');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImg) previewImg.src = e.target.result;
            if (parentBox) parentBox.classList.add('has-img'); 
        };
        
        reader.readAsDataURL(file);
    },

            submitKycData: async function() {
        const fullName = document.getElementById('kyc-full-name')?.value?.trim() || '';
        const idNumber = document.getElementById('kyc-id-number')?.value?.trim() || '';
        const frontImg = document.getElementById('kyc-prev-front')?.src || '';
        const backImg = document.getElementById('kyc-prev-back')?.src || '';
        const selfieImg = document.getElementById('kyc-prev-selfie')?.src || '';
        
        const hasValidImg = (src) => src && src.startsWith('data:image');
        
        if (!fullName || !idNumber || !hasValidImg(frontImg) || !hasValidImg(backImg) || !hasValidImg(selfieImg)) {
            if (typeof this.showToast === 'function') this.showToast('يرجى تعبئة الاسم ورقم الهوية وإرفاق الصور الثلاث بوضوح', 'error');
            if (typeof this.sfx === 'function') this.sfx('error');
            return;
        }
        
        // تشغيل اللودر
        if (typeof this.toggleLoader === 'function') this.toggleLoader(true, 'جاري تشفير وإرسال البيانات...');
        
        try {
            if (DataManager.updateUserProfile) {
                // 🌟 حيلة احترافية: Promise.resolve تجبر النظام على التعامل مع الدالة كـ Async
                // سواء كانت مربوطة بـ Firebase أو مجرد دالة محلية حالياً!
                await Promise.resolve(DataManager.updateUserProfile({
                    fullName: fullName,
                    kycStatus: 'pending',
                    kycData: {
                        idNumber: idNumber,
                        frontImg: frontImg,
                        backImg: backImg,
                        selfieImg: selfieImg,
                        submittedAt: Date.now()
                    }
                }));
            }
            
            this.closeKycModal();
            if (typeof this.showToast === 'function') this.showToast('تم رفع بياناتك بنجاح، يرجى انتظار المراجعة', 'success');
            if (typeof this.sfx === 'function') this.sfx('success');
            this.renderKycUI();
            
        } catch (e) {
            console.error('KYC Upload Error:', e);
            if (typeof this.showToast === 'function') this.showToast('حدث خطأ أثناء الإرسال، حاول مجدداً', 'error');
        } finally {
            // 🌟 الحماية المطلقة (Bulletproof): 
            // كتلة finally تُنفذ دائماً في النهاية، سواء نجح الرفع أو فشل، مما يضمن إغلاق اللودر وعدم تعليق الشاشة إطلاقاً!
            if (typeof this.toggleLoader === 'function') this.toggleLoader(false);
        }
        },    openTierInfoModal: async function() {
        if(typeof this.resetUI === 'function') this.resetUI();
        if(typeof this.closeSidebar === 'function') this.closeSidebar();

        // 🌟 استدعاء المنطق النقي من الـ DataManager بدلاً من حسابه هنا
        if(!DataManager || typeof DataManager.getTierProgress !== 'function') return;
        
        const tierData = DataManager.getTierProgress();
        if (!tierData) return;

        const { currentTier, targetNameDisplay, targetThreshold, spent, remainingAmt, percent, remainingDays, isGoalReached, isAutoAdvanceEnabled } = tierData;

        const content = document.getElementById('tier-info-content');
        if (!content) return;

        const settings = LiveStoreData.settings || {};
        const pausedMsg = settings.tierPausedMsg || 'نظام الترقية التلقائية متوقف حالياً، يرجى التواصل مع الإدارة.';
        
        let rawIcon = currentTier.icon || 'medal';
        let cleanIcon = rawIcon.replace(/fa-solid|fa-regular|fa-brands|fa-/g, '').trim();
        let finalIconClass = `fa-solid fa-${cleanIcon}`;
        
        const tierColor = currentTier.color || 'var(--primary)';

        let html = `
            <div class="tm-wrapper">
                <div class="tm-icon-box" style="color: ${tierColor};">
                    <i class="${finalIconClass} tm-icon"></i>
                </div>
                <h3 class="tm-title">${Utils.escapeHtml(currentTier.name)}</h3>
                <p class="tm-desc">مستواك الحالي هو <span class="tm-text-highlight" style="color: ${tierColor};">${Utils.escapeHtml(currentTier.name)}</span>. للارتقاء بتجربتك والحصول على مزايا وأسعار أفضل، قم بزيادة مبيعاتك خلال المدة المحددة.</p>
        `;

        if (isAutoAdvanceEnabled) {
            if (isGoalReached) {
                html += `
                    <div class="tm-top-tier-card" style="border-top-color: ${tierColor};">
                        <div class="tm-top-icon" style="color: ${tierColor};">
                            <i class="${finalIconClass}"></i>
                        </div>
                        <div class="tm-top-title" style="color: ${tierColor};">تهانينا، أنت في القمة!</div>
                        <div class="tm-top-desc">
                            لقد حققت الهدف وتصل الآن لأعلى مستوى متاح في المتجر لتتمتع بأفضل الأسعار. استمر في نشاطك للحفاظ على هذه المكانة الحصرية.
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="tm-progress-card">
                        <div class="tm-progress-header">
                            <span class="tm-percent num-en">${percent.toFixed(0)}%</span>
                            <div class="tm-bar-bg">
                                <div class="tm-bar-fill" style="width: ${percent}%; background: ${tierColor};"></div>
                            </div>
                            <span class="tm-duration-badge num-en">${remainingDays} يوم متبقي</span>
                        </div>
                        
                        <div class="tm-footer-text">
                            يتوجب عليك إنفاق <span class="tm-amount-text num-en" dir="ltr">${remainingAmt.toFixed(2)}$</span> إضافية خلال <span class="tm-text-highlight text-warning">${remainingDays} يوماً</span> للوصول لـ <span class="tm-text-highlight text-main">${Utils.escapeHtml(targetNameDisplay)}</span>.
                        </div>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="tm-alert-box mt-15">
                    <span class="nm-reply-head text-danger tm-text-highlight d-block mb-8"><i class="fa-solid fa-circle-info"></i> تنبيه إداري</span>
                    <div class="nm-reply-body text-main line-height-lg">${Utils.escapeHtml(pausedMsg)}</div>
                </div>
            `;
        }

        html += `</div>`;
        content.innerHTML = html;

        if(typeof this.openModal === 'function') this.openModal('tier-info');
    }
};
