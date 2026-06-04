// ============================================================================
// 🪪 وحدة الهوية والأمان (uiAuth.js) - النسخة الاحترافية الكاملة
// 🎯 الوظيفة: الملف الشخصي، التوثيق (KYC)، الأمان، والإعدادات
// 🚀 التحديث: تنظيف التكرار، وتصفية لغة اللودر مع المعايير العالمية الفاخرة
// ============================================================================

import { Utils } from '../utils.js';                    
import { DataManager, LiveStoreData } from '../dataManager.js'; 
import { FirebaseAdapter } from '../core/firebaseAdapter.js';
import { RenderHelpers } from '../core/renderHelpers.js';

const DEFAULT_AVATAR_URL = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

// ✅ دالة آمنة لجلب النظام تمنع انهيار الواجهة إذا لم يكتمل تحميل script.js
const getSys = () => {
    if (window.ClientSystem) return window.ClientSystem;
    if (window.UIManager) return window.UIManager;
    
    console.warn("⚠️ تحذير: تم استدعاء النظام قبل اكتمال الإقلاع.");
    return new Proxy({}, { get: () => () => {} }); 
};

export const UIAuth = {

    // 🌟 ذاكرة مؤقتة للاحتفاظ بملفات الـ KYC قبل رفعها
    kycFiles: {},

    openProfileInfo: function() {
        getSys().resetUI?.();
        
        if(DataManager.syncUser) DataManager.syncUser();
        this.updateProfileDisplay();

        if (!DataManager.user) return;
        const user = DataManager.user;
        const isVerified = (user.kycStatus === 'approved' || user.kycStatus === 'verified'); 

        const fullName = getSys()._getFullName ? getSys()._getFullName(user) : (user.name || 'العميل');
        
        const usernameVal = user.username ? `${user.username}` : '---';
        const countryTxt = user.countryName || user.country || 'غير محدد';
        const emailTxt = (user.email && user.email.trim()) ? user.email : 'غير محدد';
        const phoneTxt = (user.phone && user.phone.trim()) ? user.phone : 'غير محدد';
        
        const idTxt = RenderHelpers.formatUserId(user);

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
            editBtnToggle.setAttribute('data-action', 'toggle-name-edit');
        }
        
        if (displayNameEl && editNameEl) { 
            displayNameEl.textContent = fullName;
            displayNameEl.classList.remove('d-none'); 
            editNameEl.classList.add('d-none'); 
            editNameEl.value = fullName;
        }

        if(usernameEl) {
            usernameEl.textContent = `@${usernameVal}`;
            usernameEl.setAttribute('data-action', 'copy-text');
            usernameEl.setAttribute('data-text', usernameVal);
            usernameEl.style.cursor = 'pointer';
        }
        
        if(emailEl) {
            emailEl.textContent = emailTxt;
            emailEl.setAttribute('data-action', 'copy-text');
            emailEl.setAttribute('data-text', emailTxt);
            emailEl.style.cursor = 'pointer';
        }

        if(phoneEl) {
            phoneEl.innerHTML = `<span dir="ltr">${phoneTxt}</span>`;
            const phoneCard = phoneEl.closest('.info-card-item');
            if (phoneCard) {
                phoneCard.style.cursor = 'pointer';
                phoneCard.setAttribute('data-action', 'show-phone-toast');
            }
        }
        
        if(countryEl) countryEl.textContent = countryTxt;
        
        if(idBadge) {
            idBadge.textContent = idTxt;
            const idWrap = idBadge.closest('.uid-capsule');
            if (idWrap) {
                idWrap.setAttribute('data-action', 'copy-text');
                idWrap.setAttribute('data-text', idTxt);
                idWrap.style.cursor = 'pointer';
            }
        }
        
        if(baseCurrView) { const base = (user.baseCurrency || user.base_currency || 'USD').toUpperCase(); baseCurrView.textContent = base; }
        
        const currentTier = typeof DataManager.getUserTier === 'function' ? DataManager.getUserTier(user) : null;

        if (tierView) {
            const tierName = currentTier ? (currentTier.nameAr || currentTier.name) : '---';
            const tierColor = currentTier ? (currentTier.color || '#FFD700') : '#9ca3af'; 
            let iconClass = currentTier ? (currentTier.icon || 'fa-solid fa-medal') : 'fa-solid fa-circle-exclamation';
            if (!iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) iconClass = 'fa-solid ' + iconClass;

            tierView.innerHTML = `<div class="tier-view-wrapper"><span>${Utils.safeText(tierName)}</span><i class="${Utils.safeText(iconClass.trim())}" style="color: ${tierColor}; margin-inline-start: 8px;"></i></div>`;
            if (tierIconBox) { tierIconBox.style.color = tierColor; }
        }

        const currentAvatar = user.img || DEFAULT_AVATAR_URL;
        const imgEl = document.getElementById('profile-img');
        const sidebarAvatar = document.getElementById('cs-avatar');
        const cameraBtn = document.getElementById('avatar-menu-trigger');
        const fileInput = document.getElementById('avatar-upload-input');
        
        if(imgEl) imgEl.src = currentAvatar;
        if(sidebarAvatar) sidebarAvatar.src = currentAvatar;
        
        if(imgEl) {
            imgEl.style.cursor = 'pointer';
            imgEl.setAttribute('data-action', 'handle-avatar-click');
        }
        if(cameraBtn) {
            cameraBtn.setAttribute('data-action', 'handle-avatar-click');
        }

        const deleteAvatarBtn = document.getElementById('inline-delete-avatar-btn');
        if (deleteAvatarBtn) {
            const hasCustomImage = user.img && user.img.trim() !== '' && user.img !== DEFAULT_AVATAR_URL;
            deleteAvatarBtn.classList.toggle('active', !!hasCustomImage);
        }

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

                    const avatarWrapper = document.querySelector('.profile-container .avatar-wrapper');
                    if (avatarWrapper) avatarWrapper.classList.add('is-loading');

                    const shield = document.createElement('div');
                    shield.id = 'invisible-tx-shield';
                    document.body.appendChild(shield);

                    try {
                        const downloadUrl = await FirebaseAdapter.uploadImage(file, 'avatars', `avatar_${DataManager.user.id}.jpg`);               
                        
                        if (DataManager.updateUserProfile) {
                            await DataManager.updateUserProfile({ img: downloadUrl });
                        }
                        
                        localStorage.setItem('telecard_user_image_' + DataManager.user.id, downloadUrl);

                        if (deleteAvatarBtn) deleteAvatarBtn.classList.add('active');

                        getSys().showToast?.('تم تحديث الصورة الشخصية بنجاح', 'success');
                        getSys().sfx?.('success');
                        
                    } catch (err) {
                        console.error("Avatar Upload Error:", err);
                        getSys().showToast?.('عذراً، تعذر حفظ الصورة في السحابة', 'error');
                        const fallbackImg = DataManager.user.img || DEFAULT_AVATAR_URL;
                        if(imgEl) imgEl.src = fallbackImg; 
                        if(sidebarAvatar) sidebarAvatar.src = fallbackImg; 
                    } finally {
                        if (avatarWrapper) avatarWrapper.classList.remove('is-loading');
                        shield.remove();
                        fileInput.value = ''; 
                    }
                }
            });
            fileInput._boundChange = true;
        }

        getSys().openModal?.('profile-info');
    },

    handleAvatarClick: function(e) {
        if (DataManager.user && DataManager.user.img && DataManager.user.img !== DEFAULT_AVATAR_URL) {
            this.toggleAvatarMenu(e);
        } else {
            const fileInput = document.getElementById('avatar-upload-input');
            if (fileInput) fileInput.click();
        }
    },
    
    toggleAvatarMenu: function(event) {
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
            setTimeout(() => document.addEventListener('click', closeMenu), 10);
        }
    },
    
    closeProfileInfo: function() { getSys().closeModal?.('profile-info'); },

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
            if(idEl) idEl.textContent = RenderHelpers.formatUserId(user);
         
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

    // 🌟 [بوابة الأمان]: فتح نافذة الأمان والخصوصية الشاملة للعميل [2]
openSecurityModal: function() {
        getSys().resetUI?.();
        
        // إعادة تهيئة حقول كلمة المرور وحذف تلميحات الأخطاء السابقة
        const hint = document.getElementById('profile-password-hint');
        if (hint) {
            hint.textContent = '';
            hint.className = 'profile-hint';
        }
        ['pass-current', 'pass-new', 'pass-confirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        // مزامنة حالة زر المصادقة الثنائية (2FA) في الواجهة بناءً على تفضيلات العميل المخبأة
        const prefs = DataManager.prefs || {};
        const is2faActive = prefs.security2fa === true;
        const btn2fa = document.getElementById('setting-2fa-toggle');
        const label2fa = document.getElementById('setting-2fa-label');
        if (btn2fa) btn2fa.classList.toggle('on', is2faActive);
        if (label2fa) label2fa.textContent = is2faActive ? 'مفعل' : 'قريباً';
        
        getSys().openModal?.('security');
    },
    
    closeSecurityModal: function() {
        getSys().closeModal?.('security');
    },
    
    // 🌟 معالجة تحديث كلمة المرور المدمجة بداخل نافذة الأمان [2]
    // 🌟 معالجة تحديث كلمة المرور (النسخة النظيفة المعتمدة على الإشعارات فقط)
handlePasswordSubmit: function() {
    const securityModal = document.getElementById('security-modal');
    if (!securityModal) return;
    
    const currentInput = securityModal.querySelector('#pass-current');
    const newInput = securityModal.querySelector('#pass-new');
    const confirmInput = securityModal.querySelector('#pass-confirm');
    
    const currentVal = (currentInput?.value || '').trim();
    const newVal = (newInput?.value || '').trim();
    const confirmVal = (confirmInput?.value || '').trim();
    
    if (!DataManager || typeof DataManager.submitPasswordChange !== 'function') return;
    
    const result = DataManager.submitPasswordChange(currentVal, newVal, confirmVal);
    
    if (result.success) {
        // إظهار الإشعار العائم الجميل
        getSys().showToast?.('تم تحديث كلمة المرور بنجاح!', 'success');
        getSys().sfx?.('success');
        
        // تفريغ الحقول بعد النجاح
        [currentInput, newInput, confirmInput].forEach(el => { if (el) el.value = ''; });
        
        // إغلاق النافذة بنعومة بعد ثانية
        setTimeout(() => {
            getSys().closeSecurityModal?.();
        }, 1000);
        
    } else {
        // إظهار إشعار الخطأ
        getSys().showToast?.(result.msg, 'error');
        getSys().sfx?.('error');
    }
},
// 🌟 دالة إرسال رابط إعادة تعيين كلمة المرور للايميل
// 🌟 دالة إرسال رابط إعادة تعيين كلمة المرور للايميل (مربوطة بفايربيز فعلياً)
sendResetPasswordEmail: async function() {
    const user = DataManager?.user;
    
    if (!user || !user.email) {
        getSys().showToast?.('لا يوجد بريد إلكتروني مرتبط بهذا الحساب لإرسال الرابط!', 'error');
        getSys().sfx?.('error');
        return;
    }
    
    // تشغيل اللودر المركزي
    getSys().toggleLoader?.(true, 'جاري إرسال رابط التعيين...');
    
    try {
        // 🚀 الاستدعاء الفعلي الحقيقي لفايربيز عبر DataManager
        const result = await DataManager.sendPasswordResetEmail(user.email);
        
        getSys().toggleLoader?.(false); // إيقاف اللودر
        
        if (result.success) {
            getSys().closeSecurityModal?.(); // إغلاق النافذة
            getSys().showToast?.('تم إرسال رابط التعيين إلى بريدك الإلكتروني بنجاح', 'success');
            getSys().sfx?.('success');
        } else {
            getSys().showToast?.(result.msg, 'error'); // رسالة الخطأ القادمة من فايربيز
            getSys().sfx?.('error');
        }
        
    } catch (error) {
        getSys().toggleLoader?.(false);
        console.error("Reset Password Error:", error);
        getSys().showToast?.('حدث خطأ أثناء إرسال الرابط، يرجى المحاولة لاحقاً', 'error');
        getSys().sfx?.('error');
    }
},
selectRegCurrency: function(name, code) {
        const textEl = document.getElementById('selected-currency-text');
        const hiddenInput = document.getElementById('reg-currency');
        const dropdown = document.getElementById('reg-currency-dropdown');
        
        if (textEl) {
            textEl.innerText = name;
            textEl.style.color = 'var(--text-main)';
        }
        if (hiddenInput) {
            hiddenInput.value = code;
        }
        if (dropdown) {
            dropdown.classList.remove('open');
        }
        getSys().sfx?.('nav');
    },

    selectCountry: function(name, prefix, phoneLen) {
        const textEl = document.getElementById('selected-country-text');
        const hiddenInput = document.getElementById('reg-country');
        const prefixEl = document.getElementById('phone-prefix');
        const phoneInp = document.getElementById('reg-phone');
        const dropdown = document.getElementById('country-dropdown');
        
        if (textEl) {
            textEl.innerText = name;
            textEl.style.color = 'var(--text-main)'; 
        }
        if (hiddenInput) {
            hiddenInput.value = name; 
        }
        if (prefixEl) {
            prefixEl.innerHTML = `<span class="num-en">${prefix}</span>`;
        }
        if (phoneInp) {
            phoneInp.value = '';
            phoneInp.maxLength = phoneLen || 10;
            phoneInp.placeholder = `أدخل رقم هاتفك`;
        }
        if (dropdown) {
            dropdown.classList.remove('open');
        }
        getSys().sfx?.('nav');
    },

    // 🌟 دالة حفظ بيانات الهوية والعملة الأساسية (النسخة الاحترافية المتوافقة مع معايير المنصات العالمية)
    saveIdentityData: async function() {
        const countryEl = document.getElementById('selected-country-text');
        const phoneEl = document.getElementById('reg-phone');
        const hiddenCurrency = document.getElementById('reg-currency');
        
        const country = countryEl ? countryEl.innerText.trim() : '';
        const phone = phoneEl ? phoneEl.value.trim() : '';
        const currency = hiddenCurrency ? hiddenCurrency.value.trim().toUpperCase() : '';
        
        if (!country || country === 'اختر الدولة...' || !phone || phone === '' || !currency) {
            getSys().showToast?.('يرجى تعبئة جميع الحقول (الدولة، رقم الهاتف، وعملة المحفظة الأساسية)', 'error');
            getSys().sfx?.('error');
            return;
        }
        
        // 🚀 [التحديث المعماري للودر الفاخر - متوافق مع معايير المنصات العالمية] [2]
        getSys().toggleLoader?.(true, 'جاري حفظ التغييرات...');
        
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
            getSys().showToast?.('تعذر حفظ التغييرات، يرجى المحاولة لاحقاً', 'error');
            getSys().sfx?.('error');
            return;
        }
        
        localStorage.setItem('telecard_display_currency', currency);
        DataManager.selectedCurr = currency;
        
        if (typeof this.updateProfileDisplay === 'function') {
            this.updateProfileDisplay();
        }
        if (getSys().updateDisplayCurrencyUI) getSys().updateDisplayCurrencyUI(currency);
        if (getSys().updateDisplayBalance) getSys().updateDisplayBalance();
        
        const inputsWrap = document.getElementById('identity-inputs-wrap');
        const statusWrap = document.getElementById('identity-verified-status');
        
        if (inputsWrap) inputsWrap.style.display = 'none';
        if (statusWrap) statusWrap.classList.remove('hide-element');
        
        getSys().sfx?.('success');
        getSys().showToast?.('تم حفظ التغييرات بنجاح!', 'success');
    },

    loadDynamicCurrenciesForModal: function() {
        const listTarget = document.getElementById('reg-currency-list-target');
        if (!listTarget) return;
        
        const rates = (typeof LiveStoreData !== 'undefined' && LiveStoreData.rates) ? LiveStoreData.rates : [];
        
        let html = `
                <div class="dropdown-item" data-action="select-reg-currency" data-code="USD" data-name="دولار أمريكي (USD)">
                    <span style="flex: 1; text-align: right;">دولار أمريكي (USD)</span>
                    <span class="num-en" style="color: var(--primary); font-weight: 900;">USD</span>
                </div>`;
        
        if (rates.length > 0) {
            rates.forEach(r => {
                if (r.isActive === false || r.code.toUpperCase() === 'USD') return;
                
                const currName = `${r.name || r.code} (${r.code})`;
                html += `
                    <div class="dropdown-item" data-action="select-reg-currency" data-code="${r.code}" data-name="${currName}">
                        <span style="flex: 1; text-align: right;">${currName}</span>
                        <span class="num-en" style="color: var(--primary); font-weight: 900;">${r.code}</span>
                    </div>`;
            });
        }
        
        listTarget.innerHTML = html;
    },    

    // 🌟 معالجة وقراءة صور الهوية محلياً ومباشرة مع حماية المساحة والسرعة [1.5]
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
            getSys().showToast?.('عذراً، يجب إرفاق ملف صورة صالح (JPG, PNG)', 'error');
            getSys().sfx?.('error');
            
            input.value = '';
            if (previewImg) previewImg.src = '';
            if (parentBox) parentBox.classList.remove('has-img');
            delete this.kycFiles[previewId];
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            getSys().showToast?.('حجم الصورة كبير جداً! يرجى اختيار صورة أقل من 5 ميجابايت لتسريع عملية الرفع.', 'warning');
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

    // 🌟 دالة رفع مستندات التوثيق ومكافحة تسريب التخزين (النسخة الاحترافية العالمية) [1.5, 2]
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
        
        // 🚀 [التحديث المعماري للودر الفاخر - متوافق مع معايير المنصات العالمية] [2]
        getSys().toggleLoader?.(true, 'جاري تشفير ورفع الملفات...');
        
        try {
            const userId = DataManager.user.id || 'unknown_user';
            
            // استخدام Promise.allSettled لضمان عدم توقف العملية إذا فشل ملف واحد
            const uploadPromises = [
                FirebaseAdapter.uploadImage(frontFile, 'kyc_docs', `${userId}_front.jpg`),
                FirebaseAdapter.uploadImage(backFile, 'kyc_docs', `${userId}_back.jpg`),
                FirebaseAdapter.uploadImage(selfieFile, 'kyc_docs', `${userId}_selfie.jpg`)
            ];
            
            const results = await Promise.allSettled(uploadPromises);
            const failedUploads = results.filter(r => r.status === 'rejected');
            
            if (failedUploads.length > 0) {
                const successfulUploads = results
                    .filter(r => r.status === 'fulfilled' && r.value)
                    .map(r => r.value);
                
                if (successfulUploads.length > 0) {
                    console.warn("⚠️ فشل اكتمال رفع بعض الملفات. جاري تنظيف الملفات المعلقة...");
                    successfulUploads.forEach(url => {
                        if (FirebaseAdapter.deleteImageByUrl) {
                            FirebaseAdapter.deleteImageByUrl(url).catch(e => console.warn("تعذر تنظيف الملفات المعلقة:", e));
                        }
                    });
                }
                throw new Error("فشل رفع إحدى الصور، يرجى التأكد من جودة اتصالك بالإنترنت.");
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
            
            if (!success) throw new Error("فشل تحديث بيانات الحساب.");
            
            this.kycFiles = {}; // تفريغ الملفات بنجاح
            
            this.closeKycModal(); // إغلاق النافذة
            getSys().showToast?.('تم إرسال مستندات التوثيق بنجاح! طلبك قيد المراجعة حالياً.', 'success');
            getSys().sfx?.('success');
            this.renderKycUI();
            
        } catch (e) {
            console.error('KYC Upload Error:', e);
            getSys().showToast?.('تعذر إرسال المستندات، يرجى التحقق من اتصالك والمحاولة مجدداً', 'error');
            getSys().sfx?.('error');
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

    // 🌟 دالة عرض تفاصيل ومزايا وخريطة طريق مستويات الـ VIP بالكامل (إصدار الـ Gamification الاحترافي والمحمي) [1.5, 2]
// 🌟 دالة عرض تفاصيل ومزايا وخريطة طريق مستويات الـ VIP بالكامل (إصدار الـ Gamification الاحترافي والمحمي مع عزل العملات والـ Bidi) [1.5, 2]
openTierInfoModal: async function() {
    getSys().resetUI?.();
    getSys().closeSidebar?.();
    
    if (!DataManager || typeof DataManager.getTierProgress !== 'function') return;
    
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
    
    // 🌟 استخراج رمز العملة الفعلي للعميل ديناميكياً بدلاً من التثبيت اليدوي [1.5]
    const user = DataManager.user || {};
    const userBaseCurrency = (user.baseCurrency || user.base_currency || 'USD').toUpperCase();
    const currencySymbol = RenderHelpers ? RenderHelpers.getCurrencySymbolText(userBaseCurrency) : '$';
    
    // أ. الجزء العلوي: بطاقة العميل والمستوى الفعلي الحالي للعميل
    let html = `
            <div class="tm-wrapper">
                <div class="tm-icon-box" style="color: ${tierColor};">
                    <i class="${finalIconClass} tm-icon"></i>
                </div>
                <h3 class="tm-title">${Utils.escapeHtml(currentTier.name)}</h3>
                <p class="tm-desc">مستواك الحالي هو <span class="tm-text-highlight" style="color: ${tierColor};">${Utils.escapeHtml(currentTier.name)}</span>. للارتقاء بتجربتك والحصول على مزايا وأسعار أفضل، قم بزيادة مبيعاتك خلال المدة المحددة.</p>
        `;
    
    // ب. الجزء الأوسط والسفلي: يعتمد كلياً على تفعيل أو تعطيل النظام من الإدارة
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
                            يتوجب عليك إنفاق <span class="tm-amount-text num-en" dir="ltr">${remainingAmt.toFixed(2)} ${currencySymbol}</span> إضافية خلال <span class="tm-text-highlight text-warning">${remainingDays} يوماً</span> ${targetPhraseHtml}
                        </div>
                    </div>
                `;
        }
        
        // جـ. خريطة طريق مستويات الـ VIP التصاعدية بالكامل
        const allTiers = (LiveStoreData.tiers || []);
        if (allTiers.length > 0) {
            const sortedTiers = [...allTiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
            
            html += `
                    <div class="tm-roadmap-section">
                        <h4 class="tm-roadmap-title"><i class="fa-solid fa-map-location-dot"></i> خريطة طريق مستويات VIP</h4>
                        <div class="tm-roadmap-list">
                `;
            
            sortedTiers.forEach(t => {
                const isUserCurrent = String(t.id) === String(currentTier.id);
                const tColor = t.color || 'var(--text-gray)';
                let rawIconT = t.icon || 'medal';
                let cleanIconT = rawIconT.replace(/fa-solid|fa-regular|fa-brands|fa-/g, '').trim();
                let finalIconClassT = `fa-solid fa-${cleanIconT}`;
                
                const badgeHtml = isUserCurrent ?
                    `<span class="tm-badge-active" style="background: ${tierColor};">مستواك الحالي</span>` :
                    `<span class="tm-badge-locked">مغلق</span>`;
                
                const stateClass = isUserCurrent ? 'active' : 'locked';
                
                // 🌟 التحديث الحاسم: عزل الرقم والعملة بداخل وسم <bdi> لمنع قفز الرمز بجانب كلمة "هدف" وتثبيته بجانب الرقم [2]!
                html += `
                        <div class="tm-roadmap-item ${stateClass}">
                            <div class="tm-item-left">
                                <div class="tm-item-icon" style="color: ${tColor}; background: ${isUserCurrent ? 'rgba(255, 215, 0, 0.08)' : 'rgba(255, 255, 255, 0.03)'}; border-color: ${isUserCurrent ? tColor : 'rgba(255,255,255,0.05)'};">
                                    <i class="${finalIconClassT}"></i>
                                </div>
                                <div class="tm-item-info">
                                    <span class="tm-item-name">${Utils.escapeHtml(t.nameAr || t.name)}</span>
                                    <span class="tm-item-req" style="${isUserCurrent ? 'color: var(--gold-main); font-weight:700;' : ''}">هدف المبيعات: <bdi class="num-en">${Number(t.threshold || 0).toFixed(0)} ${currencySymbol}</bdi></span>
                                </div>
                            </div>
                            <div class="tm-item-right">
                                ${badgeHtml}
                            </div>
                        </div>
                    `;
            });
            
            html += `</div></div>`;
        }
        
    } else {
        html += `
                <div class="tm-alert-box mt-15" style="background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.12); padding: 16px; border-radius: 16px; display: block; text-align: right; width: 100%;">
                    <span class="nm-reply-head text-danger tm-text-highlight d-block mb-8" style="font-weight: 800; font-size: 13.5px;"><i class="fa-solid fa-circle-info"></i> تنبيه إداري</span>
                    <div class="nm-reply-body text-main line-height-lg" style="font-size: 13px; color: var(--text-gray); font-weight: 600;">${Utils.escapeHtml(pausedMsg)}</div>
                </div>
            `;
    }
    
    html += `</div>`;
    content.innerHTML = html;
    
    getSys().openModal?.('tier-info');
}
};
