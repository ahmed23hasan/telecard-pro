// ============================================================================
// 🪪 وحدة الهوية والأمان (ui/uiAuth.js) - الإصدار المؤسسي V21.0.0 💎
// 🎯 الوظيفة: الملف الشخصي، إكمال الهوية، التوثيق الرسمي (KYC)، المصادقة الثنائية (2FA)، والبصمة الحيوية.
// 🚀 التحديثات المعمارية الصارمة (V21.0.0 - Citadel Integration & Full Visibility Fix):
// 1. KYC & Identity Banner Visibility Fix 🛡️: إصلاح بقاء (#sidebar-kyc-container) و (#sb-profile-alert) مخفيين بعد الإقلاع.
// 2. Exclusive Adapter & Direct Imports 🔗: استبدال getSys() و auth الخام بـ UIManager و UIState و FirebaseAdapter.
// 3. Clean 2FA Modal Transitions 🪟: استخدام skipHistoryPop=true عند التبديل بين نافذتي (security) و (setup-2fa).
// 4. Pure Event Delegation 🎯: ربط مفاتيح 2FA والبصمة وبنر التوثيق بـ data-action الموحد دون أي onclick مدمج.
// ============================================================================

import { CACHE_KEYS, DYNAMIC_PREFIXES } from '../config.js'; 
import * as Utils from '../utils.js'; 
import { DataManager, LiveStoreData } from '../dataManager.js';
import { FirebaseAdapter } from '../core/firebaseAdapter.js';
import { RenderHelpers } from '../core/renderHelpers.js';
import { UIManager, UIState } from './uiManager.js';

const DEFAULT_AVATAR_URL = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

export const UIAuth = {

    kycFiles: {},
    _processingImgs: new Set(), 
    _kycSessionActive: false,
    _pendingTfaSecret: null,

    _compressImage: function(file, maxWidth = 1000) {
        return new Promise(async (resolve, reject) => {
            let worker, workerUrl;
            
            const cleanupWorker = () => {
                if (worker) { worker.terminate(); worker = null; }
                if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
            };

            const watchdog = setTimeout(() => {
                cleanupWorker();
                reject(new Error("نفد وقت معالجة الصورة، يرجى المحاولة بصورة أصغر."));
            }, 15000);

            await new Promise(r => setTimeout(r, 50));

            const handleSuccess = (blob) => {
                if (!blob) { clearTimeout(watchdog); cleanupWorker(); return reject(new Error("فشل ضغط الصورة.")); }
                const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
                const safeFileName = `secure_img_${Date.now()}_${uniqueId}.webp`;
                const compressedFile = new File([blob], safeFileName, { type: 'image/webp' });
                resolve({ file: compressedFile, previewUrl: URL.createObjectURL(blob) });
            };

            const fallbackCompression = () => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        setTimeout(() => { 
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
                                    handleSuccess(blob);
                                    canvas.width = 0; canvas.height = 0;
                                    img.src = ''; img.onload = null; img.onerror = null;
                                }, 'image/webp', 0.80);
                            } catch (error) {
                                clearTimeout(watchdog);
                                img.src = ''; img.onload = null; img.onerror = null;
                                reject(error);
                            }
                        }, 50);
                    };
                    img.onerror = () => {
                        clearTimeout(watchdog);
                        img.src = ''; img.onload = null; img.onerror = null;
                        reject(new Error("ملف الصورة تالف أو غير صالح."));
                    };
                    img.src = e.target.result;
                };
                reader.onerror = () => { clearTimeout(watchdog); reject(new Error("تعذر قراءة الملف.")); };
                reader.readAsDataURL(file);
            };

            try {
                if (window.OffscreenCanvas && window.createImageBitmap && window.Worker) {
                    const imgBitmap = await createImageBitmap(file);
                    const workerCode = `
                        self.onmessage = async function(e) {
                            try {
                                const { imgBitmap, maxWidth } = e.data;
                                let width = imgBitmap.width, height = imgBitmap.height;
                                if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
                                else { if (height > maxWidth) { width *= maxWidth / height; height = maxWidth; } }
                                const canvas = new OffscreenCanvas(width, height);
                                const ctx = canvas.getContext('2d');
                                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
                                ctx.drawImage(imgBitmap, 0, 0, width, height);
                                const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.80 });
                                self.postMessage({ blob });
                            } catch(err) { self.postMessage({ error: err.message }); }
                        };
                    `;
                    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
                    workerUrl = URL.createObjectURL(workerBlob);
                    worker = new Worker(workerUrl);

                    worker.onmessage = (e) => {
                        clearTimeout(watchdog);
                        cleanupWorker();
                        if (e.data.error) fallbackCompression();
                        else handleSuccess(e.data.blob);
                    };

                    worker.onerror = () => {
                        clearTimeout(watchdog);
                        cleanupWorker();
                        fallbackCompression();
                    };

                    worker.postMessage({ imgBitmap, maxWidth }, [imgBitmap]);
                } else {
                    fallbackCompression();
                }
            } catch (e) {
                fallbackCompression();
            }
        });
    },

    handleAvatarChange: async function(e) {
        const inputEl = e?.target;
        if (!inputEl || !DataManager.user) return;

        const originalFile = inputEl.files && inputEl.files[0];
        if (!originalFile || !originalFile.type.startsWith('image/')) {
            UIManager.showToast?.('عذراً، يجب إرفاق ملف صورة صالح', 'error');
            inputEl.value = '';
            return;
        }
        
        if (originalFile.size > 5 * 1024 * 1024) { 
            UIManager.showToast?.('حجم الصورة كبير جداً! اختر صورة أقل من 5MB', 'warning');
            inputEl.value = '';
            return;
        }

        const liveImgEl = document.getElementById('profile-img');
        const liveSidebarAvatar = document.getElementById('cs-avatar');
        const liveDeleteBtn = document.getElementById('inline-delete-avatar-btn');
        const avatarMenu = document.getElementById('avatar-action-menu');
        if (avatarMenu) avatarMenu.classList.remove('active');

        const avatarWrapper = document.querySelector('.profile-container .avatar-wrapper');
        if (avatarWrapper) avatarWrapper.classList.add('is-loading');

        const shield = document.createElement('div');
        shield.id = 'invisible-tx-shield';
        document.body.appendChild(shield);

        let downloadUrl = null;
        let compressed = null;

        try {
            compressed = await this._compressImage(originalFile, 400); 
            
            if (liveImgEl) {
                if (liveImgEl.src && liveImgEl.src.startsWith('blob:')) URL.revokeObjectURL(liveImgEl.src);
                liveImgEl.src = compressed.previewUrl; 
            }
            if (liveSidebarAvatar) {
                if (liveSidebarAvatar.src && liveSidebarAvatar.src.startsWith('blob:')) URL.revokeObjectURL(liveSidebarAvatar.src);
                liveSidebarAvatar.src = compressed.previewUrl; 
            }

            const oldImageUrl = DataManager.user.profileImage; 
            const secureStorageName = `avatar_${DataManager.user.id}_${Date.now()}_${Math.random().toString(36).substring(2,8)}.webp`;
            downloadUrl = await FirebaseAdapter.uploadImage(compressed.file, 'avatars', secureStorageName);               
            
            const dbUpdateSuccess = DataManager.updateUserProfile ? await DataManager.updateUserProfile({ profileImage: downloadUrl }) : false;
            
            if (dbUpdateSuccess) {
                if (liveImgEl) liveImgEl.src = downloadUrl;
                if (liveSidebarAvatar) liveSidebarAvatar.src = downloadUrl;

                try { localStorage.setItem(DYNAMIC_PREFIXES.USER_IMAGE + DataManager.user.id, downloadUrl); } 
                catch(err) { console.warn("Failed to update cache:", err); }

                if (oldImageUrl && oldImageUrl !== DEFAULT_AVATAR_URL && FirebaseAdapter.deleteImageByUrl) {
                    FirebaseAdapter.deleteImageByUrl(oldImageUrl).catch(()=>{});
                }

                if (liveDeleteBtn) liveDeleteBtn.classList.add('active');

                UIManager.showToast?.('تم تحديث الصورة الشخصية بنجاح', 'success');
                downloadUrl = null; 
            } else {
                throw new Error("قاعدة البيانات رفضت التحديث.");
            }
            
        } catch (err) {
            console.error("Avatar Upload Error:", err);
            UIManager.showToast?.('عذراً، تعذر حفظ الصورة، قد تكون تالفة أو الاتصال ضعيف.', 'error');
            
            if (downloadUrl && FirebaseAdapter.deleteImageByUrl) {
                FirebaseAdapter.deleteImageByUrl(downloadUrl).catch(()=>{});
            }

            const fallbackImg = DataManager.user.profileImage || DEFAULT_AVATAR_URL;
            if (liveImgEl) liveImgEl.src = fallbackImg; 
            if (liveSidebarAvatar) liveSidebarAvatar.src = fallbackImg; 
        } finally {
            if (compressed && compressed.previewUrl) URL.revokeObjectURL(compressed.previewUrl);
            if (avatarWrapper) avatarWrapper.classList.remove('is-loading');
            const liveShield = document.getElementById('invisible-tx-shield');
            if (liveShield) liveShield.remove();
            inputEl.value = ''; 
        }
    },

    openProfileInfo: function() {
        if (DataManager.syncUser) DataManager.syncUser();
        this.updateProfileDisplay();

        if (!DataManager.user) return;
        const user = DataManager.user;
        
        const isVerified = (user.isVerified === true || String(user.isVerified) === 'true' || user.kycStatus === 'approved' || user.kycStatus === 'verified'); 

        const fallbackName = (user.fullName || (user.firstName ? `${user.firstName} ${user.lastName || ''}` : 'العميل')).trim();
        const fullName = UIManager._getFullName ? UIManager._getFullName(user) : fallbackName;
        
        const usernameVal = user.username ? `${user.username}` : '---';
        const countryTxt = user.country || 'غير محدد';
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
            const saveBtnToggle = document.getElementById('save-name-btn');

            if (editBtnToggle) {
                editBtnToggle.style.display = isVerified ? 'none' : 'inline-flex';
                editBtnToggle.classList.remove('d-none');
            }
            if (saveBtnToggle) {
                saveBtnToggle.classList.add('d-none');
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
            
            if(baseCurrView) {
                const base = (user.baseCurrency || 'USD').toUpperCase();
                baseCurrView.textContent = base;
            }
            
            const currentTier = typeof DataManager.getUserTier === 'function' ? DataManager.getUserTier(user) : null;

            if (tierView) {
                const tierName = currentTier ? (currentTier.nameAr || currentTier.name) : '---';
                const tierColor = currentTier ? (currentTier.color || 'var(--primary)') : 'var(--text-muted)'; 
                let iconClass = currentTier ? (currentTier.icon || 'fa-solid fa-medal') : 'fa-solid fa-circle-exclamation';
                if (!iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) iconClass = 'fa-solid ' + iconClass;

                tierView.innerHTML = `<div class="tier-view-wrapper"><span>${Utils.safeText(tierName)}</span><i class="${Utils.safeText(iconClass.trim())}" style="color: ${tierColor}; margin-inline-start: 8px;"></i></div>`;
                if (tierIconBox) { tierIconBox.style.color = tierColor; }
            }

            const currentAvatar = user.profileImage || DEFAULT_AVATAR_URL;
            const imgEl = document.getElementById('profile-img');
            const sidebarAvatar = document.getElementById('cs-avatar');
            
            if(imgEl) { imgEl.src = currentAvatar; }
            if(sidebarAvatar) { sidebarAvatar.src = currentAvatar; }
            
            const deleteAvatarBtn = document.getElementById('inline-delete-avatar-btn');
            if (deleteAvatarBtn) {
                const hasCustomImage = currentAvatar && currentAvatar.trim() !== '' && currentAvatar !== DEFAULT_AVATAR_URL;
                deleteAvatarBtn.classList.toggle('active', !!hasCustomImage);
            }

            UIManager.openModal?.('profile-info');
        });
    },    
    
    toggleNameEdit: async function() {
        const nameEl = document.getElementById('display-name');
        const inpEl = document.getElementById('edit-name-input');
        const editBtn = document.getElementById('profile-edit-toggle');
        const saveBtn = document.getElementById('save-name-btn');
        
        if (!nameEl || !inpEl) return;
        
        if (inpEl.classList.contains('d-none')) {
            nameEl.classList.add('d-none');
            inpEl.classList.remove('d-none');
            inpEl.focus();
            
            if (editBtn) editBtn.classList.add('d-none');
            if (saveBtn) {
                saveBtn.classList.remove('d-none');
                saveBtn.style.display = 'inline-flex';
            }
        } else {
            let newVal = inpEl.value.trim().replace(/[<>"{}[\]\\]/g, '');
            
            if (newVal.length < 2) { UIManager.showToast?.('الاسم قصير جداً، يرجى كتابة اسم صحيح', 'warning'); return; }
            if (newVal.length > 40) { UIManager.showToast?.('الاسم طويل جداً، يرجى كتابة اسم أقصر', 'warning'); return; }
            
            const currentFullName = DataManager.user?.fullName || '';
            
            if (DataManager.user && newVal !== currentFullName) {
                const nameParts = newVal.split(' ');
                const newFirstName = nameParts[0];
                const newLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
                
                UIManager.toggleLoader?.(true, 'جاري تحديث الاسم...');
                try {
                    const success = await DataManager.updateUserProfile({ 
                        firstName: newFirstName, 
                        lastName: newLastName, 
                        fullName: newVal 
                    });
                    
                    if (success) {
                        nameEl.textContent = newVal; 
                        UIManager.showToast?.('تم تحديث الاسم بنجاح', 'success');
                        this.updateProfileDisplay();
                        
                        inpEl.value = newVal;
                        inpEl.classList.add('d-none');
                        nameEl.classList.remove('d-none');
                        
                        if (saveBtn) saveBtn.classList.add('d-none');
                        if (editBtn) editBtn.classList.remove('d-none');
                    } else {
                        throw new Error('Update failed');
                    }
                } catch (error) {
                    UIManager.showToast?.('تعذر تحديث الاسم، تأكد من اتصالك أو حاول لاحقاً', 'error');
                } finally {
                    UIManager.toggleLoader?.(false);
                }
            } else {
                inpEl.classList.add('d-none');
                nameEl.classList.remove('d-none');
                if (saveBtn) saveBtn.classList.add('d-none');
                if (editBtn) editBtn.classList.remove('d-none');
            }
        }
    },    
    
    closeProfileInfo: function() { 
        UIManager.closeModal?.('profile-info'); 
    },

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
                    alertCard.classList.add('d-none', 'hide-element');
                    alertCard.style.setProperty('display', 'none', 'important');
                }
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
            if (kycContainer) kycContainer.classList.remove('d-none', 'hide-element');
            
            const user = DataManager.user;
            const fallbackName = (user.fullName || (user.firstName ? `${user.firstName} ${user.lastName || ''}` : 'العميل')).trim();
            const fullName = UIManager._getFullName ? UIManager._getFullName(user) : fallbackName;
            
            const nameEl = document.getElementById('cs-name');
            const displayNameEl = document.getElementById('display-name');
            
            if (nameEl) nameEl.textContent = fullName;
            if (displayNameEl) displayNameEl.textContent = fullName;
            
            if (alertCard) {
                const hasCurrency = Boolean(user.baseCurrency && user.baseCurrency.trim() !== '');
                const hasData = Boolean(user.phone && user.phone.trim() !== '') && Boolean(user.country && user.country !== '');
                const isIdentityComplete = ((user.isVerified === true || String(user.isVerified) === 'true') || hasData) && hasCurrency;
                
                if (isIdentityComplete) {
                    alertCard.classList.add('d-none', 'hide-element');
                    alertCard.style.setProperty('display', 'none', 'important');
                    alertCard.style.pointerEvents = 'none';
                    alertCard.removeAttribute('data-action');
                    alertCard.onclick = null;
                } else {
                    alertCard.classList.remove('d-none', 'hide-element');
                    alertCard.style.removeProperty('display');
                    alertCard.style.pointerEvents = 'auto';
                    alertCard.setAttribute('data-action', 'open-identity-sidebar');
                }
            }
            
            const sidebarAvatar = document.getElementById('cs-avatar');
            if (sidebarAvatar) {
                sidebarAvatar.src = user.profileImage || DEFAULT_AVATAR_URL;
            }
            
            const idEl = document.getElementById('cs-id');
            if (idEl) idEl.textContent = RenderHelpers.formatUserId(user);
            
            this.updateSidebarTier();
            this.renderKycUI();
            this.checkKycCelebration();
            
        } catch (e) { console.error('Error updating profile display:', e); }
    },

    deleteProfileImage: async function() {
        if(!DataManager.user) return;
        const oldImageUrl = DataManager.user.profileImage; 
        
        const menu = document.getElementById('avatar-action-menu');
        if (menu) menu.classList.remove('active');

        try {
            if (DataManager.updateUserProfile) {
                const updated = await DataManager.updateUserProfile({ profileImage: null });
                if (!updated) throw new Error("فشل تحديث قاعدة البيانات");
            }

            const imgEl = document.getElementById('profile-img');
            const sidebarAvatar = document.getElementById('cs-avatar');
            
            if(imgEl) {
                if (imgEl.src && imgEl.src.startsWith('blob:')) URL.revokeObjectURL(imgEl.src);
                imgEl.src = DEFAULT_AVATAR_URL; 
            }
            if(sidebarAvatar) {
                if (sidebarAvatar.src && sidebarAvatar.src.startsWith('blob:')) URL.revokeObjectURL(sidebarAvatar.src);
                sidebarAvatar.src = DEFAULT_AVATAR_URL; 
            }
            
            const deleteBtn = document.getElementById('inline-delete-avatar-btn');
            if(deleteBtn) deleteBtn.classList.remove('active');
            
            try { localStorage.removeItem(DYNAMIC_PREFIXES.USER_IMAGE + DataManager.user.id); } 
            catch(e) { console.warn("Failed to remove cache:", e); }
            
            if (oldImageUrl && oldImageUrl !== DEFAULT_AVATAR_URL && FirebaseAdapter.deleteImageByUrl) {
                FirebaseAdapter.deleteImageByUrl(oldImageUrl).catch(()=>{});
            }
            
            UIManager.showToast?.('تم حذف الصورة الشخصية', 'success'); 
        } catch(e) { 
            console.error("Error deleting avatar:", e);
            UIManager.showToast?.('تعذر حذف الصورة', 'error'); 
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
            const tierColor = currentTier ? (currentTier.color || 'var(--primary)') : 'var(--text-muted)';
            
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
                        tierBtn.style.setProperty('--tier-rgb', 'var(--primary-rgb)');
                    }
                } else {
                    tierBtn.style.setProperty('--tier-rgb', 'var(--primary-rgb)');
                }
            } catch (e) {
                tierBtn.style.setProperty('--tier-rgb', 'var(--primary-rgb)'); 
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
        else if(DataManager.user.profileImage) { this.loadUserImageWithFallback(DataManager.user.profileImage); } 
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
            btn2fa.setAttribute('data-action', 'toggle-2fa');
            btn2fa.onclick = null;
        }

        const isBioActive = DataManager.user?.biometricEnabled === true;
        const btnBio = document.getElementById('setting-biometric-toggle');
        
        if (btnBio) {
            btnBio.classList.toggle('is-active', isBioActive);
            const bgText = btnBio.querySelector('.switch-bg-text');
            if (bgText) bgText.textContent = isBioActive ? 'مفعل' : 'مغلق';
            btnBio.setAttribute('data-action', 'toggle-biometric');
            btnBio.onclick = null;
        }

        UIManager.openModal?.('security');
    },
    
    closeSecurityModal: function(skipHistoryPop = false) {
        this._clear2FAState(); 
        UIManager.closeModal?.('security', skipHistoryPop);
    },

    _clear2FAState: function() {
        this._pendingTfaSecret = null;
        const manualSecretEl = document.getElementById('manual-2fa-secret');
        if (manualSecretEl) manualSecretEl.innerText = '------';
        const qrContainer = document.getElementById('qrcode-container');
        if (qrContainer) qrContainer.innerHTML = '';
        const otpInput = document.getElementById('otp-verify-input');
        if (otpInput) otpInput.value = '';
    },

    handle2FAToggle: async function() {
        const isCurrentlyEnabled = DataManager.is2FAEnabled ? DataManager.is2FAEnabled() : false;
        
        if (isCurrentlyEnabled) {
            UIManager.toggleLoader?.(true, 'جاري إيقاف الحماية...');
            const result = await DataManager.unenrollMFA();
            UIManager.toggleLoader?.(false);
            
            if (result.success) {
                UIManager.showToast?.('تم إيقاف المصادقة الثنائية', 'info');
                this.openSecurityModal(); 
            } else {
                UIManager.showToast?.(result.msg, 'error');
            }
        } else {
            this.start2FASetup();
        }
    },

    start2FASetup: async function() {
        this._clear2FAState();

        UIManager.toggleLoader?.(true, 'جاري مزامنة بروتوكولات الأمان...');
        await FirebaseAdapter.refreshUserToken();

        UIManager.toggleLoader?.(true, 'جاري إنشاء مفتاح آمن من جوجل...');
        
        try {
            const result = await DataManager.generateTOTPSecret();

            if (!result.success) {
                UIManager.toggleLoader?.(false);
                UIManager.showToast?.(result.msg || 'فشل في إنشاء المفتاح، يرجى المحاولة مرة أخرى.', 'error');
                return;
            }

            this._pendingTfaSecret = result.secret;

            const storeName = LiveStoreData.settings?.storeName || 'TeleCard';
            const userEmail = DataManager.user?.email || 'User';
            
            const qrUri = this._pendingTfaSecret.generateQrCodeUrl(userEmail, storeName);

            const manualSecretEl = document.getElementById('manual-2fa-secret');
            if (manualSecretEl) manualSecretEl.innerText = this._pendingTfaSecret.secretKey;
            
            const qrContainer = document.getElementById('qrcode-container');
            if (qrContainer) {
                qrContainer.innerHTML = ''; 
                
                if (typeof window.QRCode === 'undefined') {
                    UIManager.toggleLoader?.(true, 'جاري تحميل نظام التشفير المرئي...');
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
                            script.src = './qrcode.min.js';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        }
                    });
                }
                
                const liveContainer = document.getElementById('qrcode-container'); 
                if (liveContainer && typeof window.QRCode !== 'undefined') {
                    const qrDataUrl = await window.QRCode.toDataURL(qrUri, { color: { dark: '#111a2b', light: '#ffffff' }, width: 200, margin: 1 });
                    liveContainer.innerHTML = `<img src="${qrDataUrl}" class="qr-code-img img-loaded-flat" alt="2FA QR Code">`;
                } else if (liveContainer) {
                    liveContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);"><i class="fa-solid fa-shield-halved fa-2x mb-10"></i><br>يرجى إدخال الكود النصي يدوياً في التطبيق.</div>`;
                }
            }
            
            UIManager.toggleLoader?.(false);
            
            UIManager.closeModal?.('security', true);

            setTimeout(() => {
                UIManager.openModal?.('setup-2fa');
                
                const setupModal = document.getElementById('setup-2fa-modal');
                if (setupModal && !setupModal._boundCleanup) {
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.attributeName === 'class' && !setupModal.classList.contains('active')) {
                                this._clear2FAState();
                                observer.disconnect();
                                setupModal._boundCleanup = false;
                            }
                        });
                    });
                    observer.observe(setupModal, { attributes: true });
                    setupModal._boundCleanup = true;
                }
            }, 100);

        } catch (error) {
            console.error("2FA Setup Error:", error);
            UIManager.toggleLoader?.(false);
            UIManager.showToast?.('حدث خطأ في الاتصال، يرجى المحاولة لاحقاً.', 'error');
            this._clear2FAState();
        }
    },
    
    verifyAndEnable2FA: async function() {
        if (!this._pendingTfaSecret) return;

        const input = document.getElementById('otp-verify-input');
        const code = input ? input.value.trim() : '';
        
        if (!/^\d{6}$/.test(code)) {
            UIManager.showToast?.('يرجى إدخال 6 أرقام صالحة', 'error');
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

            UIManager.closeModal?.('setup-2fa', true);
            UIManager.showToast?.('تم تفعيل المصادقة الثنائية بنجاح 🛡️', 'success');
            
            setTimeout(() => {
                this.openSecurityModal();
            }, 100);
            
        } else {
            UIManager.showToast?.(result.msg, 'error');
            if (input) {
                input.classList.add('input-error');
                setTimeout(() => input.classList.remove('input-error'), 1000);
            }
        }
    },

    handleBiometricToggle: async function() {
        const user = DataManager.user;
        const isCurrentlyEnabled = user?.biometricEnabled === true;
        
        if (isCurrentlyEnabled) {
            UIManager.toggleLoader?.(true, 'جاري إيقاف قفل البصمة...');
            try {
                const success = await DataManager.updateUserProfile({ biometricEnabled: false, biometricRawId: null });
                if (success) {
                    try { localStorage.removeItem(CACHE_KEYS.BIOMETRIC_KEY); } catch (e) {}
                    UIManager.showToast?.('تم إيقاف قفل البصمة بنجاح', 'info');
                    this.openSecurityModal();
                } else {
                    UIManager.showToast?.('تعذر إيقاف البصمة، يرجى المحاولة لاحقاً', 'error');
                }
            } finally { UIManager.toggleLoader?.(false); }
            return;
        }
        
        if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
            UIManager.showToast?.('عذراً، متصفحك لا يدعم البصمة أو أن الاتصال غير آمن (HTTPS مطلوب)', 'error');
            return;
        }
        
        let bioTimerId;
        try {
            UIManager.toggleLoader?.(true, 'يرجى تأكيد بصمتك لربط الجهاز...');
            
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            const userEmail = user?.email || 'user@store.local';
            const userIdBytes = new TextEncoder().encode(userEmail);
            const storeName = LiveStoreData.settings?.storeName || "TeleCard Store";
            
            const controller = new AbortController();
            const timeoutPromise = new Promise((_, reject) => {
                bioTimerId = setTimeout(() => {
                    controller.abort(); 
                    reject(new Error('biometric_timeout'));
                }, 60000);
            });
            
            const credential = await Promise.race([
                navigator.credentials.create({
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
                    },
                    signal: controller.signal
                }),
                timeoutPromise
            ]);
            
            clearTimeout(bioTimerId); 
            
            const rawIdBytes = new Uint8Array(credential.rawId);
            const binaryString = Array.from(rawIdBytes).map(b => String.fromCharCode(b)).join('');
            const rawIdBase64 = btoa(binaryString);
            
            const success = await DataManager.updateUserProfile({
                biometricEnabled: true,
                biometricRawId: rawIdBase64
            });
            
            if (success) {
                try { localStorage.setItem(CACHE_KEYS.BIOMETRIC_KEY, rawIdBase64); } catch (e) {}
                UIManager.showToast?.('تم تفعيل قفل البصمة بنجاح!', 'success');
                this.openSecurityModal();
            } else {
                throw new Error('server_error');
            }
        } catch (error) {
            clearTimeout(bioTimerId); 
            console.error("Biometric Error:", error);
            
            if (error.message === 'biometric_timeout') {
                UIManager.showToast?.('تأخر استجابة مستشعر البصمة في جهازك، تم الإلغاء.', 'error');
            } else if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                UIManager.showToast?.('تم إلغاء عملية البصمة من قبلك', 'warning');
            } else if (error.message === 'storage_full') {
                UIManager.showToast?.('تعذر تفعيل البصمة (التصفح المخفي يمنع حفظ البيانات)', 'error');
            } else if (error.name === 'SecurityError') {
                UIManager.showToast?.('بيئة غير آمنة. البصمة تتطلب اتصال HTTPS', 'error');
            } else {
                UIManager.showToast?.('تعذر تفعيل البصمة، تأكد من إعدادات القفل في جهازك', 'error');
            }
        } finally {
            UIManager.toggleLoader?.(false);
        }
    },
    
    handlePasswordSubmit: function() {
        const securityModal = document.getElementById('security-modal');
        if (!securityModal) return;
        
        const currentInput = securityModal.querySelector('#pass-current');
        const newInput = securityModal.querySelector('#pass-new');
        const confirmInput = securityModal.querySelector('#pass-confirm');
        
        const currentVal = (currentInput?.value || '').trim();
        const newVal = (newInput?.value || '').trim();
        const confirmVal = (confirmInput?.value || '').trim();
        
        if (!currentVal || !newVal || !confirmVal) {
            UIManager.showToast?.('يرجى تعبئة جميع الحقول', 'warning'); return;
        }
        if (newVal.length < 6) {
            UIManager.showToast?.('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل', 'warning'); return;
        }
        if (newVal !== confirmVal) {
            UIManager.showToast?.('كلمة المرور الجديدة غير متطابقة', 'error'); return;
        }
        
        if (!DataManager || typeof DataManager.submitPasswordChange !== 'function') return;
        
        DataManager.submitPasswordChange(currentVal, newVal, confirmVal).then(result => {
            if (result.success) {
                UIManager.showToast?.('تم تحديث كلمة المرور بنجاح!', 'success');
                [currentInput, newInput, confirmInput].forEach(el => { if (el) el.value = ''; });
                setTimeout(() => { this.closeSecurityModal(); }, 1000);
            } else {
                UIManager.showToast?.(result.msg, 'error');
            }
        });
    },

    sendResetPasswordEmail: async function() {
        const user = DataManager?.user;
        if (!user || !user.email) {
            UIManager.showToast?.('لا يوجد بريد إلكتروني مرتبط بهذا الحساب لإرسال الرابط!', 'error');
            return;
        }
        
        UIManager.toggleLoader?.(true, 'جاري إرسال رابط التعيين...');
        
        try {
            const result = await DataManager.sendPasswordResetEmail(user.email);
            UIManager.toggleLoader?.(false); 
            
            if (result.success) {
                this.closeSecurityModal(); 
                UIManager.showToast?.('تم إرسال رابط التعيين إلى بريدك الإلكتروني بنجاح', 'success');
            } else {
                UIManager.showToast?.(result.msg, 'error'); 
            }
        } catch (error) {
            console.error("Password Reset Error:", error);
            UIManager.toggleLoader?.(false);
            UIManager.showToast?.('حدث خطأ أثناء إرسال الرابط، يرجى المحاولة لاحقاً', 'error');
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
        const btn = document.querySelector('[data-action="save-identity"]');
        if (UIState.isSavingIdentity || (btn && btn.disabled)) return;
        
        if (DataManager.user && (DataManager.user.isVerified === true || String(DataManager.user.isVerified) === 'true')) {
            UIManager.showToast?.('بياناتك مؤكدة مسبقاً! لا يمكنك تعديل العملة الأساسية بعد ربط المحفظة.', 'error');
            UIManager.closeModal?.('identity');
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
            UIManager.showToast?.('يرجى تعبئة جميع الحقول بدقة', 'warning');
            return;
        }
        
        if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
            UIManager.showToast?.('رقم الهاتف غير صالح، يرجى كتابة أرقام صحيحة.', 'error');
            return;
        }
        
        UIState.isSavingIdentity = true;
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
                this.updateProfileDisplay();
                UIManager.updateDisplayCurrencyUI?.(DataManager.selectedCurr);
                UIManager.updateDisplayBalance?.();
                
                const inputsWrap = document.getElementById('identity-inputs-wrap');
                const statusWrap = document.getElementById('identity-verified-status');
                
                if (inputsWrap) inputsWrap.style.display = 'none';
                if (statusWrap) statusWrap.classList.remove('hide-element');
                
                UIManager.sfx?.('success');
            } else {
                throw new Error(result?.msg || 'فشلت العملية، يرجى المحاولة لاحقاً.');
            }
        } catch (error) {
            console.error("Identity Save Error:", error);
            UIManager.showToast?.(error.message, 'error');
        } finally {
            UIState.isSavingIdentity = false;
            if (btn) {
                btn.disabled = false;
                btn.style.width = ''; 
                btn.innerHTML = originalBtnHtml; 
            }
        }
    },
    
    clearKycImage: function(previewId) {
        const previewImg = document.getElementById(previewId);
        const parentBox = previewImg?.closest('.kyc-upload-box');
        const input = parentBox?.querySelector('input[type="file"]');

        if (this.kycFiles) delete this.kycFiles[previewId];
        if (input) input.value = '';
        
        if (previewImg) {
            if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
            previewImg.src = '';
        }
        if (parentBox) parentBox.classList.remove('has-img');
    },

    loadDynamicCurrenciesForModal: function() {
        const user = DataManager.user;
        const isAlreadyComplete = user && ((user.isVerified === true || String(user.isVerified) === 'true') || (user.phone && user.country));
        const inputsWrap = document.getElementById('identity-inputs-wrap');
        const statusWrap = document.getElementById('identity-verified-status');

        if (isAlreadyComplete) {
            if (inputsWrap) inputsWrap.style.display = 'none';
            if (statusWrap) statusWrap.classList.remove('hide-element');
        } else {
            if (inputsWrap) inputsWrap.style.display = 'block';
            if (statusWrap) statusWrap.classList.add('hide-element');
        }

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
                
                const currName = Utils.escapeHtml(r.name || r.code); 
                const safeCode = Utils.escapeHtml(r.code);
                
                html += `<div class="dropdown-item" data-action="select-reg-currency" data-code="${safeCode}" data-name="${currName}">
                            <span class="currency-name" style="flex: 1; text-align: start;">${currName}</span>
                            <span class="num-en currency-code" style="color: var(--primary); font-weight: 900;">${safeCode}</span>
                         </div>`;
            });
        }
        listTarget.innerHTML = html;
    },
    
    handleKycImage: async function(input, previewId) {
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
            UIManager.showToast?.('عذراً، يجب إرفاق ملف صورة صالح', 'error');
            input.value = '';
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            UIManager.showToast?.('حجم الصورة كبير جداً! اختر صورة أقل من 5MB', 'warning');
            input.value = '';
            return;
        }
        
        this._processingImgs.add(previewId);
        
        try {
            UIManager.toggleLoader?.(true, 'جاري معالجة الصورة...');
            const compressed = await this._compressImage(file, 1200);
            
            if (!this._kycSessionActive || !input.value) {
                URL.revokeObjectURL(compressed.previewUrl);
                return;
            }
            
            this.kycFiles[previewId] = compressed.file;
            if (previewImg) {
                if (previewImg.src && previewImg.src.startsWith('blob:')) {
                    URL.revokeObjectURL(previewImg.src);
                }
                previewImg.src = compressed.previewUrl;
                previewImg.style.display = 'block';
            }
            if (parentBox) parentBox.classList.add('has-img');
        } catch (e) {
            console.error("KYC Image Compress Error:", e);
            UIManager.showToast?.('تعذر معالجة الصورة، قد تكون غير مدعومة', 'error');
            input.value = '';
        } finally {
            this._processingImgs.delete(previewId);
            UIManager.toggleLoader?.(false);
        }
    },

    submitKycData: async function() {
        if (UIState.isSubmittingKyc) return;
        
        const fullName = document.getElementById('kyc-full-name')?.value?.trim() || '';
        let idNumber = document.getElementById('kyc-id-number')?.value?.trim() || '';
        
        const safeFullName = Utils.escapeHtml(fullName).trim();
        const safeIdNumber = Utils.escapeHtml(idNumber).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^a-zA-Z0-9-]/g, '').trim();
        
        this.kycFiles = this.kycFiles || {};
        const files = {
            front: this.kycFiles['kyc-prev-front'],
            back: this.kycFiles['kyc-prev-back'],
            selfie: this.kycFiles['kyc-prev-selfie']
        };
        
        if (!safeFullName || !safeIdNumber || !files.front || !files.back || !files.selfie) {
            UIManager.showToast?.('يرجى تعبئة الاسم ورقم الهوية وإرفاق الصور الثلاث بوضوح', 'error');
            return;
        }
        
        UIState.isSubmittingKyc = true;
        UIManager.toggleLoader?.(true, 'جاري تشفير ورفع الملفات...');
        
        try {
            const res = await DataManager.submitKycDocuments({ fullName: safeFullName, idNumber: safeIdNumber }, files);
            
            if (res.success) {
                this.closeKycModal();
                UIManager.showToast?.('تم إرسال مستندات التوثيق بنجاح! طلبك قيد المراجعة.', 'success');
                this.renderKycUI();
            } else {
                throw new Error(res.msg || 'فشل إرسال المستندات');
            }
            
        } catch (e) {
            console.error('KYC Upload Error:', e);
            UIManager.showToast?.(e.message || 'تعذر إرسال المستندات، يرجى المحاولة مجدداً', 'error');
        } finally {
            UIState.isSubmittingKyc = false;
            UIManager.toggleLoader?.(false);
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
            if (targets.map(id => String(id)).includes(String(user.tierId || 'TIER_DEFAULT'))) {
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
        this._kycSessionActive = true; 
        const user = DataManager.user;
        const alertBox = document.getElementById('kyc-rejection-alert');
        const reasonText = document.getElementById('kyc-rejection-reason');
        
        if (!alertBox || !reasonText || !user) return;

        if (user.kycStatus === 'rejected') {
            reasonText.textContent = user.kycReviewNote || 'يرجى إعادة رفع الصور بشكل أوضح والتأكد من مطابقة البيانات.';
            alertBox.classList.remove('d-none');
        } else {
            alertBox.classList.add('d-none');
        }
    },

    closeKycModal: function() { 
        this._kycSessionActive = false; 
        const previews = ['kyc-prev-front', 'kyc-prev-back', 'kyc-prev-selfie'];
        previews.forEach(id => {
            const imgEl = document.getElementById(id);
            if (imgEl) {
                if (imgEl.src && imgEl.src.startsWith('blob:')) {
                    URL.revokeObjectURL(imgEl.src);
                }
                imgEl.src = '';
                imgEl.style.display = 'none';
                imgEl.closest('.kyc-upload-box')?.classList.remove('has-img');
            }
        });
        
        const avatarInp = document.getElementById('avatar-upload-input');
        if (avatarInp) avatarInp.value = '';

        const kycModal = document.getElementById('kyc-upload-modal');
        if (kycModal) {
            kycModal.querySelectorAll('input[type="file"]').forEach(inp => inp.value = '');
        }        
        this.kycFiles = {}; 
        UIManager.closeModal?.('kyc-upload'); 
    },

    openKycStatusModal: function(state) {
        const content = document.getElementById('kyc-status-content');
        if(!content) return;
        
        if (state === 'approved' || state === 'verified') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-shield-halved kyc-status-icon verified"></i><h3 class="fw-bold text-main mb-10">حسابك موثق ومحمي</h3><p class="text-muted fs-13 line-height-lg">بياناتك محفوظة بأعلى معايير التشفير. يمكنك الآن الإيداع والشراء بكامل الصلاحيات.</p></div>`;
        } else if (state === 'pending') {
            content.innerHTML = `<div class="kyc-status-card text-center"><i class="fa-solid fa-hourglass-half kyc-status-icon pending"></i><h3 class="fw-bold text-main mb-10">جاري مراجعة البيانات</h3><p class="text-muted fs-13 line-height-lg">طلبك الآن على طاولة الإدارة للمراجعة. قد يستغرق الأمر بعض الوقت، سيتم إشعارك فور الانتهاء.</p></div>`;
        }
        UIManager.openModal?.('kyc-status');
    },

    checkKycCelebration: function() {
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
        setTimeout(() => { UIManager.openModal?.('kyc-celebration'); UIManager.sfx?.('success'); }, 1500);
    },
    
    closeKycStatusModal: function() { UIManager.closeModal?.('kyc-status'); },

    openTierInfoModal: async function() {
        if (!DataManager || typeof DataManager.getTierProgress !== 'function') return;
        const tierData = DataManager.getTierProgress();
        if (!tierData) return; 
        
        const { currentTier, targetNameDisplay, remainingAmt, percent, remainingDays, isUnlimitedDuration, isGoalReached, isAutoAdvanceEnabled, isMaxTier } = tierData;
        const content = document.getElementById('tier-info-content');
        if (!content) return;
        
        const settings = LiveStoreData.settings || {};
        const pausedMsg = settings.tierPausedMsg || 'نظام الترقية التلقائية متوقف حالياً، يرجى التواصل مع الإدارة.';
        
        let rawIcon = currentTier.icon || 'medal';
        let finalIconClass = `fa-solid fa-${rawIcon.replace(/fa-solid|fa-regular|fa-brands|fa-/g, '').trim()}`;
        const tierColor = currentTier.color || 'var(--primary)';
        
        const currencySymbol = RenderHelpers ? RenderHelpers.getCurrencySymbolText('USD') : '$';
        
        let html = `
                <div class="tm-wrapper">
                    <div class="tm-icon-box" style="color: ${tierColor};">
                        <i class="${finalIconClass} tm-icon"></i>
                    </div>
                    <h3 class="tm-title">${Utils.escapeHtml(currentTier.nameAr || currentTier.name)}</h3>
                    <p class="tm-desc">مستواك الحالي هو <span class="tm-text-highlight" style="color: ${tierColor};">${Utils.escapeHtml(currentTier.nameAr || currentTier.name)}</span>. للارتقاء بتجربتك والحصول على مزايا وأسعار أفضل، قم بزيادة مبيعاتك خلال المدة المحددة.</p>
            `;
        
        if (isAutoAdvanceEnabled) {
            let targetPhraseHtml = isMaxTier ? `للحفاظ على باقتك ومميزاتك الحالية.` : `للوصول لـ <span class="tm-text-highlight text-main">${Utils.escapeHtml(targetNameDisplay)}</span>.`;
            
            if (isMaxTier && isGoalReached) {
                html += `
                        <div class="tm-top-tier-card" style="border-top-color: ${tierColor};">
                            <div class="tm-top-icon" style="color: ${tierColor};"><i class="${finalIconClass}"></i></div>
                            <div class="tm-top-title" style="color: ${tierColor};">تهانينا، أنت في القمة!</div>
                            <div class="tm-top-desc">لقد حققت الهدف وتصل الآن لأعلى مستوى متاح في المتجر لتتمتع بأفضل الأسعار. استمر في نشاطك للحفاظ على هذه المكانة الحصرية.</div>
                        </div>`;
            } else if (!isMaxTier && isGoalReached) {
                html += `
                        <div class="tm-top-tier-card" style="border-top-color: var(--success); background: rgba(16, 185, 129, 0.05);">
                            <div class="tm-top-icon" style="color: var(--success);"><i class="fa-solid fa-check-double"></i></div>
                            <div class="tm-top-title" style="color: var(--success);">تم تحقيق الهدف بنجاح!</div>
                            <div class="tm-top-desc">تهانينا! لقد حققت شرط المبيعات المطلوب. سيتم ترقية حسابك لـ <span class="tm-text-highlight text-main">${Utils.escapeHtml(targetNameDisplay)}</span> في أقرب دورة تحديث أو بموافقة الإدارة.</div>
                        </div>`;
            } else {
                html += `
                        <div class="tm-progress-card">
                            <div class="tm-progress-header">
                                <span class="tm-percent num-en">${percent.toFixed(0)}%</span>
                                <div class="tm-bar-bg"><div class="tm-bar-fill" style="width: ${percent}%; background: ${tierColor};"></div></div>
                                <span class="tm-duration-badge num-en">${isUnlimitedDuration ? 'مهلة مفتوحة ∞' : `${remainingDays} يوم متبقي`}</span>
                            </div>
                            <div class="tm-footer-text">
                                يتوجب عليك إنفاق <span class="tm-amount-text num-en" dir="ltr">${remainingAmt.toFixed(2)} ${currencySymbol}</span> إضافية ${isUnlimitedDuration ? '<span class="tm-text-highlight text-success">(بمهلة مفتوحة ∞)</span>' : `خلال <span class="tm-text-highlight text-warning">${remainingDays} يوماً</span>`} ${targetPhraseHtml}
                            </div>
                        </div>`;
            }
            
            const userTrack = tierData.trackType || (currentTier?.type === 'api' ? 'api' : 'retail');
const allTiers = (LiveStoreData.tiers || []).filter(t => {
    const tTrack = (t?.type === 'api') ? 'api' : 'retail';
    return tTrack === userTrack;
});
if (allTiers.length > 0) {
    const sortedTiers = [...allTiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));  
                html += `<div class="tm-roadmap-section"><h4 class="tm-roadmap-title"><i class="fa-solid fa-map-location-dot"></i> خريطة طريق مستويات VIP</h4><div class="tm-roadmap-list">`;
                
                sortedTiers.forEach(t => {
                    const isUserCurrent = String(t.id) === String(currentTier.id);
                    const tColor = t.color || 'var(--text-gray)';
                    let finalIconClassT = `fa-solid fa-${(t.icon || 'medal').replace(/fa-solid|fa-regular|fa-brands|fa-/g, '').trim()}`;
                    
                    const badgeHtml = isUserCurrent ? `<span class="tm-badge-active" style="background: ${tierColor};">مستواك الحالي</span>` : `<span class="tm-badge-locked">مغلق</span>`;
                    const stateClass = isUserCurrent ? 'active' : 'locked';
                    
                    const isZeroThreshold = Number(t.threshold || 0) === 0;
                    const reqHtml = isZeroThreshold ? `<span class="tm-item-req text-success">مستوى الدخول الافتراضي</span>` : `<span class="tm-item-req" style="${isUserCurrent ? 'color: var(--primary); font-weight:700;' : ''}">هدف المبيعات: <bdi class="num-en">${Number(t.threshold || 0).toFixed(0)} ${currencySymbol}</bdi></span>`;

                    html += `
                            <div class="tm-roadmap-item ${stateClass}">
                                <div class="tm-item-left">
                                    <div class="tm-item-icon" style="color: ${tColor}; background: ${isUserCurrent ? 'rgba(255, 215, 0, 0.08)' : 'rgba(255, 255, 255, 0.03)'}; border-color: ${isUserCurrent ? tColor : 'rgba(255,255,255,0.05)'};">
                                        <i class="${finalIconClassT}"></i>
                                    </div>
                                    <div class="tm-item-info">
                                        <span class="tm-item-name">${Utils.escapeHtml(t.nameAr || t.name)}</span>
                                        ${reqHtml}
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
        UIManager.openModal?.('tier-info');
    }
};