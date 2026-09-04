// ============================================================================
// 🪪 وحدة الهوية والأمان (uiAuth.js) - الإصدار المؤسسي V17.1 💎
// 🎯 الوظيفة: الملف الشخصي، التوثيق (KYC)، الأمان، الـ Native 2FA، والبصمة الحيوية
// 🚀 التحديثات المعمارية (V17.1 - Master Patch):
// 1. Error Memory Leak Fix 🛡️: تنظيف الكائنات من الذاكرة العشوائية حتى في حالات فشل معالجة الصور.
// 2. UX Sync Shield 🛡️: تحويل تعديل الاسم لـ Async لانتظار رد السيرفر وإيقاف التحديث الكاذب.
// 3. Zombie Files Wipe 🛡️: تدمير كائنات الـ KYC من الذاكرة إذا ألغى العميل العملية.
// 4. Path Traversal Shield: إنشاء أسماء عشوائية آمنة للصور لتجنب حقن مسارات خبيثة.
// ============================================================================

import { DB_KEYS, CACHE_KEYS, DYNAMIC_PREFIXES } from '../config.js'; 
import * as Utils from '../utils.js'; 
import { DataManager, LiveStoreData, StoreDB } from '../dataManager.js';
import { FirebaseAdapter, auth } from '../core/firebaseAdapter.js';
import { RenderHelpers } from '../core/renderHelpers.js';

const DEFAULT_AVATAR_URL = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

// توجيه ذكي وآمن للواجهة لضمان التوافق مع بنية V17 الجديدة
const getSys = () => {
    if (typeof window !== 'undefined') {
        if (window.UIManager) return window.UIManager;
        if (window.ClientSystem) return window.ClientSystem;
    }
    return new Proxy({}, { get: (target, prop) => () => { console.warn(`🚨 System not ready for: ${String(prop)}`); } });
};

export const UIAuth = {

    kycFiles: {},
    _processingImgs: new Set(), 

    // 🛡️ التحديث المعماري 1: حماية الذاكرة (Memory Leak Shield) الشاملة
    _compressImage: function(file, maxWidth = 1000) {
        return new Promise((resolve, reject) => {
            const watchdog = setTimeout(() => {
                reject(new Error("نفد وقت معالجة الصورة، يرجى المحاولة بصورة أصغر."));
            }, 15000); 

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
                        if (!ctx) throw new Error("تعذر إنشاء مساحة العمل للصورة.");
                        
                        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        canvas.toBlob((blob) => {
                            clearTimeout(watchdog); 
                            if (!blob) return reject(new Error("فشل ضغط الصورة."));
                            
                            const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
                            const safeFileName = `secure_img_${Date.now()}_${uniqueId}.webp`;
                            
                            const compressedFile = new File([blob], safeFileName, { type: 'image/webp' });
                            resolve({ file: compressedFile, previewUrl: URL.createObjectURL(blob) });
                            
                            // تنظيف الذاكرة
                            canvas.width = 0; canvas.height = 0; 
                            img.src = ''; img.onload = null; img.onerror = null;
                        }, 'image/webp', 0.80);
                    } catch (error) { 
                        clearTimeout(watchdog);
                        // تنظيف الذاكرة في حال الفشل
                        img.src = ''; img.onload = null; img.onerror = null;
                        reject(error); 
                    }
                };
                img.onerror = () => { 
                    clearTimeout(watchdog); 
                    img.src = ''; img.onload = null; img.onerror = null; // تنظيف
                    reject(new Error("ملف الصورة تالف أو غير صالح.")); 
                };
                img.src = e.target.result;
            };
            reader.onerror = () => { clearTimeout(watchdog); reject(new Error("تعذر قراءة الملف.")); };
            reader.readAsDataURL(file);
        });
    },

    openProfileInfo: function() {
        const sys = getSys();
        sys.resetUI?.();
        if(DataManager.syncUser) DataManager.syncUser();
        this.updateProfileDisplay();

        if (!DataManager.user) return;
        const user = DataManager.user;
        
        const isVerified = (user.isVerified === true || String(user.isVerified) === 'true' || user.kycStatus === 'approved' || user.kycStatus === 'verified'); 

        const fallbackName = (user.fullName || user.name || (user.firstName ? `${user.firstName} ${user.lastName || ''}` : 'العميل')).trim();
        const fullName = sys._getFullName ? sys._getFullName(user) : fallbackName;
        
        const usernameVal = user.username ? `${user.username}` : '---';
        const countryTxt = user.countryName || user.country || 'غير محدد';
        const emailTxt = (user.email && user.email.trim()) ? user.email : 'غير محدد';
        const phoneTxt = (user.phone && user.phone.trim()) ? user.phone : 'غير محدد';
        const idTxt = RenderHelpers.formatUserId(user);

        window.requestAnimationFrame(() => {
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
                usernameEl.classList.add('clickable');
            }
            
            if(emailEl) {
                emailEl.textContent = emailTxt;
                emailEl.setAttribute('data-action', 'copy-text');
                emailEl.setAttribute('data-text', emailTxt);
                emailEl.classList.add('clickable');
            }

            if(phoneEl) {
                phoneEl.innerHTML = `<span dir="ltr">${Utils.escapeHtml(phoneTxt)}</span>`;
                const phoneCard = phoneEl.closest('.info-card-item');
                if (phoneCard) {
                    phoneCard.classList.add('clickable');
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
                    idWrap.classList.add('clickable');
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
            
            if(imgEl) {
                imgEl.src = currentAvatar;
                imgEl.classList.add('clickable');
                imgEl.setAttribute('data-action', 'handle-avatar-click');
            }
            if(sidebarAvatar) sidebarAvatar.src = currentAvatar;
            
            if(cameraBtn) { cameraBtn.setAttribute('data-action', 'handle-avatar-click'); }

            const deleteAvatarBtn = document.getElementById('inline-delete-avatar-btn');
            if (deleteAvatarBtn) {
                const hasCustomImage = user.img && user.img.trim() !== '' && user.img !== DEFAULT_AVATAR_URL;
                deleteAvatarBtn.classList.toggle('active', !!hasCustomImage);
            }

            if(fileInput && !fileInput.dataset.eventBound) {
                fileInput.dataset.eventBound = "true";
                fileInput.addEventListener('change', async (e) => {
                    const originalFile = e.target.files && e.target.files[0];
                    
                    if (!originalFile || !originalFile.type.startsWith('image/')) {
                        sys.showToast?.('عذراً، يجب إرفاق ملف صورة صالح', 'error');
                        e.target.value = ''; return;
                    }
                    
                    if (originalFile.size > 5 * 1024 * 1024) { 
                        sys.showToast?.('حجم الصورة كبير جداً! اختر صورة أقل من 5MB', 'warning');
                        e.target.value = ''; return;
                    }

                    const liveImgEl = document.getElementById('profile-img');
                    const liveSidebarAvatar = document.getElementById('cs-avatar');
                    const liveDeleteBtn = document.getElementById('inline-delete-avatar-btn');

                    const avatarWrapper = document.querySelector('.profile-container .avatar-wrapper');
                    if (avatarWrapper) avatarWrapper.classList.add('is-loading');

                    const shield = document.createElement('div');
                    shield.id = 'invisible-tx-shield';
                    document.body.appendChild(shield);

                    let downloadUrl = null;
                    let compressed = null;

                    try {
                        compressed = await this._compressImage(originalFile, 400); 
                        
                        if(liveImgEl) {
                            if (liveImgEl.src && liveImgEl.src.startsWith('blob:')) URL.revokeObjectURL(liveImgEl.src);
                            liveImgEl.src = compressed.previewUrl; 
                        }
                        if(liveSidebarAvatar) {
                            if (liveSidebarAvatar.src && liveSidebarAvatar.src.startsWith('blob:')) URL.revokeObjectURL(liveSidebarAvatar.src);
                            liveSidebarAvatar.src = compressed.previewUrl; 
                        }

                        const oldImageUrl = DataManager.user.img; 
                        const secureStorageName = `avatar_${DataManager.user.id}_${Date.now()}_${Math.random().toString(36).substring(2,8)}.webp`;
                        downloadUrl = await FirebaseAdapter.uploadImage(compressed.file, 'avatars', secureStorageName);               
                        
                        const dbUpdateSuccess = DataManager.updateUserProfile ? await DataManager.updateUserProfile({ img: downloadUrl }) : false;
                        
                        if (dbUpdateSuccess) {
                            try { localStorage.setItem(DYNAMIC_PREFIXES.USER_IMAGE + DataManager.user.id, downloadUrl); } 
                            catch(err) {}

                            if (oldImageUrl && oldImageUrl !== DEFAULT_AVATAR_URL && FirebaseAdapter.deleteImageByUrl) {
                                FirebaseAdapter.deleteImageByUrl(oldImageUrl).catch(()=>{});
                            }

                            if (liveDeleteBtn) liveDeleteBtn.classList.add('active');

                            sys.showToast?.('تم تحديث الصورة الشخصية بنجاح', 'success');
                            sys.sfx?.('success');
                            downloadUrl = null; 
                        } else {
                            throw new Error("قاعدة البيانات رفضت التحديث.");
                        }
                        
                    } catch (err) {
                        sys.showToast?.('عذراً، تعذر حفظ الصورة، قد تكون تالفة أو الاتصال ضعيف.', 'error');
                        
                        if (downloadUrl && FirebaseAdapter.deleteImageByUrl) {
                            FirebaseAdapter.deleteImageByUrl(downloadUrl).catch(()=>{});
                        }

                        const fallbackImg = DataManager.user.img || DEFAULT_AVATAR_URL;
                        if(liveImgEl) liveImgEl.src = fallbackImg; 
                        if(liveSidebarAvatar) liveSidebarAvatar.src = fallbackImg; 
                    } finally {
                        if (compressed && compressed.previewUrl) URL.revokeObjectURL(compressed.previewUrl);
                        if (avatarWrapper) avatarWrapper.classList.remove('is-loading');
                        shield.remove();
                        e.target.value = ''; 
                    }
                });
            }

            sys.openModal?.('profile-info');
        });
    },    
    
    // 🛡️ التحديث المعماري 2: تجميد الواجهة والانتظار (UX Sync Shield)
    toggleNameEdit: async function() {
        const sys = getSys();
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
            
            if (newVal.length < 2) { sys.showToast?.('الاسم قصير جداً، يرجى كتابة اسم صحيح', 'warning'); return; }
            if (newVal.length > 40) { sys.showToast?.('الاسم طويل جداً، يرجى كتابة اسم أقصر', 'warning'); return; }
            
            const currentFullName = DataManager.user?.fullName || DataManager.user?.name || '';
            if (DataManager.user && newVal !== currentFullName) {
                const nameParts = newVal.split(' ');
                const newFirstName = nameParts[0];
                const newLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
                
                sys.toggleLoader?.(true, 'جاري تحديث الاسم...');
                const success = await DataManager.updateUserProfile({ 
                    firstName: newFirstName, 
                    lastName: newLastName, 
                    fullName: newVal 
                });
                sys.toggleLoader?.(false);
                
                if (success) {
                    nameEl.textContent = newVal; 
                    sys.showToast?.('تم تحديث الاسم بنجاح', 'success');
                    if (typeof this.updateProfileDisplay === 'function') this.updateProfileDisplay();
                    
                    inpEl.value = newVal;
                    inpEl.classList.add('d-none');
                    nameEl.classList.remove('d-none');
                    btn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                } else {
                    sys.showToast?.('تعذر تحديث الاسم، يرجى المحاولة لاحقاً', 'error');
                }
            } else {
                inpEl.classList.add('d-none');
                nameEl.classList.remove('d-none');
                btn.innerHTML = '<i class="fa-solid fa-pen"></i>';
            }
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
        
        const sys = getSys();
        const state = sys.State || {};
        
        if (state.activeListeners && state.activeListeners.has('avatarMenu')) {
            document.removeEventListener('click', state.activeListeners.get('avatarMenu'));
            state.activeListeners.delete('avatarMenu');
        }
        
        menu.classList.toggle('active');
        
        if (menu.classList.contains('active')) {
            const listener = (e) => {
                if (!menu.contains(e.target) && !e.target.closest('#avatar-menu-trigger') && !e.target.closest('#profile-img')) {
                    menu.classList.remove('active');
                    document.removeEventListener('click', listener);
                    if (state.activeListeners) state.activeListeners.delete('avatarMenu');
                }
            };
            if (state.activeListeners) state.activeListeners.set('avatarMenu', listener);
            setTimeout(() => document.addEventListener('click', listener), 10);
        }
    },
    
    closeProfileInfo: function() { 
        getSys().closeModal?.('profile-info'); 
    },

    updateProfileDisplay: function() {
        try {
            const sys = getSys();
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
                
                if (alertCard) alertCard.classList.add('d-none');
                if (kycContainer) kycContainer.classList.add('d-none');
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
            const fullName = sys._getFullName ? sys._getFullName(user) : fallbackName;
            
            const nameEl = document.getElementById('cs-name');
            const displayNameEl = document.getElementById('display-name');
            
            if (nameEl) nameEl.textContent = fullName;
            if (displayNameEl) displayNameEl.textContent = fullName;
            
            if (alertCard) {
                const hasCurrency = (user.baseCurrency && user.baseCurrency.trim() !== '') || (user.base_currency && user.base_currency.trim() !== '');
                const hasData = (user.phone && user.phone.trim() !== '') && (user.country && user.country !== '');
                const isIdentityComplete = ((user.isVerified === true || String(user.isVerified) === 'true') || hasData) && hasCurrency;
                
                if (isIdentityComplete) {
                    alertCard.classList.add('d-none');
                    alertCard.style.pointerEvents = 'none';
                    alertCard.removeAttribute('data-action');
                    alertCard.onclick = null;
                } else {
                    alertCard.classList.remove('d-none');
                    alertCard.style.pointerEvents = 'auto';
                    alertCard.setAttribute('data-action', 'open-identity-sidebar');
                }
            }
            
            const sidebarAvatar = document.getElementById('cs-avatar');
            if (sidebarAvatar) {
                sidebarAvatar.src = user.img || DEFAULT_AVATAR_URL;
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
        const sys = getSys();
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
            try { localStorage.removeItem(DYNAMIC_PREFIXES.USER_IMAGE + DataManager.user.id); } catch(e) {}
            
            if (oldImageUrl && oldImageUrl !== DEFAULT_AVATAR_URL && FirebaseAdapter.deleteImageByUrl) {
                FirebaseAdapter.deleteImageByUrl(oldImageUrl).catch(()=>{});
            }
            
            sys.showToast?.('تم حذف الصورة الشخصية', 'success'); 
            sys.sfx?.('success'); 
        } catch(e) { 
            sys.showToast?.('تعذر حذف الصورة', 'error'); 
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
                const isHex = /^#([0-9A-F]{3}){1,2}$/i.test(tierColor);
                if (isHex) {
                    let hex = tierColor.replace('#', '');
                    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                        tierBtn.style.setProperty('--tier-rgb', `${r}, ${g}, ${b}`);
                    } else {
                        tierBtn.style.setProperty('--tier-rgb', '255, 215, 0');
                    }
                } else {
                    tierBtn.style.setProperty('--tier-rgb', '255, 215, 0');
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
        
        let savedImage = null;
        try { savedImage = localStorage.getItem(DYNAMIC_PREFIXES.USER_IMAGE + DataManager.user.id); } 
        catch(e) {}
        
        if(savedImage) { this.applyUserImage(savedImage); } 
        else if(DataManager.user.img) { this.loadUserImageWithFallback(DataManager.user.img); } 
        else { this.loadUserImageWithFallback(DEFAULT_AVATAR_URL); }
    },
    
    loadUserImageWithFallback: function(imageUrl) {
        if (!DataManager.user) return;
        const tempImg = new Image();
        tempImg.onload = () => { 
            this.applyUserImage(imageUrl); 
            try { localStorage.setItem(DYNAMIC_PREFIXES.USER_IMAGE + DataManager.user.id, imageUrl); }
            catch(e) {}
        };
        tempImg.onerror = () => { 
            this.applyUserImage(DEFAULT_AVATAR_URL); 
            try { localStorage.setItem(DYNAMIC_PREFIXES.USER_IMAGE + DataManager.user.id, DEFAULT_AVATAR_URL); }
            catch(e) {}
        };
        tempImg.src = imageUrl;
    },

    applyUserImage: function(imageUrl) {
        const sidebarAvatar = document.getElementById('cs-avatar');
        if(!sidebarAvatar) return;
        sidebarAvatar.src = imageUrl;
        setTimeout(() => { sidebarAvatar.classList.remove('loading'); }, 300);
    },

    openSecurityModal: function() {
        const sys = getSys();
        sys.resetUI?.();
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

        sys.openModal?.('security');
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
        const sys = getSys();
        const isCurrentlyEnabled = DataManager.is2FAEnabled ? DataManager.is2FAEnabled() : false;
        
        if (isCurrentlyEnabled) {
            sys.toggleLoader?.(true, 'جاري إيقاف الحماية...');
            const result = await DataManager.unenrollMFA();
            sys.toggleLoader?.(false);
            
            if (result.success) {
                sys.showToast?.('تم إيقاف المصادقة الثنائية', 'info');
                this.openSecurityModal(); 
            } else {
                sys.showToast?.(result.msg, 'error');
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

            const storeName = LiveStoreData.settings?.storeName || 'MaliMor';
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
                        if (document.getElementById('qrcode-lib-script')) {
                            let attempts = 0; 
                            const checkInterval = setInterval(() => {
                                attempts++;
                                if (typeof window.QRCode !== 'undefined') { 
                                    clearInterval(checkInterval); resolve(); 
                                } else if (attempts > 50) { 
                                    clearInterval(checkInterval); reject(new Error("Timeout loading QR library")); 
                                }
                            }, 100);
                        } else {
                            const script = document.createElement('script');
                            script.id = 'qrcode-lib-script';
                            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.1/qrcode.min.js';
                            script.integrity = 'sha512-1m3PjBwTXX71aQhL/r/118XnI2a1V7Yf5tEETqjGokHqGqI/J0Qe2OqTNDH+0n0BfK2Rbx8u0D0Wl4y1C/tN2A==';
                            script.crossOrigin = 'anonymous';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        }
                    });
                }
                
                const liveContainer = document.getElementById('qrcode-container'); 
                if (liveContainer && typeof window.QRCode !== 'undefined') {
                    const qrDataUrl = await window.QRCode.toDataURL(qrUri, { color: { dark: '#111a2b', light: '#ffffff' }, width: 200, margin: 1 });
                    liveContainer.innerHTML = `<img src="${qrDataUrl}" class="qr-code-img" alt="2FA QR Code">`;
                } else if (liveContainer) {
                    liveContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);"><i class="fa-solid fa-shield-halved fa-2x mb-10"></i><br>يرجى إدخال الكود النصي يدوياً في التطبيق.</div>`;
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

    handleBiometricToggle: async function() {
        const sys = getSys();
        const user = DataManager.user;
        const isCurrentlyEnabled = user?.biometricEnabled === true;
        
        if (isCurrentlyEnabled) {
            sys.toggleLoader?.(true, 'جاري إيقاف قفل البصمة...');
            try {
                const success = await DataManager.updateUserProfile({ biometricEnabled: false, biometricRawId: null });
                if (success) {
                    try { localStorage.removeItem(CACHE_KEYS.BIOMETRIC_KEY); } catch (e) {}
                    sys.showToast?.('تم إيقاف قفل البصمة بنجاح', 'info');
                    this.openSecurityModal();
                } else {
                    sys.showToast?.('تعذر إيقاف البصمة، يرجى المحاولة لاحقاً', 'error');
                }
            } finally { sys.toggleLoader?.(false); }
            return;
        }
        
        if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
            sys.showToast?.('عذراً، متصفحك لا يدعم البصمة أو أن الاتصال غير آمن (HTTPS مطلوب)', 'error');
            return;
        }
        
        try {
            sys.toggleLoader?.(true, 'يرجى تأكيد بصمتك لربط الجهاز...');
            
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            const userEmail = user?.email || 'user@store.local';
            const userIdBytes = new TextEncoder().encode(userEmail);
            const storeName = LiveStoreData.settings?.storeName || "MaliMor Store";
            
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: Utils.escapeHtml(storeName) },
                    user: { id: userIdBytes, name: userEmail, displayName: userEmail },
                    pubKeyCredParams: [
                        { alg: -7, type: "public-key" },
                        { alg: -257, type: "public-key" }
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required"
                    },
                    timeout: 60000
                }
            });
            
            const rawIdBytes = new Uint8Array(credential.rawId);
            const binaryString = Array.from(rawIdBytes).map(b => String.fromCharCode(b)).join('');
            const rawIdBase64 = btoa(binaryString);
            
            const success = await DataManager.updateUserProfile({
                biometricEnabled: true,
                biometricRawId: rawIdBase64
            });
            
            if (success) {
                try { localStorage.setItem(CACHE_KEYS.BIOMETRIC_KEY, rawIdBase64); } catch (e) {}
                sys.showToast?.('تم تفعيل قفل البصمة بنجاح!', 'success');
                sys.sfx?.('success');
                this.openSecurityModal();
            } else {
                throw new Error('server_error');
            }
        } catch (error) {
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                sys.showToast?.('تم إلغاء عملية البصمة من قبلك', 'warning');
            } else if (error.message === 'storage_full') {
                sys.showToast?.('تعذر تفعيل البصمة (التصفح المخفي يمنع حفظ البيانات)', 'error');
            } else if (error.name === 'SecurityError') {
                sys.showToast?.('بيئة غير آمنة. البصمة تتطلب اتصال HTTPS', 'error');
            } else {
                sys.showToast?.('تعذر تفعيل البصمة، تأكد من إعدادات القفل في جهازك', 'error');
            }
        } finally {
            sys.toggleLoader?.(false);
        }
    },
    
    handlePasswordSubmit: function() {
        const sys = getSys();
        const securityModal = document.getElementById('security-modal');
        if (!securityModal) return;
        
        const currentInput = securityModal.querySelector('#pass-current');
        const newInput = securityModal.querySelector('#pass-new');
        const confirmInput = securityModal.querySelector('#pass-confirm');
        
        const currentVal = (currentInput?.value || '').trim();
        const newVal = (newInput?.value || '').trim();
        const confirmVal = (confirmInput?.value || '').trim();
        
        if (!currentVal || !newVal || !confirmVal) {
            sys.showToast?.('يرجى تعبئة جميع الحقول', 'warning'); return;
        }
        if (newVal.length < 6) {
            sys.showToast?.('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل', 'warning'); return;
        }
        if (newVal !== confirmVal) {
            sys.showToast?.('كلمة المرور الجديدة غير متطابقة', 'error'); return;
        }
        
        if (!DataManager || typeof DataManager.submitPasswordChange !== 'function') return;
        
        DataManager.submitPasswordChange(currentVal, newVal, confirmVal).then(result => {
            if (result.success) {
                sys.showToast?.('تم تحديث كلمة المرور بنجاح!', 'success');
                sys.sfx?.('success');
                [currentInput, newInput, confirmInput].forEach(el => { if (el) el.value = ''; });
                setTimeout(() => { sys.closeSecurityModal?.(); }, 1000);
            } else {
                sys.showToast?.(result.msg, 'error');
                sys.sfx?.('error');
            }
        });
    },

    sendResetPasswordEmail: async function() {
        const sys = getSys();
        const user = DataManager?.user;
        if (!user || !user.email) {
            sys.showToast?.('لا يوجد بريد إلكتروني مرتبط بهذا الحساب لإرسال الرابط!', 'error');
            sys.sfx?.('error');
            return;
        }
        
        sys.toggleLoader?.(true, 'جاري إرسال رابط التعيين...');
        
        try {
            const result = await DataManager.sendPasswordResetEmail(user.email);
            sys.toggleLoader?.(false); 
            
            if (result.success) {
                sys.closeSecurityModal?.(); 
                sys.showToast?.('تم إرسال رابط التعيين إلى بريدك الإلكتروني بنجاح', 'success');
                sys.sfx?.('success');
            } else {
                sys.showToast?.(result.msg, 'error'); 
                sys.sfx?.('error');
            }
        } catch (error) {
            sys.toggleLoader?.(false);
            sys.showToast?.('حدث خطأ أثناء إرسال الرابط، يرجى المحاولة لاحقاً', 'error');
        }
    },

    selectRegCurrency: function(name, code) {
        const textEl = document.getElementById('selected-currency-text');
        const hiddenInput = document.getElementById('reg-currency');
        const dropdown = document.getElementById('reg-currency-dropdown');
        
        if (textEl) { textEl.innerText = name; textEl.style.color = 'var(--text-main)'; }
        if (hiddenInput) { hiddenInput.value = code; }
        if (dropdown) { dropdown.classList.remove('open'); }
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
    },

    saveIdentityData: async function() {
        const sys = getSys();
        const btn = document.querySelector('[data-action="save-identity"]');
        if (sys.State?.isSavingIdentity || (btn && btn.disabled)) return;
        
        if (DataManager.user && (DataManager.user.isVerified === true || String(DataManager.user.isVerified) === 'true')) {
            sys.showToast?.('بياناتك مؤكدة مسبقاً! لا يمكنك تعديل العملة الأساسية بعد ربط المحفظة.', 'error');
            sys.closeModal?.('identity');
            return;
        }
        
        const countryEl = document.getElementById('selected-country-text');
        const hiddenCountry = document.getElementById('reg-country');
        const phoneEl = document.getElementById('reg-phone');
        const hiddenCurrency = document.getElementById('reg-currency');
        
        const country = hiddenCountry ? hiddenCountry.value.trim() : (countryEl ? countryEl.innerText.trim() : '');
        let phoneRaw = phoneEl ? phoneEl.value.trim() : '';
        let phone = phoneRaw.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
        const currency = (hiddenCurrency ? hiddenCurrency.value.trim().toUpperCase() : '') || DataManager.user?.baseCurrency || 'USD';
        
        if (!country || country === 'اختر الدولة...' || !cleanPhone || cleanPhone === '' || !currency) {
            sys.showToast?.('يرجى تعبئة جميع الحقول بدقة', 'warning');
            return;
        }
        
        if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
            sys.showToast?.('رقم الهاتف غير صالح، يرجى كتابة أرقام صحيحة.', 'error');
            return;
        }
        
        if (sys.State) sys.State.isSavingIdentity = true;
        let originalBtnHtml = '';
        
        if (btn) {
            originalBtnHtml = btn.innerHTML; 
            btn.disabled = true; 
            const btnWidth = btn.offsetWidth; 
            if (btnWidth > 0) btn.style.width = `${btnWidth}px`;
            btn.innerHTML = '<span class="btn-content"><i class="fa-solid fa-spinner fa-spin"></i> جاري الربط...</span>';
        }
        
        try {
            const result = await DataManager.submitIdentityData(country, cleanPhone, currency);
            
            if (result && result.success) {
                if (typeof this.updateProfileDisplay === 'function') this.updateProfileDisplay();
                sys.updateDisplayCurrencyUI?.(DataManager.selectedCurr);
                sys.updateDisplayBalance?.();
                
                const inputsWrap = document.getElementById('identity-inputs-wrap');
                const statusWrap = document.getElementById('identity-verified-status');
                
                if (inputsWrap) inputsWrap.style.display = 'none';
                if (statusWrap) statusWrap.classList.remove('hide-element');
                
                sys.sfx?.('success');
            } else {
                throw new Error(result?.msg || 'فشلت العملية، يرجى المحاولة لاحقاً.');
            }
        } catch (error) {
            sys.sfx?.('error');
            sys.showToast?.(error.message, 'error');
        } finally {
            if (sys.State) sys.State.isSavingIdentity = false;
            if (btn) {
                btn.disabled = false;
                btn.style.width = ''; 
                btn.innerHTML = originalBtnHtml; 
            }
        }
    },
    
    loadDynamicCurrenciesForModal: function() {
        const listTarget = document.getElementById('reg-currency-list-target');
        if (!listTarget) return;
        
        const rates = (typeof LiveStoreData !== 'undefined' && LiveStoreData.rates) ? LiveStoreData.rates : [];
        
        let html = `<div class="dropdown-item" data-action="select-reg-currency" data-code="USD" data-name="دولار أمريكي">
                        <span class="currency-name" style="flex: 1; text-align: start;">دولار أمريكي</span>
                        <span class="num-en currency-code" style="color: var(--primary); font-weight: 900;">USD</span>
                    </div>`;
        
        if (rates.length > 0) {
            rates.forEach(r => {
                if (r.isActive === false || r.code.toUpperCase() === 'USD') return;
                
                const currName = r.name || r.code; 
                
                html += `<div class="dropdown-item" data-action="select-reg-currency" data-code="${r.code}" data-name="${currName}">
                            <span class="currency-name" style="flex: 1; text-align: start;">${currName}</span>
                            <span class="num-en currency-code" style="color: var(--primary); font-weight: 900;">${r.code}</span>
                         </div>`;
            });
        }
        listTarget.innerHTML = html;
    },
    
        handleKycImage: async function(input, previewId) {
        const sys = getSys();
        if (this._processingImgs.has(previewId)) return;
        
        const file = input.files && input.files[0];
        this.kycFiles = this.kycFiles || {};
        
        const parentBox = input.closest('.kyc-upload-box');
        const previewImg = document.getElementById(previewId);
        
        if (!file) {
            delete this.kycFiles[previewId];
            if (previewImg) {
                if (previewImg.src && previewImg.src.startsWith('blob:')) {
                    URL.revokeObjectURL(previewImg.src);
                }
                previewImg.src = '';
            }
            if (parentBox) parentBox.classList.remove('has-img');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            sys.showToast?.('عذراً، يجب إرفاق ملف صورة صالح', 'error');
            input.value = '';
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            sys.showToast?.('حجم الصورة كبير جداً! اختر صورة أقل من 5MB', 'warning');
            input.value = '';
            return;
        }
        
        this._processingImgs.add(previewId);
        
        try {
            sys.toggleLoader?.(true, 'جاري معالجة الصورة...');
            const compressed = await this._compressImage(file, 1200);
            
            this.kycFiles[previewId] = compressed.file;
            
            if (previewImg) {
                if (previewImg.src && previewImg.src.startsWith('blob:')) {
                    URL.revokeObjectURL(previewImg.src);
                }
                previewImg.src = compressed.previewUrl;
            }
            if (parentBox) parentBox.classList.add('has-img');
        } catch (e) {
            sys.showToast?.('تعذر معالجة الصورة، قد تكون غير مدعومة', 'error');
            input.value = '';
        } finally {
            this._processingImgs.delete(previewId);
            sys.toggleLoader?.(false);
        }
    },

    submitKycData: async function() {
        const sys = getSys();
        if (sys.State?.isSubmittingKyc) return;
        
        const fullName = document.getElementById('kyc-full-name')?.value?.trim() || '';
        let idNumber = document.getElementById('kyc-id-number')?.value?.trim() || '';
        
        idNumber = idNumber.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        
        this.kycFiles = this.kycFiles || {};
        const files = {
            front: this.kycFiles['kyc-prev-front'],
            back: this.kycFiles['kyc-prev-back'],
            selfie: this.kycFiles['kyc-prev-selfie']
        };
        
        if (!fullName || !idNumber || !files.front || !files.back || !files.selfie) {
            sys.showToast?.('يرجى تعبئة الاسم ورقم الهوية وإرفاق الصور الثلاث بوضوح', 'error');
            return;
        }
        
        if (sys.State) sys.State.isSubmittingKyc = true;
        sys.toggleLoader?.(true, 'جاري تشفير ورفع الملفات...');
        
        try {
            const safeFullName = Utils.escapeHtml(fullName);
            const res = await DataManager.submitKycDocuments({ fullName: safeFullName, idNumber }, files);
            
            if (res.success) {
                this.closeKycModal();
                sys.showToast?.('تم إرسال مستندات التوثيق بنجاح! طلبك قيد المراجعة.', 'success');
                this.renderKycUI();
            } else {
                throw new Error(res.msg || 'فشل إرسال المستندات');
            }
            
        } catch (e) {
            console.error('KYC Upload Error:', e);
            sys.showToast?.(e.message || 'تعذر إرسال المستندات، يرجى المحاولة مجدداً', 'error');
        } finally {
            if (sys.State) sys.State.isSubmittingKyc = false;
            sys.toggleLoader?.(false);
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
            kycContainer.innerHTML = ''; return;
        }

        if (status === 'pending') {
            kycContainer.innerHTML = `<div class="sb-kyc-banner kyc-pending" data-action="open-kyc-status" data-state="pending"><span><i class="fa-solid fa-hourglass-half"></i> هويتك قيد المراجعة</span><i class="fa-solid fa-chevron-left"></i></div>`;
        } else {
            kycContainer.innerHTML = `<div class="sb-kyc-banner kyc-required" data-action="open-kyc-upload"><span><i class="fa-solid fa-shield-halved"></i> التحقق من الهوية (KYC)</span><i class="fa-solid fa-chevron-left"></i></div>`;
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

    // 🛡️ التحديث المعماري 3: تدمير كائنات ה-KYC في الذاكرة لتجنب الـ Memory Leak 
    closeKycModal: function() { 
        const previews = ['kyc-prev-front', 'kyc-prev-back', 'kyc-prev-selfie'];
        previews.forEach(id => {
            const imgEl = document.getElementById(id);
            if (imgEl && imgEl.src && imgEl.src.startsWith('blob:')) {
                URL.revokeObjectURL(imgEl.src);
                imgEl.src = '';
            }
        });
        
        const avatarInp = document.getElementById('avatar-upload-input');
        if (avatarInp) avatarInp.value = '';

        const kycModal = document.getElementById('kyc-upload-modal');
        if (kycModal) {
            kycModal.querySelectorAll('input[type="file"]').forEach(inp => inp.value = '');
        }        
        this.kycFiles = {}; // تدمير الـ File objects المخبأة
        getSys().closeModal?.('kyc-upload'); 
    },

    openKycStatusModal: function(state) {
        const sys = getSys();
        sys.closeSidebar?.();
        const content = document.getElementById('kyc-status-content');
        if(!content) return;
        
        if (state === 'approved' || state === 'verified') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-shield-halved kyc-status-icon verified"></i><h3 class="fw-bold text-main mb-10">حسابك موثق ومحمي</h3><p class="text-muted fs-13 line-height-lg">بياناتك محفوظة بأعلى معايير التشفير. يمكنك الآن الإيداع والشراء بكامل الصلاحيات.</p></div>`;
        } else if (state === 'pending') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-hourglass-half kyc-status-icon pending"></i><h3 class="fw-bold text-main mb-10">جاري مراجعة البيانات</h3><p class="text-muted fs-13 line-height-lg">طلبك الآن على طاولة الإدارة للمراجعة. قد يستغرق الأمر بعض الوقت، سيتم إشعارك فور الانتهاء.</p></div>`;
        }
        sys.openModal?.('kyc-status');
    },

    checkKycCelebration: function() {
        const sys = getSys();
        const user = DataManager.user;
        if (!user) return;
        const isKycApproved = (user.kycStatus === 'approved' || user.kycStatus === 'verified');
        const celebrationKey = DYNAMIC_PREFIXES.KYC_CELEBRATION + user.id;

        if (!isKycApproved) { 
            try { localStorage.removeItem(celebrationKey); } catch(e) {}
            return; 
        }
        
        let hasCelebrated = false;
        try { hasCelebrated = localStorage.getItem(celebrationKey); } catch(e) {}
        if (hasCelebrated) return;

        try { localStorage.setItem(celebrationKey, 'true'); } catch(e) {}
        setTimeout(() => { sys.openModal?.('kyc-celebration'); sys.sfx?.('success'); }, 1500);
    },
    
    closeKycStatusModal: function() { getSys().closeModal?.('kyc-status'); },

    // =========================================================
    // 👑 مستويات وعضويات הـ VIP
    // =========================================================
    openTierInfoModal: async function() {
        const sys = getSys();
        sys.resetUI?.();
        sys.closeSidebar?.();
        
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
            html += `<div class="tm-alert-box admin-alert mt-15"><span class="nm-reply-head text-danger tm-text-highlight d-block mb-8"><i class="fa-solid fa-circle-info"></i> تنبيه إداري</span><div class="nm-reply-body line-height-lg">${Utils.escapeHtml(pausedMsg)}</div></div>`;
        }
        
        html += `</div>`;
        content.innerHTML = html;
        sys.openModal?.('tier-info');
    },

    submitPrivateFeedback: async function() {
        const sys = getSys();
        const rawFeedback = document.getElementById('ratingFeedbackInput')?.value.trim() || '';
        const feedback = Utils.escapeHtml ? Utils.escapeHtml(rawFeedback) : rawFeedback.replace(/[<>]/g, '');
        
        if (!feedback) { sys.showToast?.("يرجى كتابة تفاصيل مقترحك أو شكواك لمساعدتنا على خدمتك", "warning"); return; }
        
        const btn = document.getElementById('btnSubmitFeedback');
        if (btn) { btn.textContent = "جاري الإرسال..."; btn.disabled = true; }
        
        try {
            const currentRating = sys.State?.currentRating || 0;
            const res = await DataManager.submitPrivateFeedback(currentRating, feedback);
            
            if (res.success) {
                sys.closeModal?.('rating'); 
                sys.showToast?.("نشكرك جداً! تم الإرسال للإدارة.", "success"); 
                sys.sfx?.('success');
            } else {
                throw new Error("فشل الإرسال");
            }
        } catch (error) {
            if (btn) { btn.textContent = "إرسال للإدارة"; btn.disabled = false; }
            sys.showToast?.("حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.", "error");
        }
    }
};
