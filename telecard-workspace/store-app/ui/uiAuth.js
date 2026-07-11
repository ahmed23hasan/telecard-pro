// ============================================================================
// 🪪 وحدة الهوية والأمان (uiAuth.js) - النسخة الماسية (Pro V4.2)
// 🎯 الوظيفة: الملف الشخصي، التوثيق (KYC)، الأمان، الـ Native 2FA، والبصمة الحيوية
// 🌟 التحديث الأقصى: إصلاح تسرب الذاكرة للمراقب، توحيد حالة التوثيق، وتحسين استخراج الأسماء
// ============================================================================

import { DB_KEYS } from '../config.js'; 
import { Utils } from '../utils.js';
import { DataManager, LiveStoreData, StoreDB } from '../dataManager.js';
import { FirebaseAdapter, auth } from '../core/firebaseAdapter.js';
import { RenderHelpers } from '../core/renderHelpers.js';

const DEFAULT_AVATAR_URL = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

// ✅ دالة آمنة لجلب النظام تمنع انهيار الواجهة
const getSys = () => {
    if (window.ClientSystem) return window.ClientSystem;
    if (window.UIManager) return window.UIManager;
    
    return new Proxy({}, {
        get: (target, prop) => () => {
            console.warn(`🚨 تم إيقاف استدعاء [${String(prop)}] لأن النظام (ClientSystem) لم يكتمل إقلاعه بعد!`);
        }
    });
};

export const UIAuth = {

    kycFiles: {},
    _isSubmittingKyc: false, 

    // 🚀 [Storage Saver - Secure]: محرك ضغط الصور الاحترافي
    _compressImage: function(file, maxWidth = 1000) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        let width = img.width, height = img.height;
                        if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } } 
                        else { if (height > maxWidth) { width *= maxWidth / height; height = maxWidth; } }
                        
                        canvas.width = width; canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error("تعذر إنشاء مساحة العمل للصورة (Canvas Context).");
                        
                        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        canvas.toBlob((blob) => {
                            if (!blob) throw new Error("فشل ضغط الصورة.");
                            const safeName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "image";
                            const compressedFile = new File([blob], `${safeName}.webp`, { type: 'image/webp' });
                            resolve({ file: compressedFile, previewUrl: URL.createObjectURL(blob) });
                            canvas.width = 0; canvas.height = 0; // تنظيف الذاكرة
                        }, 'image/webp', 0.80);
                    } catch (error) {
                        reject(error);
                    }
                };
                img.onerror = () => reject(new Error("ملف الصورة تالف أو غير صالح."));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
            reader.readAsDataURL(file);
        });
    },

    // 👤 إدارة الملف الشخصي (Profile Management)
    // =========================================================
    openProfileInfo: function() {
        getSys().resetUI?.();
        if(DataManager.syncUser) DataManager.syncUser();
        this.updateProfileDisplay();

        if (!DataManager.user) return;
        const user = DataManager.user;
        
        // 🚀 [إصلاح منطقي]: توحيد حالة التوثيق (الهاتف أو الهوية)
        const isVerified = (user.isVerified === true || String(user.isVerified) === 'true' || user.kycStatus === 'approved' || user.kycStatus === 'verified'); 

        // 🚀 [إصلاح الأسماء]: Fallback ذكي لتجميع الاسم
        const fallbackName = (user.fullName || user.name || (user.firstName ? `${user.firstName} ${user.lastName || ''}` : 'العميل')).trim();
        const fullName = getSys()._getFullName ? getSys()._getFullName(user) : fallbackName;
        
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
        
        const sidebarName = document.getElementById('cs-name'); 
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
            phoneEl.innerHTML = `<span dir="ltr">${Utils.escapeHtml(phoneTxt)}</span>`;
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
        
        if(imgEl) { imgEl.style.cursor = 'pointer'; imgEl.setAttribute('data-action', 'handle-avatar-click'); }
        if(cameraBtn) { cameraBtn.setAttribute('data-action', 'handle-avatar-click'); }

        const deleteAvatarBtn = document.getElementById('inline-delete-avatar-btn');
        if (deleteAvatarBtn) {
            const hasCustomImage = user.img && user.img.trim() !== '' && user.img !== DEFAULT_AVATAR_URL;
            deleteAvatarBtn.classList.toggle('active', !!hasCustomImage);
        }

        if(fileInput && !fileInput._boundChange) {
            fileInput.addEventListener('change', async (e) => {
                const originalFile = e.target.files && e.target.files[0];
                
                if (!originalFile || !originalFile.type.startsWith('image/')) {
                    getSys().showToast?.('عذراً، يجب إرفاق ملف صورة صالح', 'error');
                    fileInput.value = ''; return;
                }
                
                if (originalFile.size > 5 * 1024 * 1024) { 
                    getSys().showToast?.('حجم الصورة كبير جداً! اختر صورة أقل من 5MB', 'warning');
                    fileInput.value = ''; return;
                }

                const avatarWrapper = document.querySelector('.profile-container .avatar-wrapper');
                if (avatarWrapper) avatarWrapper.classList.add('is-loading');

                const shield = document.createElement('div');
                shield.id = 'invisible-tx-shield';
                document.body.appendChild(shield);

                try {
                    const compressed = await this._compressImage(originalFile, 400); 
                    
                    if(imgEl) imgEl.src = compressed.previewUrl; 
                    if(sidebarAvatar) sidebarAvatar.src = compressed.previewUrl; 

                    const oldImageUrl = DataManager.user.img; 
                    const downloadUrl = await FirebaseAdapter.uploadImage(compressed.file, 'avatars', `avatar_${DataManager.user.id}_${Date.now()}.webp`);               
                    
                    // 🛡️ [الترقيع الماسي]: حماية من ثغرة الـ Race Condition
                    let dbUpdateSuccess = false;
                    if (DataManager.updateUserProfile) {
                        dbUpdateSuccess = await DataManager.updateUserProfile({ img: downloadUrl });
                    }
                    
                    if (dbUpdateSuccess) {
                        localStorage.setItem('telecard_user_image_' + DataManager.user.id, downloadUrl);

                        // نحذف الصورة القديمة فقط إذا تأكدنا من حفظ الرابط الجديد في الداتابيز
                        if (oldImageUrl && oldImageUrl !== DEFAULT_AVATAR_URL && FirebaseAdapter.deleteImageByUrl) {
                            FirebaseAdapter.deleteImageByUrl(oldImageUrl).catch(e => console.warn("Failed to delete old avatar:", e));
                        }

                        if (deleteAvatarBtn) deleteAvatarBtn.classList.add('active');

                        getSys().showToast?.('تم تحديث الصورة الشخصية بنجاح', 'success');
                        getSys().sfx?.('success');
                    } else {
                        // تراجع (Rollback): لو فشل الداتابيز، نحذف الصورة التي رفعناها للتو من التخزين السحابي
                        if (FirebaseAdapter.deleteImageByUrl) FirebaseAdapter.deleteImageByUrl(downloadUrl).catch(()=>{});
                        throw new Error("قاعدة البيانات رفضت التحديث.");
                    }
                    
                } catch (err) {
                    console.error("Avatar Upload Error:", err);
                    getSys().showToast?.('عذراً، تعذر حفظ الصورة، قد تكون تالفة أو الاتصال ضعيف.', 'error');
                    const fallbackImg = DataManager.user.img || DEFAULT_AVATAR_URL;
                    if(imgEl) imgEl.src = fallbackImg; 
                    if(sidebarAvatar) sidebarAvatar.src = fallbackImg; 
                } finally {
                    if (avatarWrapper) avatarWrapper.classList.remove('is-loading');
                    shield.remove();
                    fileInput.value = ''; 
                }
            });
            fileInput._boundChange = true;
        }

        getSys().openModal?.('profile-info');
    },
    toggleNameEdit: function() {
        const nameEl = document.getElementById('display-name');
        const inpEl = document.getElementById('edit-name-input');
        const btn = document.getElementById('profile-edit-toggle');
        
        if (!nameEl || !inpEl || !btn) return;
        
        if (inpEl.classList.contains('d-none')) {
            nameEl.classList.add('d-none');
            inpEl.classList.remove('d-none');
            inpEl.focus();
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        } else {
            let newVal = inpEl.value.trim().replace(/[<>"{}[\]\\]/g, ''); 
            
            if (!newVal) {
                getSys().showToast?.('لا يمكن ترك الاسم فارغاً', 'warning');
                return;
            }
            if (newVal.length > 40) {
                getSys().showToast?.('الاسم طويل جداً، يرجى كتابة اسم أقصر', 'warning');
                return;
            }

            if (DataManager.user && newVal !== DataManager.user.name) {
                DataManager.updateUserProfile({ name: newVal, fullName: newVal }).then(success => {
                    if (success) {
                        nameEl.innerText = newVal;
                        getSys().showToast?.('تم تحديث الاسم بنجاح', 'success');
                        if(typeof this.updateProfileDisplay === 'function') this.updateProfileDisplay();
                    }
                });
            }
            inpEl.value = newVal; 
            inpEl.classList.add('d-none');
            nameEl.classList.remove('d-none');
            btn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        }
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
        
        if (this._currentAvatarMenuListener) {
            document.removeEventListener('click', this._currentAvatarMenuListener);
            this._currentAvatarMenuListener = null;
        }
        
        menu.classList.toggle('active');
        getSys().sfx?.('nav');
        
        if (menu.classList.contains('active')) {
            this._currentAvatarMenuListener = (e) => {
                if (!menu.contains(e.target) && !e.target.closest('#avatar-menu-trigger') && !e.target.closest('#profile-img')) {
                    menu.classList.remove('active');
                    document.removeEventListener('click', this._currentAvatarMenuListener);
                    this._currentAvatarMenuListener = null; 
                }
            };
            setTimeout(() => document.addEventListener('click', this._currentAvatarMenuListener), 10);
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
        const navSecurity = document.getElementById('nav-item-security');
        const navRating = document.querySelector('[data-action="open-rating"]');
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
            if (navSecurity) navSecurity.style.display = 'none';
            if (navRating) navRating.style.display = 'none';
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
        if (navSecurity) navSecurity.style.display = 'flex';
        if (navRating) navRating.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'flex';
        
        const user = DataManager.user;
        const fallbackName = (user.fullName || user.name || (user.firstName ? `${user.firstName} ${user.lastName || ''}` : 'العميل')).trim();
        const fullName = getSys()._getFullName ? getSys()._getFullName(user) : fallbackName;
        
        const nameEl = document.getElementById('cs-name');
        const displayNameEl = document.getElementById('display-name');
        
        if (nameEl) nameEl.textContent = fullName;
        if (displayNameEl) displayNameEl.textContent = fullName;
        
        if (alertCard) {
            const hasCurrency = (user.baseCurrency && user.baseCurrency.trim() !== '') || (user.base_currency && user.base_currency.trim() !== '');
            const hasData = (user.phone && user.phone.trim() !== '') && (user.country && user.country !== '');
            const isIdentityComplete = ((user.isVerified === true || String(user.isVerified) === 'true') || hasData) && hasCurrency;
            
            // 🚀 تم إزالة المؤقت العشوائي (Cache Lock)، الاعتماد كلياً على التزامن الحي من Firestore
            if (isIdentityComplete) {
                alertCard.style.setProperty('display', 'none', 'important');
                alertCard.classList.add('d-none', 'hide-element');
                alertCard.style.pointerEvents = 'none';
                alertCard.removeAttribute('data-action');
                alertCard.onclick = null;
            } else {
                alertCard.style.removeProperty('display');
                alertCard.style.display = 'flex';
                alertCard.classList.remove('d-none', 'hide-element');
                alertCard.style.pointerEvents = 'auto';
                alertCard.setAttribute('data-action', 'open-identity-sidebar');
            }
        }
        
        const sidebarAvatar = document.getElementById('cs-avatar');
        if (sidebarAvatar) {
            const defaultImg = typeof DEFAULT_AVATAR_URL !== 'undefined' ? DEFAULT_AVATAR_URL : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
            sidebarAvatar.src = user.img || defaultImg;
        }
        
        const idEl = document.getElementById('cs-id');
        if (idEl) idEl.textContent = RenderHelpers.formatUserId(user);
        
        this.updateSidebarTier();
        this.renderKycUI();
        this.checkKycCelebration();
        
    } catch (e) { console.error('Error updating profile display:', e); }
},
    deleteProfileImage: function() {
        if(!DataManager.user) return;
        
        const oldImageUrl = DataManager.user.img; 
        
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
            
            if (oldImageUrl && oldImageUrl !== DEFAULT_AVATAR_URL && FirebaseAdapter.deleteImageByUrl) {
                FirebaseAdapter.deleteImageByUrl(oldImageUrl).catch(e => console.warn("Failed to delete old avatar:", e));
            }
            
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
            
            try {
                let hex = tierColor.replace('#', '');
                if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                    tierBtn.style.setProperty('--tier-rgb', `${r}, ${g}, ${b}`);
                }
            } catch (e) {
                tierBtn.style.setProperty('--tier-rgb', '255, 215, 0'); 
            }
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

    // =========================================================
    // 🛡️ الأمان والمصادقة (Security & 2FA Native Engine)
    // =========================================================
    openSecurityModal: function() {
        getSys().resetUI?.();
        
        this._clear2FAState();

        const hint = document.getElementById('profile-password-hint');
        if (hint) { hint.textContent = ''; hint.className = 'profile-hint'; }
        ['pass-current', 'pass-new', 'pass-confirm'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });

        const is2faActive = DataManager.is2FAEnabled ? DataManager.is2FAEnabled() : false;
        const btn2fa = document.getElementById('setting-2fa-toggle');
        
        if (btn2fa) { 
            btn2fa.classList.toggle('is-active', is2faActive);
            const bgText = btn2fa.querySelector('.switch-bg-text');
            if (bgText) bgText.textContent = is2faActive ? 'مفعل' : 'مغلق';
            btn2fa.onclick = () => this.handle2FAToggle();
        }

        const isBioActive = DataManager.user?.biometricEnabled === true;
        const btnBio = document.getElementById('setting-biometric-toggle');
        
        if (btnBio) {
            btnBio.classList.toggle('is-active', isBioActive);
            const bgText = btnBio.querySelector('.switch-bg-text');
            if (bgText) bgText.textContent = isBioActive ? 'مفعل' : 'مغلق';
            btnBio.onclick = () => this.handleBiometricToggle();
        }

        getSys().openModal?.('security');
    },
    
    closeSecurityModal: function() {
        this._clear2FAState(); 
        getSys().closeModal?.('security');
    },

    _pendingTfaSecret: null,

    _clear2FAState: function() {
        this._pendingTfaSecret = null;
        const manualSecretEl = document.getElementById('manual-2fa-secret');
        if (manualSecretEl) manualSecretEl.innerText = '';
        const qrContainer = document.getElementById('qrcode-container');
        if (qrContainer) qrContainer.innerHTML = '';
        const otpInput = document.getElementById('otp-verify-input');
        if (otpInput) otpInput.value = '';
    },

    handle2FAToggle: async function() {
        const isCurrentlyEnabled = DataManager.is2FAEnabled ? DataManager.is2FAEnabled() : false;
        
        if (isCurrentlyEnabled) {
            getSys().toggleLoader?.(true, 'جاري إيقاف الحماية...');
            const result = await DataManager.unenrollMFA();
            getSys().toggleLoader?.(false);
            
            if (result.success) {
                getSys().showToast?.('تم إيقاف المصادقة الثنائية', 'info');
                getSys().sfx?.('nav');
                this.openSecurityModal(); 
            } else {
                getSys().showToast?.(result.msg, 'error');
            }
        } else {
            this.start2FASetup();
        }
    },

    start2FASetup: async function() {
        const sys = getSys();
        this._clear2FAState();

        sys.toggleLoader?.(true, 'جاري مزامنة بروتوكولات الأمان...');
        
        try {
            if (auth && auth.currentUser) {
                await auth.currentUser.getIdToken(true); 
            }
        } catch (tokenError) { console.warn("Token refresh bypassed:", tokenError); }

        sys.toggleLoader?.(true, 'جاري إنشاء مفتاح آمن من جوجل...');
        
        try {
            const result = await DataManager.generateTOTPSecret();

            if (!result.success) {
                sys.toggleLoader?.(false);
                sys.showToast?.(result.msg || 'فشل في إنشاء المفتاح، يرجى المحاولة مرة أخرى.', 'error');
                return;
            }

            this._pendingTfaSecret = result.secret;

            const storeName = LiveStoreData.settings?.storeName || 'Telecard';
            const userEmail = DataManager.user?.email || 'User';
            
            const qrUri = this._pendingTfaSecret.generateQrCodeUrl(userEmail, storeName);

            const manualSecretEl = document.getElementById('manual-2fa-secret');
            if (manualSecretEl) manualSecretEl.innerText = this._pendingTfaSecret.secretKey;
            
            const qrContainer = document.getElementById('qrcode-container');
            if (qrContainer) {
                qrContainer.innerHTML = ''; 
                
                if (typeof window.QRCode === 'undefined') {
                    sys.toggleLoader?.(true, 'جاري تحميل نظام التشفير المرئي...');
                    await new Promise((resolve, reject) => {
                        if (document.querySelector('script[src*="qrcode.min.js"]')) {
                            const checkInterval = setInterval(() => {
                                if (typeof window.QRCode !== 'undefined') {
                                    clearInterval(checkInterval);
                                    resolve();
                                }
                            }, 100);
                        } else {
                            const script = document.createElement('script');
                            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.1/qrcode.min.js';
                            script.integrity = 'sha512-1m3PjBwTXX71aQhL/r/118XnI2a1V7Yf5tEETqjGokHqGqI/J0Qe2OqTNDH+0n0BfK2Rbx8u0D0Wl4y1C/tN2A==';
                            script.crossOrigin = 'anonymous';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        }
                    });
                }
                
                if (typeof window.QRCode !== 'undefined') {
                    const qrDataUrl = await window.QRCode.toDataURL(qrUri, { color: { dark: '#111a2b', light: '#ffffff' }, width: 200, margin: 1 });
                    qrContainer.innerHTML = `<img src="${qrDataUrl}" style="width: 100%; height: 100%; border-radius: 8px;" alt="2FA QR Code">`;
                } else {
                    qrContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);"><i class="fa-solid fa-shield-halved fa-2x mb-10"></i><br>يرجى إدخال الكود النصي يدوياً في التطبيق.</div>`;
                }
            }
            
            sys.toggleLoader?.(false);
            
            if (typeof this.closeSecurityModal === 'function') this.closeSecurityModal(); 
            else if (typeof sys.closeModal === 'function') sys.closeModal('security');

            setTimeout(() => {
                if (typeof sys.openModal === 'function') sys.openModal('setup-2fa');
                else if (typeof this.openModal === 'function') this.openModal('setup-2fa');
                
                const setupModal = document.getElementById('setup-2fa-modal');
                if (setupModal && !setupModal._boundCleanup) {
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.attributeName === 'class' && !setupModal.classList.contains('show')) {
                                this._clear2FAState();
                                // 🚀 [إصلاح تسرب الذاكرة]: فصل المراقب لتنظيف الذاكرة بعد الإغلاق
                                observer.disconnect();
                                setupModal._boundCleanup = false;
                            }
                        });
                    });
                    observer.observe(setupModal, { attributes: true });
                    setupModal._boundCleanup = true;
                }
            }, 150);

        } catch (error) {
            console.error('2FA Setup Error:', error);
            sys.toggleLoader?.(false);
            sys.showToast?.('حدث خطأ في الاتصال، يرجى المحاولة لاحقاً.', 'error');
            this._clear2FAState();
        }
    },

    verifyAndEnable2FA: async function() {
        if (!this._pendingTfaSecret) return;

        const sys = getSys();
        const input = document.getElementById('otp-verify-input');
        const code = input ? input.value.trim() : '';
        
        if (!/^\d{6}$/.test(code)) {
            sys.showToast?.('يرجى إدخال 6 أرقام صالحة', 'error');
            return;
        }
        
        const btn = document.getElementById('btn-confirm-2fa');
        const origText = btn ? btn.innerHTML : 'تأكيد';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التوثيق مع السيرفر...';
            btn.disabled = true;
        }
        
        const result = await DataManager.enrollTOTP(this._pendingTfaSecret, code);
        
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
        
        if (result.success) {
            this._clear2FAState(); 

            sys.closeModal?.('setup-2fa');
            sys.showToast?.('تم تفعيل المصادقة الثنائية بنجاح 🛡️', 'success');
            sys.sfx?.('success');
            
            setTimeout(() => {
                if (typeof this.openSecurityModal === 'function') this.openSecurityModal();
                else if (typeof sys.openModal === 'function') sys.openModal('security');
            }, 150);
            
        } else {
            sys.showToast?.(result.msg, 'error');
            sys.sfx?.('error');
            if (input) {
                input.classList.add('input-error');
                setTimeout(() => input.classList.remove('input-error'), 1000);
            }
        }
    },

    // =========================================================
    // 👆 نظام المصادقة الحيوية (المستوى البنكي - Un-bypassable)
    // =========================================================
    handleBiometricToggle: async function() {
        const isCurrentlyEnabled = DataManager.user?.biometricEnabled === true;
        
        if (isCurrentlyEnabled) {
            getSys().toggleLoader?.(true, 'جاري إيقاف البصمة في السيرفر...');
            try {
                const success = await DataManager.updateUserProfile({ biometricEnabled: false });
                if (success) {
                    localStorage.removeItem('telecard_biometric_key');
                    getSys().showToast?.('تم إيقاف المصادقة بالبصمة بنجاح', 'info');
                    getSys().sfx?.('nav');
                    this.openSecurityModal();
                } else {
                    getSys().showToast?.('تعذر إيقاف البصمة، يرجى المحاولة لاحقاً', 'error');
                }
            } finally {
                getSys().toggleLoader?.(false);
            }
            return;
        }

        if (!window.PublicKeyCredential) {
            getSys().showToast?.('عذراً، متصفحك أو جهازك لا يدعم المصادقة الحيوية', 'error');
            return;
        }

        try {
            getSys().toggleLoader?.(true, 'يرجى تأكيد بصمتك لربط الجهاز...');
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const userIdBytes = new Uint8Array(16);
            window.crypto.getRandomValues(userIdBytes);
            const userEmail = DataManager.user?.email || 'user@telecard.com';
            
            const publicKeyCredentialCreationOptions = {
                challenge: challenge,
                rp: { name: LiveStoreData.settings?.storeName || "Telecard Store" },
                user: { id: userIdBytes, name: userEmail, displayName: userEmail },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000
            };

            const credential = await navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions });
            const rawId = Array.from(new Uint8Array(credential.rawId)).map(b => b.toString(16).padStart(2, '0')).join('');

            try {
                localStorage.setItem('telecard_biometric_key', rawId);
            } catch(e) {
                throw new Error("تعذر حفظ مفتاح البصمة في جهازك (قد يكون المتصفح في الوضع المخفي). تم الإلغاء لمنع إغلاق الحساب.");
            }

            const success = await DataManager.updateUserProfile({ biometricEnabled: true });
            
            if (success) {
                getSys().showToast?.('تم تفعيل البصمة بنجاح! سيتم قفل المتجر بها.', 'success');
                getSys().sfx?.('success');
                this.openSecurityModal();
            } else {
                localStorage.removeItem('telecard_biometric_key'); 
                throw new Error('Server Update Failed');
            }
        } catch (error) {
            console.error("Biometric Error:", error);
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                getSys().showToast?.('تم إلغاء عملية البصمة', 'warning');
            } else {
                getSys().showToast?.(error.message || 'تعذر تفعيل البصمة، تأكد من إعدادات القفل في هاتفك', 'error');
            }
        } finally {
            getSys().toggleLoader?.(false);
        }
    },

    // --- معالجة كلمات المرور (Password Reset & Change) ---
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
        
        DataManager.submitPasswordChange(currentVal, newVal, confirmVal).then(result => {
            if (result.success) {
                getSys().showToast?.('تم تحديث كلمة المرور بنجاح!', 'success');
                getSys().sfx?.('success');
                [currentInput, newInput, confirmInput].forEach(el => { if (el) el.value = ''; });
                setTimeout(() => { getSys().closeSecurityModal?.(); }, 1000);
            } else {
                getSys().showToast?.(result.msg, 'error');
                getSys().sfx?.('error');
            }
        });
    },

    sendResetPasswordEmail: async function() {
        const user = DataManager?.user;
        if (!user || !user.email) {
            getSys().showToast?.('لا يوجد بريد إلكتروني مرتبط بهذا الحساب لإرسال الرابط!', 'error');
            getSys().sfx?.('error');
            return;
        }
        
        getSys().toggleLoader?.(true, 'جاري إرسال رابط التعيين...');
        
        try {
            const result = await DataManager.sendPasswordResetEmail(user.email);
            getSys().toggleLoader?.(false); 
            
            if (result.success) {
                getSys().closeSecurityModal?.(); 
                getSys().showToast?.('تم إرسال رابط التعيين إلى بريدك الإلكتروني بنجاح', 'success');
                getSys().sfx?.('success');
            } else {
                getSys().showToast?.(result.msg, 'error'); 
                getSys().sfx?.('error');
            }
        } catch (error) {
            getSys().toggleLoader?.(false);
            getSys().showToast?.('حدث خطأ أثناء إرسال الرابط، يرجى المحاولة لاحقاً', 'error');
        }
    },

    // =========================================================
    // 🌍 التوثيق (KYC) واستكمال الهوية (Identity)
    // =========================================================
    selectRegCurrency: function(name, code) {
        const textEl = document.getElementById('selected-currency-text');
        const hiddenInput = document.getElementById('reg-currency');
        const dropdown = document.getElementById('reg-currency-dropdown');
        
        if (textEl) { textEl.innerText = name; textEl.style.color = 'var(--text-main)'; }
        if (hiddenInput) { hiddenInput.value = code; }
        if (dropdown) { dropdown.classList.remove('open'); }
        getSys().sfx?.('nav');
    },

    selectCountry: function(name, prefix, phoneLen) {
        const textEl = document.getElementById('selected-country-text');
        const hiddenInput = document.getElementById('reg-country');
        const prefixEl = document.getElementById('phone-prefix');
        const phoneInp = document.getElementById('reg-phone');
        const dropdown = document.getElementById('country-dropdown');
        
        if (textEl) { textEl.innerText = name; textEl.style.color = 'var(--text-main)'; }
        if (hiddenInput) { hiddenInput.value = name; }
        if (prefixEl) { prefixEl.innerHTML = `<span class="num-en">${prefix}</span>`; }
        if (phoneInp) {
            phoneInp.value = '';
            phoneInp.maxLength = phoneLen || 10;
            phoneInp.placeholder = `أدخل رقم هاتفك`;
        }
        if (dropdown) { dropdown.classList.remove('open'); }
        getSys().sfx?.('nav');
    },

saveIdentityData: async function() {
    const btn = document.querySelector('[data-action="save-identity"]');
    if (this._isSavingIdentity || (btn && btn.classList.contains('is-loading'))) return;
    
    // ✅ [قفل أمني]: يعتمد على isVerified (إكمال البيانات) لمنع التلاعب بالعملة بعد الاختيار الأول
    if (DataManager.user && (DataManager.user.isVerified === true || String(DataManager.user.isVerified) === 'true')) {
        getSys().showToast?.('عملية مرفوضة: لقد قمت بتأكيد هويتك مسبقاً ولا يمكن تغيير العملة الأساسية.', 'error');
        getSys().sfx?.('error');
        getSys().closeModal?.('identity');
        return;
    }
    
    const countryEl = document.getElementById('selected-country-text');
    const phoneEl = document.getElementById('reg-phone');
    const hiddenCurrency = document.getElementById('reg-currency');
    
    const country = countryEl ? countryEl.innerText.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const currency = hiddenCurrency ? hiddenCurrency.value.trim().toUpperCase() : '';
    
    if (!country || country === 'اختر الدولة...' || !phone || phone === '' || !currency) {
        getSys().showToast?.('يرجى تعبئة جميع الحقول بدقة', 'warning');
        getSys().sfx?.('error');
        return;
    }
    
    if (!/^[\d\s\+\-\(\)]+$/.test(phone)) {
        getSys().showToast?.('رقم الهاتف غير صالح، يرجى استخدام الأرقام فقط.', 'error');
        return;
    }
    
    this._isSavingIdentity = true;
    if (btn) {
        btn.classList.add('is-loading');
        btn.disabled = true;
    }
    getSys().toggleLoader?.(true, 'جاري تأمين وربط المحفظة...');
    
    try {
        const result = await StoreDB.callFunction('completeUserIdentity', {
            country: country,
            phone: phone,
            currency: currency
        });
        
        if (result && result.success) {
            const finalCurr = result.lockedCurrency || currency;
            
            // تحديث الذاكرة المحلية والعملة
            localStorage.setItem('telecard_display_currency', finalCurr);
            DataManager.selectedCurr = finalCurr;
            
            DataManager.user.country = country;
            DataManager.user.phone = phone;
            DataManager.user.baseCurrency = finalCurr;
            DataManager.user.isVerified = true; // تم الربط بنجاح
            
            if (typeof this.updateProfileDisplay === 'function') this.updateProfileDisplay();
            if (getSys().updateDisplayCurrencyUI) getSys().updateDisplayCurrencyUI(finalCurr);
            if (getSys().updateDisplayBalance) getSys().updateDisplayBalance();
            
            // إخفاء الحقول وإظهار رسالة التوثيق داخل النافذة
            const inputsWrap = document.getElementById('identity-inputs-wrap');
            const statusWrap = document.getElementById('identity-verified-status');
            if (inputsWrap) inputsWrap.style.display = 'none';
            if (statusWrap) statusWrap.classList.remove('hide-element');
            
            getSys().sfx?.('success');
            // رسالة واضحة تخبر العميل بالنجاح وتدعوه للإغلاق يدوياً
            getSys().showToast?.(result.message || 'تم ربط المحفظة وتأكيد البيانات بنجاح! يمكنك الآن إغلاق النافذة.', 'success');
            
            // 🛑 [تم الحذف]: سطر setTimeout الذي كان يغلق النافذة تلقائياً
        }
    } catch (error) {
        console.error("Identity Error:", error);
        getSys().sfx?.('error');
        getSys().showToast?.(error.message || 'فشلت العملية، يرجى المحاولة لاحقاً.', 'error');
        if (typeof DataManager.syncUser === 'function') DataManager.syncUser();
    } finally {
        this._isSavingIdentity = false;
        if (btn) {
            btn.classList.remove('is-loading');
            btn.disabled = false;
        }
        getSys().toggleLoader?.(false);
    }
},

    loadDynamicCurrenciesForModal: function() {
        const listTarget = document.getElementById('reg-currency-list-target');
        if (!listTarget) return;
        
        const rates = (typeof LiveStoreData !== 'undefined' && LiveStoreData.rates) ? LiveStoreData.rates : [];
        let html = `<div class="dropdown-item" data-action="select-reg-currency" data-code="USD" data-name="دولار أمريكي (USD)"><span style="flex: 1; text-align: right;">دولار أمريكي (USD)</span><span class="num-en" style="color: var(--primary); font-weight: 900;">USD</span></div>`;
        
        if (rates.length > 0) {
            rates.forEach(r => {
                if (r.isActive === false || r.code.toUpperCase() === 'USD') return;
                const currName = `${r.name || r.code} (${r.code})`;
                html += `<div class="dropdown-item" data-action="select-reg-currency" data-code="${r.code}" data-name="${currName}"><span style="flex: 1; text-align: right;">${currName}</span><span class="num-en" style="color: var(--primary); font-weight: 900;">${r.code}</span></div>`;
            });
        }
        listTarget.innerHTML = html;
    },

    handleKycImage: async function(input, previewId) {
        const file = input.files && input.files[0];
        const parentBox = input.closest('.kyc-upload-box');
        const previewImg = document.getElementById(previewId);
        
        this.kycFiles = this.kycFiles || {};
        
        if (!file || !file.type.startsWith('image/')) {
            getSys().showToast?.('عذراً، يجب إرفاق ملف صورة صالح', 'error');
            input.value = '';
            if (previewImg) previewImg.src = '';
            if (parentBox) parentBox.classList.remove('has-img');
            delete this.kycFiles[previewId];
            return;
        }
        
        if (file.size > 8 * 1024 * 1024) {
            getSys().showToast?.('حجم الصورة كبير جداً! اختر صورة أقل من 8MB', 'warning');
            input.value = '';
            delete this.kycFiles[previewId];
            return;
        }
        
        try {
            getSys().toggleLoader?.(true, 'جاري معالجة الصورة...');
            const compressed = await this._compressImage(file, 1200); 
            
            this.kycFiles[previewId] = compressed.file; 
            
            if (previewImg) previewImg.src = compressed.previewUrl;
            if (parentBox) parentBox.classList.add('has-img');
        } catch(e) {
            getSys().showToast?.('تعذر معالجة الصورة، قد تكون غير مدعومة', 'error');
            input.value = '';
        } finally {
            getSys().toggleLoader?.(false);
        }
    },

    submitKycData: async function() {
        if (this._isSubmittingKyc) return;
        
        const fullName = document.getElementById('kyc-full-name')?.value?.trim() || '';
        const idNumber = document.getElementById('kyc-id-number')?.value?.trim() || '';
        
        this.kycFiles = this.kycFiles || {};
        const frontFile = this.kycFiles['kyc-prev-front'];
        const backFile = this.kycFiles['kyc-prev-back'];
        const selfieFile = this.kycFiles['kyc-prev-selfie'];
        
        if (!fullName || !idNumber || !frontFile || !backFile || !selfieFile) {
            getSys().showToast?.('يرجى تعبئة الاسم ورقم الهوية وإرفاق الصور الثلاث بوضوح', 'error');
            return;
        }
        
        this._isSubmittingKyc = true;
        getSys().toggleLoader?.(true, 'جاري تشفير ورفع الملفات...');
        
        try {
            const userId = DataManager.user.id || 'unknown_user';
            const kycTimestamp = Date.now();

            const oldKycData = DataManager.user.kycData;
            if (oldKycData) {
                const oldUrls = [oldKycData.frontImg, oldKycData.backImg, oldKycData.selfieImg].filter(Boolean);
                oldUrls.forEach(url => {
                    if (FirebaseAdapter.deleteImageByUrl) {
                        FirebaseAdapter.deleteImageByUrl(url).catch(() => {});
                    }
                });
            }
            
            const uploadPromises = [
                FirebaseAdapter.uploadImage(frontFile, 'kyc_docs', `${userId}_front_${kycTimestamp}.webp`),
                FirebaseAdapter.uploadImage(backFile, 'kyc_docs', `${userId}_back_${kycTimestamp}.webp`),
                FirebaseAdapter.uploadImage(selfieFile, 'kyc_docs', `${userId}_selfie_${kycTimestamp}.webp`)
            ];
            
            const results = await Promise.allSettled(uploadPromises);
            const failedUploads = results.filter(r => r.status === 'rejected');
            
            if (failedUploads.length > 0) {
                const successfulUploads = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                if (successfulUploads.length > 0) {
                    successfulUploads.forEach(url => {
                        if (FirebaseAdapter.deleteImageByUrl) FirebaseAdapter.deleteImageByUrl(url).catch(()=>{});
                    });
                }
                throw new Error("فشل رفع إحدى الصور.");
            }
            const [frontImgUrl, backImgUrl, selfieImgUrl] = results.map(r => r.value);
            
            let success = false;
            if (DataManager.updateUserProfile) {
                const safeFullName = fullName.replace(/[<>"{}[\]\\]/g, ''); 
                success = await DataManager.updateUserProfile({
                    fullName: safeFullName, kycStatus: 'pending',
                    // 🚀 [إصلاح منطقي]: دمج البيانات القديمة بدلاً من مسحها بالكامل
                    kycData: { ...(oldKycData || {}), idNumber: idNumber, frontImg: frontImgUrl, backImg: backImgUrl, selfieImg: selfieImgUrl, submittedAt: Date.now() }
                });
            }
            
            if (!success) throw new Error("فشل تحديث بيانات الحساب.");
            
            this.closeKycModal(); 
            getSys().showToast?.('تم إرسال مستندات التوثيق بنجاح! طلبك قيد المراجعة.', 'success');
            this.renderKycUI();
            
        } catch (e) {
            console.error('KYC Upload Error:', e);
            getSys().showToast?.('تعذر إرسال المستندات، يرجى المحاولة مجدداً', 'error');
        } finally {
            this._isSubmittingKyc = false;
            getSys().toggleLoader?.(false);
        }
    },

    renderKycUI: function() {
        if (!DataManager.user) return;
        const user = DataManager.user;
        const status = user.kycStatus || 'none';
        
        // ✅ التعديل الاحترافي: الشارة تظهر فقط عند قبول الهوية (KYC) من الإدارة
        // تم إلغاء ربطها بـ (isVerified) لأنها تعني فقط إكمال البيانات الأساسية
        const isKycApproved = (status === 'approved' || status === 'verified');
        
        const userNames = document.querySelectorAll('.user-display-name, .sb-name, #display-name, #cs-name');
        userNames.forEach(el => {
            const oldBadge = el.querySelector('.pro-verified-badge');
            if (oldBadge) oldBadge.remove();
            
            // إضافة الشارة فقط إذا كان الحساب موثقاً بقرار إداري (approved)
            if (isKycApproved) {
                el.insertAdjacentHTML('beforeend', `<span class="pro-verified-badge" title="حساب موثق"><i class="fa-solid fa-certificate badge-star"></i><i class="fa-solid fa-check badge-check"></i></span>`);
            }
        });
        
        const kycContainer = document.getElementById('sidebar-kyc-container');
        if (!kycContainer) return;

        const settings = LiveStoreData.settings || {};
        const kycConfig = settings.kycConfig || { mode: 'off', targetedTiers: [] };
        
        // التحقق هل النظام يفرض KYC على هذا المستخدم حالياً؟
        let isRequiredBySystem = false;
        if (kycConfig.mode === 'all') {
            isRequiredBySystem = true;
        } else if (kycConfig.mode === 'specific' || kycConfig.mode === 'spec') {
            const targets = kycConfig.targetedTiers || [];
            if (targets.map(id => String(id)).includes(String(user.tierId))) {
                isRequiredBySystem = true;
            }
        }

        // إذا تم قبول التوثيق فعلياً، أو لم يكن التوثيق مطلوباً، نفرغ الحاوية الجانبية
        if (isKycApproved || !isRequiredBySystem) {
            kycContainer.innerHTML = ''; return;
        }

        // عرض بانر الحالة في القائمة الجانبية (قيد المراجعة أو مطلوب الرفع)
        if (status === 'pending') {
            kycContainer.innerHTML = `<div class="sb-kyc-banner kyc-pending" data-action="open-kyc-status" data-state="pending"><span><i class="fa-solid fa-hourglass-half"></i> هويتك قيد المراجعة</span><i class="fa-solid fa-chevron-left"></i></div>`;
        } else {
            // تظهر فقط إذا لم يرفع الوثائق أو تم رفضه سابقاً
            kycContainer.innerHTML = `<div class="sb-kyc-banner kyc-required" data-action="open-kyc-upload"><span><i class="fa-solid fa-shield-halved"></i> التحقق من الهوية (KYC)</span><i class="fa-solid fa-chevron-left"></i></div>`;
        }
    },    prepareKycModalState: function() {
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

    closeKycModal: function() { 
        this.kycFiles = {}; 
        getSys().closeModal?.('kyc-upload'); 
    },
    
    openKycStatusModal: function(state) {
        getSys().closeSidebar?.();
        const content = document.getElementById('kyc-status-content');
        if(!content) return;
        
        if (state === 'approved' || state === 'verified') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-shield-halved kyc-status-icon verified"></i><h3 class="fw-bold text-main mb-10">حسابك موثق ومحمي</h3><p class="text-muted fs-13 line-height-lg">بياناتك محفوظة بأعلى معايير التشفير. يمكنك الآن الإيداع والشراء بكامل الصلاحيات.</p></div>`;
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

        if (!isKycApproved) { localStorage.removeItem(celebrationKey); return; }
        if (localStorage.getItem(celebrationKey)) return;

        localStorage.setItem(celebrationKey, 'true');
        setTimeout(() => { getSys().openModal?.('kyc-celebration'); getSys().sfx?.('success'); }, 1500);
    },
    
    closeKycStatusModal: function() { getSys().closeModal?.('kyc-status'); },

    // =========================================================
    // 👑 مستويات وعضويات הـ VIP
    // =========================================================
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
        let finalIconClass = `fa-solid fa-${rawIcon.replace(/fa-solid|fa-regular|fa-brands|fa-/g, '').trim()}`;
        const tierColor = currentTier.color || 'var(--primary)';
        
        const user = DataManager.user || {};
        const userBaseCurrency = (user.baseCurrency || user.base_currency || 'USD').toUpperCase();
        const currencySymbol = RenderHelpers ? RenderHelpers.getCurrencySymbolText(userBaseCurrency) : '$';
        
        let html = `
                <div class="tm-wrapper">
                    <div class="tm-icon-box" style="color: ${tierColor};">
                        <i class="${finalIconClass} tm-icon"></i>
                    </div>
                    <h3 class="tm-title">${Utils.escapeHtml(currentTier.name)}</h3>
                    <p class="tm-desc">مستواك الحالي هو <span class="tm-text-highlight" style="color: ${tierColor};">${Utils.escapeHtml(currentTier.name)}</span>. للارتقاء بتجربتك والحصول على مزايا وأسعار أفضل، قم بزيادة مبيعاتك خلال المدة المحددة.</p>
            `;
        
        if (isAutoAdvanceEnabled) {
            let targetPhraseHtml = isMaxTier ? `للحفاظ على باقتك ومميزاتك الحالية.` : `للوصول لـ <span class="tm-text-highlight text-main">${Utils.escapeHtml(targetNameDisplay)}</span>.`;
            
            if (isGoalReached) {
                html += `
                        <div class="tm-top-tier-card" style="border-top-color: ${tierColor};">
                            <div class="tm-top-icon" style="color: ${tierColor};"><i class="${finalIconClass}"></i></div>
                            <div class="tm-top-title" style="color: ${tierColor};">تهانينا، أنت في القمة!</div>
                            <div class="tm-top-desc">لقد حققت الهدف وتصل الآن لأعلى مستوى متاح في المتجر لتتمتع بأفضل الأسعار. استمر في نشاطك للحفاظ على هذه المكانة الحصرية.</div>
                        </div>`;
            } else {
                html += `
                        <div class="tm-progress-card">
                            <div class="tm-progress-header">
                                <span class="tm-percent num-en">${percent.toFixed(0)}%</span>
                                <div class="tm-bar-bg"><div class="tm-bar-fill" style="width: ${percent}%; background: ${tierColor};"></div></div>
                                <span class="tm-duration-badge num-en">${remainingDays} يوم متبقي</span>
                            </div>
                            <div class="tm-footer-text">
                                يتوجب عليك إنفاق <span class="tm-amount-text num-en" dir="ltr">${remainingAmt.toFixed(2)} ${currencySymbol}</span> إضافية خلال <span class="tm-text-highlight text-warning">${remainingDays} يوماً</span> ${targetPhraseHtml}
                            </div>
                        </div>`;
            }
            
            const allTiers = (LiveStoreData.tiers || []);
            if (allTiers.length > 0) {
                const sortedTiers = [...allTiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
                
                html += `<div class="tm-roadmap-section"><h4 class="tm-roadmap-title"><i class="fa-solid fa-map-location-dot"></i> خريطة طريق مستويات VIP</h4><div class="tm-roadmap-list">`;
                
                sortedTiers.forEach(t => {
                    const isUserCurrent = String(t.id) === String(currentTier.id);
                    const tColor = t.color || 'var(--text-gray)';
                    let finalIconClassT = `fa-solid fa-${(t.icon || 'medal').replace(/fa-solid|fa-regular|fa-brands|fa-/g, '').trim()}`;
                    
                    const badgeHtml = isUserCurrent ? `<span class="tm-badge-active" style="background: ${tierColor};">مستواك الحالي</span>` : `<span class="tm-badge-locked">مغلق</span>`;
                    const stateClass = isUserCurrent ? 'active' : 'locked';
                    
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
                                <div class="tm-item-right">${badgeHtml}</div>
                            </div>`;
                });
                html += `</div></div>`;
            }
        } else {
            html += `<div class="tm-alert-box mt-15" style="background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.12); padding: 16px; border-radius: 16px; display: block; text-align: right; width: 100%;"><span class="nm-reply-head text-danger tm-text-highlight d-block mb-8" style="font-weight: 800; font-size: 13.5px;"><i class="fa-solid fa-circle-info"></i> تنبيه إداري</span><div class="nm-reply-body text-main line-height-lg" style="font-size: 13px; color: var(--text-gray); font-weight: 600;">${Utils.escapeHtml(pausedMsg)}</div></div>`;
        }
        
        html += `</div>`;
        content.innerHTML = html;
        getSys().openModal?.('tier-info');
    }
};