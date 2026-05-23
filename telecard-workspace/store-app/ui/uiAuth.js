// ============================================================================
// 🪪 وحدة الهوية والأمان (uiAuth.js)
// 🎯 الوظيفة: الملف الشخصي، التوثيق (KYC)، الأمان، والإعدادات
// 🚀 التحديث: حل مشكلة فقدان سياق (this) وتطبيق تفويض الأحداث (Event Delegation)
// ============================================================================

import { Utils } from '../utils.js';                    
import { DataManager, LiveStoreData } from '../dataManager.js'; 
import { FirebaseAdapter } from '../core/firebaseAdapter.js';

const DEFAULT_AVATAR_URL = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

// 🌟 دالة مساعدة لجلب النظام المركزي (Orchestrator) وحل مشكلة فقدان السياق (Context Loss)
const getSys = () => window.ClientSystem || {};

export const UIAuth = {

    // 🌟 ذاكرة مؤقتة للاحتفاظ بملفات الـ KYC قبل رفعها
    kycFiles: {},

    openProfileInfo: function() {
        getSys().resetUI?.();
        
        // 🌟 مزامنة حية للبيانات
        if(DataManager.syncUser) DataManager.syncUser();
        this.updateProfileDisplay();

        if (!DataManager.user) return;
        const user = DataManager.user;
        const isVerified = (user.kycStatus === 'approved' || user.kycStatus === 'verified'); 

        // 🌟 [المنطق الجديد] استخدام الدالة المركزية بشكل آمن عبر getSys()
        const fullName = getSys()._getFullName ? getSys()._getFullName(user) : (user.name || 'العميل');
        
        const usernameVal = user.username ? `@${user.username}` : '---';
        const countryTxt = user.countryName || user.country || 'غير محدد';
        const emailTxt = (user.email && user.email.trim()) ? user.email : 'غير محدد';
        const phoneTxt = (user.phone && user.phone.trim()) ? user.phone : 'غير محدد';
        
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
        
        if (sidebarName) sidebarName.textContent = fullName;

        const editBtnToggle = document.getElementById('profile-edit-toggle');
        if (editBtnToggle) {
            editBtnToggle.style.display = isVerified ? 'none' : 'flex';
            const icon = editBtnToggle.querySelector('i'); 
            if (icon) icon.className = 'fa-solid fa-pen'; 
            // 🌟 ربط الزر بتفويض الأحداث بدلاً من المستمع المباشر
            editBtnToggle.setAttribute('data-action', 'toggle-name-edit');
        }
        
        if (displayNameEl && editNameEl) { 
            displayNameEl.textContent = fullName;
            displayNameEl.classList.remove('d-none'); 
            editNameEl.classList.add('d-none'); 
            editNameEl.value = fullName;
        }

        if(usernameEl) usernameEl.textContent = usernameVal;
        if(emailEl) emailEl.textContent = emailTxt;

        if(phoneEl) {
            phoneEl.innerHTML = `<span dir="ltr">${phoneTxt}</span>`;
            const phoneCard = phoneEl.closest('.info-card-item');
            if (phoneCard) {
                // 🌟 التخلص من onclick واستخدام تفويض الأحداث
                phoneCard.style.cursor = 'pointer';
                phoneCard.setAttribute('data-action', 'show-phone-toast');
            }
        }
        
        if(countryEl) countryEl.textContent = countryTxt;
        if(idBadge) idBadge.textContent = idTxt;
        if(baseCurrView) { const base = (user.baseCurrency || user.base_currency || 'USD').toUpperCase(); baseCurrView.textContent = base; }
        
        const currentTier = typeof DataManager.getUserTier === 'function' ? DataManager.getUserTier(user) : null;

        if (tierView) {
            const tierName = currentTier ? (currentTier.nameAr || currentTier.name) : '---';
            const tierColor = currentTier ? (currentTier.color || '#FFD700') : '#9ca3af'; 
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
        
        // 🌟 إعطاء صلاحية تفويض الأحداث لخيارات الصور
        if(imgEl) {
            imgEl.style.cursor = 'pointer';
            imgEl.setAttribute('data-action', 'handle-avatar-click');
        }
        if(cameraBtn) {
            cameraBtn.setAttribute('data-action', 'handle-avatar-click');
        }

        // 🌟 مستمع الـ Change يستثنى من الـ Click Delegation ويبقى مكانه هنا
        if(fileInput && !fileInput._boundChange) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if(file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        const localUrl = evt.target.result;
                        if(imgEl) imgEl.src = localUrl; 
                        if(sidebarAvatar) sidebarAvatar.src = localUrl; 
                    };
                    reader.readAsDataURL(file);

                    getSys().showToast?.('جاري رفع الصورة الشخصية...', 'info');
                    try {
                        const downloadUrl = await FirebaseAdapter.uploadImage(file, `avatars/${DataManager.user.id}`);
                        if (DataManager.updateUserProfile) {
                            await DataManager.updateUserProfile({ img: downloadUrl });
                        }
                        getSys().showToast?.('تم تحديث الصورة الشخصية بنجاح', 'success');
                    } catch (err) {
                        console.error("Avatar Upload Error:", err);
                        getSys().showToast?.('تعذر حفظ الصورة في السحابة', 'error');
                    }
                }
            });
            fileInput._boundChange = true;
        }

        getSys().openModal?.('profile-info');
    },

    // 🌟 دالة مساعدة معالجة نقرة الأفاتار ليتم استدعاؤها عبر المستمع المركزي
    handleAvatarClick: function(e) {
        if(e) e.stopPropagation();
        if (DataManager.user && DataManager.user.img && DataManager.user.img !== DEFAULT_AVATAR_URL) {
            this.toggleAvatarMenu(e);
        } else {
            const fileInput = document.getElementById('avatar-upload-input');
            if(fileInput) fileInput.click();
        }
    },

    // 🌟 دالة مساعدة لتعديل الاسم ليتم استدعاؤها عبر المستمع المركزي
    toggleNameEdit: function() {
        if (!DataManager.user || (DataManager.user.kycStatus === 'approved' || DataManager.user.kycStatus === 'verified')) return;

        const editNameEl = document.getElementById('edit-name-input');
        const displayNameEl = document.getElementById('display-name');
        const editBtnToggle = document.getElementById('profile-edit-toggle');
        const icon = editBtnToggle ? editBtnToggle.querySelector('i') : null;

        if (!editNameEl || !displayNameEl) return;
        
        const isEditing = !editNameEl.classList.contains('d-none');

        if(isEditing) {
            const newName = editNameEl.value.trim();
            if(newName) {
                const parts = newName.split(' ');
                const fName = parts.shift() || 'العميل'; 
                const lName = parts.join(' ').trim();
                if (DataManager.updateUserProfile) DataManager.updateUserProfile({ name: fName, lastName: lName });
            }
            displayNameEl.classList.remove('d-none'); 
            editNameEl.classList.add('d-none');
            if(icon) icon.className = 'fa-solid fa-pen'; 
            getSys().showToast?.('تم حفظ الاسم بنجاح', 'success');
            this.updateProfileDisplay();
        } else {
            displayNameEl.classList.add('d-none'); 
            editNameEl.classList.remove('d-none');
            editNameEl.focus();
            if(icon) icon.className = 'fa-solid fa-check'; 
        }
    },

    closeProfileInfo: function() { getSys().closeModal?.('profile-info'); },

    toggleAvatarMenu: function(event) {
        if (event) event.stopPropagation(); 
        const menu = document.getElementById('avatar-action-menu');
        if (!menu) return;
        
        menu.classList.toggle('active');
        getSys().sfx?.('nav');

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
            const guestCard = document.getElementById('guest-sidebar-card');
            const userCard = document.getElementById('user-sidebar-card');
            const navDeposit = document.getElementById('nav-item-deposit');
            const navPayments = document.getElementById('nav-item-payments');
            const navOrders = document.getElementById('nav-item-orders');
            const navNotif = document.getElementById('nav-item-notif');
            const logoutBtn = document.getElementById('sidebar-logout-btn');
            
            const alertCard = document.getElementById('sb-profile-alert');
            const kycContainer = document.getElementById('sidebar-kyc-container');

            if (!DataManager || !DataManager.user) {
                if (guestCard) guestCard.style.display = 'block';
                if (userCard) userCard.style.display = 'none';
                if (navDeposit) navDeposit.style.display = 'none';
                if (navPayments) navPayments.style.display = 'none';
                if (navOrders) navOrders.style.display = 'none';
                if (navNotif) navNotif.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'none';
                
                if (alertCard) {
                    alertCard.style.setProperty('display', 'none', 'important');
                    alertCard.classList.add('d-none', 'hide-element');
                }
                if (kycContainer) {
                    kycContainer.style.setProperty('display', 'none', 'important');
                    kycContainer.classList.add('d-none', 'hide-element');
                }
                return; 
            }

            if (guestCard) guestCard.style.display = 'none';
            if (userCard) userCard.style.display = 'block';
            if (navDeposit) navDeposit.style.display = 'flex';
            if (navPayments) navPayments.style.display = 'flex';
            if (navOrders) navOrders.style.display = 'flex';
            if (navNotif) navNotif.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'flex';

            const user = DataManager.user;
            const fullName = getSys()._getFullName ? getSys()._getFullName(user) : user.name;
            
            const nameEl = document.getElementById('cs-name'); 
            const displayNameEl = document.getElementById('display-name'); 

            if(nameEl) nameEl.textContent = fullName;
            if(displayNameEl) displayNameEl.textContent = fullName;

            if (alertCard) {
                const hasData = (user.phone && user.phone.trim() !== '') && (user.country && user.country !== '');
                const isIdentityComplete = (user.isVerified === true || String(user.isVerified) === 'true') || hasData;
                
                if (isIdentityComplete) {
                    alertCard.style.setProperty('display', 'none', 'important');
                    alertCard.classList.add('d-none', 'hide-element');
                } else {
                    alertCard.style.removeProperty('display');
                    alertCard.style.display = 'flex';
                    alertCard.classList.remove('d-none', 'hide-element');
                }
            }

            const sidebarAvatar = document.getElementById('cs-avatar');
            if(sidebarAvatar) {
                const defaultImg = typeof DEFAULT_AVATAR_URL !== 'undefined' ? DEFAULT_AVATAR_URL : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
                sidebarAvatar.src = user.img || defaultImg;
            }
            
            const idEl = document.getElementById('cs-id'); 
            if(idEl) idEl.textContent = user.displayId || (user.id ? String(user.id).substring(0, 6) : '---');
            
            this.updateSidebarTier();
            this.renderKycUI();
            this.checkKycCelebration();
            
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
            if (DataManager.updateUserProfile) {
                DataManager.updateUserProfile({ img: null });
            }
            localStorage.removeItem('telecard_user_image_' + DataManager.user.id);
            getSys().showToast?.('تم حذف الصورة الشخصية', 'success'); 
            getSys().sfx?.('success'); 
        } catch(e) { 
            getSys().showToast?.('تعذر حذف الصورة', 'error'); 
        }
    },

    updateSidebarTier: async function() {
        if (!DataManager.user) return; 
        
        const currentTier = typeof DataManager.getUserTier === 'function' ? DataManager.getUserTier(DataManager.user) : null;
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
            if(getSys().hexToRgb) tierBtn.style.setProperty('--tier-rgb', getSys().hexToRgb(tierColor));
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

    openSettings: function() { getSys().resetUI?.(); this.renderSettingsUI(); getSys().openModal?.('settings'); },
    closeSettings: function() { getSys().closeModal?.('settings'); },

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
        this.setThemePref(newMode);
        getSys().sfx?.('nav');
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
        this.renderSettingsUI(); getSys().sfx?.('nav');
    },

    toggleSecurityPref: function() { getSys().showToast?.('قريباً: سيتم تفعيل هذه الميزة في التحديث القادم', 'info'); },

    openPasswordDialog: function() {
        getSys().resetUI?.();
        const hint = document.getElementById('profile-password-hint');
        if(hint) { hint.textContent = ''; hint.classList.remove('error','success'); }
        ['pass-current','pass-new','pass-confirm'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
        getSys().openModal?.('pass-change'); 
    },

    closePasswordDialog: function() { getSys().closeModal?.('pass-change'); },

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
            getSys().showToast?.(result.msg, 'success');
        } else {
            if(hint) { hint.textContent = result.msg; hint.classList.add('error'); }
            getSys().showToast?.(result.msg, 'error');
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
        getSys().sfx?.('nav');
    },

    saveIdentityData: async function() {
        const countryEl = document.getElementById('selected-country-text');
        const phoneEl = document.getElementById('reg-phone');
        const currencyEl = document.getElementById('reg-currency'); 
        
        const country = countryEl ? countryEl.innerText : '';
        const phone = phoneEl ? phoneEl.value : '';
        const currency = currencyEl ? currencyEl.value : ''; 
        
        if (!country || country === 'اختر الدولة...' || !phone || phone.trim() === '' || !currency) {
            getSys().showToast?.('يرجى تعبئة جميع الحقول (الدولة، رقم الهاتف، وعملة المحفظة)', 'error');
            return;
        }
        
        getSys().toggleLoader?.(true, 'جاري الحفظ في قاعدة البيانات...');
        
        let success = false;
        if (DataManager.updateUserProfile) {
            success = await DataManager.updateUserProfile({
                country: country,
                phone: phone,
                currency: currency,
                baseCurrency: currency,
                base_currency: currency,
                isVerified: true
            });
        }
        
        getSys().toggleLoader?.(false);
        
        if (!success) {
            getSys().showToast?.('حدث خطأ في الاتصال بقاعدة البيانات. حاول مجدداً', 'error');
            return;
        }
        
        localStorage.setItem('telecard_display_currency', currency);
        
        this.updateProfileDisplay();
        
        const inputsWrap = document.getElementById('identity-inputs-wrap');
        const statusWrap = document.getElementById('identity-verified-status');
        
        if (inputsWrap) inputsWrap.style.display = 'none';
        if (statusWrap) statusWrap.classList.remove('hide-element');
        getSys().sfx?.('success');

        setTimeout(() => {
            window.location.reload();
        }, 1500);
    },

    loadDynamicCurrenciesForModal: function() {
        const currencySelect = document.getElementById('reg-currency');
        if (!currencySelect) return;

        const rates = window.LiveStoreData?.rates || window.DataManager?.rates || [];
        currencySelect.innerHTML = '<option value="" disabled selected>حدد العملة الدائمة لمحفظتك...</option>';
        if (rates.length === 0) {
            currencySelect.innerHTML += '<option value="USD">دولار أمريكي (USD)</option>';
            return;
        }

        rates.forEach(r => {
            if (r.isActive === false) return; 
            
            const option = document.createElement('option');
            option.value = r.code;
            option.textContent = `${r.name || r.code} (${r.code})`;
            currencySelect.appendChild(option);
        });
    },

    submitKycData: async function() {
    const fullName = document.getElementById('kyc-full-name')?.value?.trim() || '';
    const idNumber = document.getElementById('kyc-id-number')?.value?.trim() || '';
    
    this.kycFiles = this.kycFiles || {};
    const frontFile = this.kycFiles['kyc-prev-front'];
    const backFile = this.kycFiles['kyc-prev-back'];
    const selfieFile = this.kycFiles['kyc-prev-selfie'];
    
    if (!fullName || !idNumber || !frontFile || !backFile || !selfieFile) {
        getSys().showToast?.('يرجى تعبئة الاسم ورقم الهوية وإرفاق الصور الثلاث بوضوح', 'error');
        getSys().sfx?.('error');
        return;
    }
    
    getSys().toggleLoader?.(true, 'جاري الرفع الآمن وتشفير البيانات السحابية...');
    
    try {
        const userId = DataManager.user.id || 'unknown_user';
        
        // استخدام Promise.allSettled بدلاً من Promise.all
        const uploadPromises = [
            FirebaseAdapter.uploadImage(frontFile, `kyc_docs/${userId}_front`),
            FirebaseAdapter.uploadImage(backFile, `kyc_docs/${userId}_back`),
            FirebaseAdapter.uploadImage(selfieFile, `kyc_docs/${userId}_selfie`)
        ];

        const results = await Promise.allSettled(uploadPromises);
        
        const failedUploads = results.filter(r => r.status === 'rejected');
        if (failedUploads.length > 0) {
            // ملاحظة هندسية: هنا يجب استدعاء دالة سحابية لحذف الملفات التي تم رفعها بنجاح لتنظيف Storage
            throw new Error("فشل رفع إحدى الصور، يرجى التأكد من جودة الاتصال.");
        }

        const [frontImgUrl, backImgUrl, selfieImgUrl] = results.map(r => r.value);

        let success = false;
        if (DataManager.updateUserProfile) {
            success = await DataManager.updateUserProfile({
                fullName: fullName,
                kycStatus: 'pending',
                kycData: {
                    idNumber: idNumber,
                    frontImg: frontImgUrl,
                    backImg: backImgUrl,
                    selfieImg: selfieImgUrl,
                    submittedAt: Date.now()
                }
            });
        }
        
        if (!success) throw new Error("Firebase Update Failed");
        
        this.kycFiles = {};

        this.closeKycModal();
        getSys().showToast?.('تم رفع بياناتك بنجاح، يرجى انتظار المراجعة', 'success');
        getSys().sfx?.('success');
        this.renderKycUI();
        
    } catch (e) {
        console.error('KYC Upload Error:', e);
        getSys().showToast?.('فشل إرسال البيانات، يرجى التأكد من اتصالك والمحاولة مجدداً', 'error');
    } finally {
        getSys().toggleLoader?.(false);
    }
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

        // 🌟 تطبيق (Event Delegation) باستخدام data-action بدلاً من onclick
        if (status === 'pending') {
            kycContainer.innerHTML = `
                <div class="sb-kyc-banner kyc-pending" data-action="open-kyc-status" data-state="pending">
                    <span><i class="fa-solid fa-hourglass-half"></i> هويتك قيد المراجعة</span>
                    <i class="fa-solid fa-chevron-left"></i>
                </div>`;
        } else {
            kycContainer.innerHTML = `
                <div class="sb-kyc-banner kyc-required" data-action="open-kyc-upload">
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

    closeKycModal: function() { getSys().closeModal?.('kyc-upload'); },
    
    openKycStatusModal: function(state) {
        getSys().closeSidebar?.();
        const content = document.getElementById('kyc-status-content');
        if(!content) return;
        
        if (state === 'approved' || state === 'verified') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-shield-halved kyc-status-icon verified"></i><h3 class="fw-bold text-main mb-10">حسابك موثق ومحمي</h3><p class="text-muted fs-13 line-height-lg">شكراً لثقتك بنا. بياناتك محفوظة بأعلى معايير التشفير. يمكنك الآن الإيداع والشراء بكامل الصلاحيات.</p></div>`;
        } else if (state === 'pending') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-hourglass-half kyc-status-icon pending"></i><h3 class="fw-bold text-main mb-10">جاري مراجعة البيانات</h3><p class="text-muted fs-13 line-height-lg">طلبك الآن على طاولة الإدارة للمراجعة. قد يستغرق الأمر بعض الوقت، سيتم إشعارك فور الانتهاء.</p></div>`;
        }
        getSys().openModal?.('kyc-status');
    },

    checkKycCelebration: function() {
        const user = DataManager.user;
        if (!user) return;

        const isKycApproved = (user.kycStatus === 'approved' || user.kycStatus === 'verified');
        const celebrationKey = `kyc_celebrated_${user.id}`;

        if (!isKycApproved) {
            localStorage.removeItem(celebrationKey);
            return;
        }

        if (localStorage.getItem(celebrationKey)) return;

        localStorage.setItem(celebrationKey, 'true');

        setTimeout(() => {
            getSys().openModal?.('kyc-celebration');
            getSys().sfx?.('success'); 
        }, 1500);
    },
    closeKycStatusModal: function() { getSys().closeModal?.('kyc-status'); },

    handleKycImage: function(input, previewId) {
        const file = input.files && input.files[0];
        const parentBox = input.closest('.kyc-upload-box');
        const previewImg = document.getElementById(previewId);
        
        this.kycFiles = this.kycFiles || {};

        if (!file) {
            if (previewImg) previewImg.src = '';
            if (parentBox) parentBox.classList.remove('has-img');
            delete this.kycFiles[previewId]; 
            return;
        }

        if (!file.type.startsWith('image/')) {
            getSys().showToast?.('عذراً، يجب إرفاق ملف صورة (JPG, PNG)', 'error');
            getSys().sfx?.('error');
            
            input.value = ''; 
            if (previewImg) previewImg.src = '';
            if (parentBox) parentBox.classList.remove('has-img');
            delete this.kycFiles[previewId];
            return;
        }
        
        this.kycFiles[previewId] = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImg) previewImg.src = e.target.result;
            if (parentBox) parentBox.classList.add('has-img'); 
        };
        
        reader.readAsDataURL(file);
    },

    openTierInfoModal: async function() {
        getSys().resetUI?.();
        getSys().closeSidebar?.();

        if(!DataManager || typeof DataManager.getTierProgress !== 'function') return;
        
        const tierData = DataManager.getTierProgress();
        if (!tierData) return;

        const { currentTier, targetNameDisplay, targetThreshold, spent, remainingAmt, percent, remainingDays, isGoalReached, isAutoAdvanceEnabled, isMaxTier } = tierData;

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
            let targetPhraseHtml = '';
            if (isMaxTier) {
                targetPhraseHtml = `للحفاظ على باقتك ومميزاتك الحالية.`;
            } else {
                targetPhraseHtml = `للوصول لـ <span class="tm-text-highlight text-main">${Utils.escapeHtml(targetNameDisplay)}</span>.`;
            }

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
                            يتوجب عليك إنفاق <span class="tm-amount-text num-en" dir="ltr">${remainingAmt.toFixed(2)}$</span> إضافية خلال <span class="tm-text-highlight text-warning">${remainingDays} يوماً</span> ${targetPhraseHtml}
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

        getSys().openModal?.('tier-info');
    }

};
