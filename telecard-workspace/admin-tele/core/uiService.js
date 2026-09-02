// ============================================================================
// 🎨 خدمة الواجهات الأساسية (core/uiService.js) - النواة الصلبة V15.1 💎
// 🎯 الوظيفة: أدوات الواجهة المشتركة (الإشعارات، التحميل، النوافذ) بدون منطق عمل
// 🌟 التحديثات:
// 1. Radar Prompt: نافذة تفاعلية منبثقة لطلب صلاحية الإشعارات للمدير بطريقة احترافية.
// ============================================================================

import { Utils, EventBus } from '../adminUtils.js';
import { AdminTemplates } from '../adminTemplates.js';

export const UIService = {
    _esc: Utils.escapeHTML,
    tempImg: null,
    tempFile: null, 

    initTheme: function() {
        const savedTheme = localStorage.getItem('telecard_theme');
        const icon = document.getElementById('theme-toggle-icon');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            if (icon) icon.className = 'fa-solid fa-sun text-warning'; 
        } else {
            document.body.classList.remove('light-mode');
            if (icon) icon.className = 'fa-solid fa-moon'; 
        }
    },
    
    toggleTheme: function() {
        const body = document.body;
        const icon = document.getElementById('theme-toggle-icon');
        body.classList.toggle('light-mode');
        const isLight = body.classList.contains('light-mode');
        if (icon) {
            icon.className = isLight ? 'fa-solid fa-sun text-warning' : 'fa-solid fa-moon';
            icon.parentElement.classList.add('click-shrink');
            setTimeout(() => icon.parentElement.classList.remove('click-shrink'), 200);
        }
        localStorage.setItem('telecard_theme', isLight ? 'light' : 'dark');
        this.showToast(isLight ? 'تم تفعيل الوضع النهاري ☀️' : 'تم تفعيل الوضع الليلي 🌙', 'info', 1500);
    },

    // 🚀 [الرادار المعماري]: نافذة طلب الإشعارات الخاصة بالمدير
    showAdminPushPrompt: function() {
        if (typeof window === 'undefined' || !window.Notification) return;
        if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
        
        const lastPrompt = localStorage.getItem('tc_admin_push_prompt');
        if (lastPrompt && (Date.now() - parseInt(lastPrompt)) < 7 * 24 * 60 * 60 * 1000) return;

        if (document.getElementById('admin-push-prompt')) return;

        const html = `
            <div id="admin-push-prompt" class="sys-overlay active" style="z-index: 99999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6);">
                <div class="modal-content modal-md" style="animation: slideIn 0.3s ease; text-align: center;">
                    <div class="mb-15">
                        <i class="fa-solid fa-satellite-dish text-primary fa-3x mb-10 fa-beat-fade"></i>
                        <h2 class="main-title text-primary">رادار غرفة العمليات</h2>
                    </div>
                    <div class="alert-info mb-20 text-center">
                        هل ترغب بربط هذا الجهاز بغرفة العمليات لتلقي إنذارات فورية (Push Notifications) عند وصول طلبات، إيداعات، أو شكاوى جديدة؟
                    </div>
                    <div class="d-flex gap-10">
                        <button class="btn btn-primary flex-1" data-action="enable-admin-notifs">
                            <i class="fa-solid fa-check"></i> تفعيل الرادار
                        </button>
                        <button class="btn btn-ghost flex-1" data-action="dismiss-admin-notifs">
                            ليس الآن
                        </button>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);
    },

    showToast: function(message, type='success', duration=3000) {
        const container = document.getElementById('toast-container');
        if(!container) return;
        container.innerHTML = ''; 
        const types = {
            success: { icon: 'fa-circle-check', cls: 'toast-success' },
            error: { icon: 'fa-circle-xmark', cls: 'toast-error' },
            warning: { icon: 'fa-triangle-exclamation', cls: 'toast-warning' },
            info: { icon: 'fa-circle-info', cls: 'toast-info' }
        };
        const config = types[type] || types.success;
        const toast = document.createElement('div');
        toast.className = config.cls;
        toast.innerHTML = AdminTemplates.toastContent(config.icon, message);
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('toast-hide');
                setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
            }
        }, duration);
    },
    
    showConfirm: function(message, title='تأكيد العملية', withNote=false) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('confirm-overlay');
            const msgEl = document.getElementById('confirm-message');
            const titleEl = document.getElementById('confirm-title');
            const noteEl = document.getElementById('confirm-note');
            if(!overlay || !msgEl) { resolve(confirm(message)); return; }

            msgEl.innerHTML = this._esc(message).replace(/\n/g, '<br>');
            if(titleEl) titleEl.textContent = title || 'تأكيد العملية';
            if(noteEl) { 
                noteEl.value = ''; 
                if (withNote) noteEl.classList.remove('hide-element');
                else noteEl.classList.add('hide-element');
            }
            
            const okBtn = document.getElementById('confirm-ok');
            const cancelBtn = document.getElementById('confirm-cancel');
            const newOkBtn = okBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOkBtn, okBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

            const closeDialog = (isOk) => {
                if(noteEl) noteEl.blur(); 
                overlay.classList.add('closing');
                setTimeout(() => {
                    overlay.classList.remove('active', 'closing');
                    const noteValue = noteEl ? noteEl.value.trim() : '';
                    if(isOk) EventBus.emit('confirm-dialog-ok', { note: noteValue }); 
                    resolve(isOk);
                }, 250); 
            };
            newOkBtn.addEventListener('click', () => closeDialog(true));
            newCancelBtn.addEventListener('click', () => closeDialog(false));
            overlay.classList.add('active');
        });
    },
    
    showPrompt: function(message, title = 'إدخال البيانات', defaultValue = '', isPassword = false) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('prompt-overlay');
            const titleEl = document.getElementById('prompt-title');
            const msgEl = document.getElementById('prompt-message') || document.getElementById('prompt-msg');
            const inputEl = document.getElementById('prompt-input');
            
            if (!overlay || !inputEl) {
                resolve(prompt(message, defaultValue));
                return;
            }
            
            if (titleEl) titleEl.textContent = title;
            if (msgEl) msgEl.innerHTML = this._esc(message).replace(/\n/g, '<br>');
            
            inputEl.value = defaultValue;
            inputEl.setAttribute('autocomplete', 'new-password');
            inputEl.setAttribute('spellcheck', 'false');
            inputEl.setAttribute('autocorrect', 'off');
            inputEl.type = isPassword ? 'password' : 'text';
            
            const okBtn = document.getElementById('prompt-ok');
            const cancelBtn = document.getElementById('prompt-cancel');
            const newOkBtn = okBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOkBtn, okBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            
            const closeDialog = (isOk) => {
                const val = inputEl.value.trim();
                inputEl.blur();
                inputEl.value = ''; 
                
                overlay.classList.add('closing');
                setTimeout(() => {
                    overlay.classList.remove('active', 'closing');
                    inputEl.type = 'text'; 
                    resolve(isOk ? val : null);
                }, 400); 
            };
            
            newOkBtn.addEventListener('click', () => closeDialog(true));
            newCancelBtn.addEventListener('click', () => closeDialog(false));
            inputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') closeDialog(true); });
            
            overlay.classList.add('active');
            if (window.innerWidth > 768) setTimeout(() => { inputEl.focus(); }, 350);
        });
    },    

    copyText: function(text, event, element) {
        if (event) { event.stopPropagation(); event.preventDefault(); }
        if (!text) return;
        const animateElement = (el) => {
            if (!el) return;
            el.classList.add('click-shrink');
            setTimeout(() => { el.classList.remove('click-shrink'); }, 200);
        };
        const fallbackCopy = (txt) => {
            const textArea = document.createElement("textarea");
            textArea.value = txt; textArea.style.position = "fixed"; textArea.style.left = "-9999px";
            document.body.appendChild(textArea); textArea.focus(); textArea.select();
            try { document.execCommand('copy'); this.showToast('تم النسخ!', 'success', 1500); animateElement(element); } 
            catch (err) { this.showToast('فشل النسخ', 'error'); }
            document.body.removeChild(textArea);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => { this.showToast('تم النسخ!', 'success', 1500); animateElement(element); })
            .catch(() => fallbackCopy(text));
        } else fallbackCopy(text);
    },
    
    copyToClipboard: async function(element) {
        if (!element) return;
        const textToCopy = element.innerText.trim();
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(textToCopy);
            else {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy; textArea.style.position = "fixed"; textArea.style.left = "-999999px";
                document.body.appendChild(textArea); textArea.focus(); textArea.select();
                document.execCommand('copy'); textArea.remove();
            }
            element.classList.add('copied-feedback');
            setTimeout(() => { element.classList.remove('copied-feedback'); }, 300);
            this.showToast(`تم نسخ: ${textToCopy}`, 'success');
        } catch (err) { this.showToast('حدث خطأ أثناء النسخ', 'error'); }
    },

    toggleLoader: function(show, text = 'جاري المعالجة...') {
        const loader = document.getElementById('loader');
        if (loader) {
            const textSpan = loader.querySelector('span');
            if (textSpan && text) textSpan.innerText = text;
            
            if (show) {
                loader.style.display = 'flex';
                loader.classList.add('active');
            } else {
                loader.classList.remove('active');
                setTimeout(() => { if (loader) loader.style.display = 'none'; }, 200);
            }
        }
    },    

    openModal: function(id) { 
        if (window.innerWidth < 992 && typeof this.closeSidebar === 'function') this.closeSidebar();
        
        document.querySelectorAll('.modal-overlay.active, .sys-overlay.active').forEach(overlay => {
            if (overlay.id !== 'm-' + id && overlay.id !== id) {
                overlay.classList.remove('active');
            }
        });

        const modalEl = document.getElementById('m-' + id) || document.getElementById(id);
        if (modalEl) {
            const scrollContent = modalEl.querySelector('.modal-content,.ud-modal-body,.ud-modal-pro');
            if (scrollContent) scrollContent.scrollTop = 0; 
            modalEl.scrollTop = 0; 
            modalEl.classList.add('active');
            document.body.style.overflow = 'hidden'; 
        } else {
            console.warn(`⚠️ UIService: لم يتم العثور على نافذة بالمعرف: ${id} أو m-${id}`);
        }

        if (id === 'prod') EventBus.emit('req-render-prod-config');
        if (id === 'profile') EventBus.emit('req-update-profile-ui');
        // إطلاق حدث لتهيئة بيانات نافذة الرادار في حال تم فتحها
        if (id === 'admin-prefs') EventBus.emit('req-update-prefs-ui');
    },

    closeModal: function(specificId = null) {
        if (specificId) {
            const modal = document.getElementById(specificId) || document.getElementById('m-' + specificId);
            if (modal) modal.classList.remove('active');
        } else {
            document.querySelectorAll('.modal-overlay.active, .sys-overlay.active').forEach(overlay => overlay.classList.remove('active'));
        }
        
        const anyModalActive = document.querySelectorAll('.modal-overlay.active, .sys-overlay.active').length > 0;
        if (!anyModalActive) {
            document.body.style.overflow = '';
        }
        
        this.tempImg = null;
        this.tempFile = null;
        EventBus.emit('modals-closed');
    },    

    toggleSidebar: function() {
        const sb = document.getElementById('sidebar');
        const ov = document.getElementById('sb-overlay');
        if (sb) { sb.classList.toggle('open'); sb.classList.toggle('active'); }
        if (ov) ov.classList.toggle('active'); 
    },
    
    closeSidebar: function() {
        const sb = document.getElementById('sidebar');
        const ov = document.getElementById('sb-overlay');
        if (sb) { sb.classList.remove('open'); if (window.innerWidth < 992) sb.classList.remove('active'); }
        if (ov) ov.classList.remove('active');
    },
    
    onResize: function() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sb-overlay');
        if (window.innerWidth >= 992) {
            if (sidebar) { sidebar.classList.add('active'); sidebar.classList.remove('open'); }
            if (overlay) overlay.classList.remove('active');
        } else { if (sidebar) sidebar.classList.remove('active'); }
    },
    
    openImageViewer: function(src) {
        if(!src) return;
        const viewer = document.getElementById('global-image-viewer');
        const img = document.getElementById('iv-main-img');
        if(viewer && img) { img.src = src; viewer.classList.add('active'); document.body.style.overflow = 'hidden'; }
    },
    
    closeImageViewer: function() {
        const viewer = document.getElementById('global-image-viewer');
        if(viewer) {
            viewer.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => { const img = document.getElementById('iv-main-img'); if(img) img.src = ''; }, 400);
        }
    },
    
    clearImg: function(previewId, wrapperId, inputId, event) {
        if(event) event.stopPropagation();
        const preview = document.getElementById(previewId); const wrapper = document.getElementById(wrapperId); const input = document.getElementById(inputId);
        if (preview) { preview.src = ''; preview.classList.add('hide-element'); }
        if (wrapper) wrapper.classList.remove('has-img');
        if (input) input.value = '';
        this.tempImg = null;
        this.tempFile = null; 
        EventBus.emit('image-cleared'); 
    },
    
    handleImageUpload: function(inputElement, previewId, wrapperId) {
        const file = inputElement.files[0];
        if (!file) return;
        
        this.tempFile = file; 

        this.processImage(file, (url) => {
            this.tempImg = url; 
            if (url) {
                EventBus.emit('image-uploaded', url); 
                const prevEl = document.getElementById(previewId); 
                const wrapEl = wrapperId ? document.getElementById(wrapperId) : null;
                if (prevEl) { prevEl.src = url; prevEl.classList.remove('hide-element'); }
                if (wrapEl) wrapEl.classList.add('has-img');
            } else {
                this.clearImg(previewId, wrapperId, inputElement.id);
            }
        });
    },

    processImage: async function(file, callback) {
        if(!file) return;
        
        if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => { if(callback) callback(e.target.result); };
            return;
        }

        this.toggleLoader(true, 'جاري معالجة الصورة...');
        try {
            const processedBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader(); 
                reader.readAsDataURL(file);
                reader.onload = (e) => {
                    const img = new Image(); 
                    img.src = e.target.result;
                    img.onload = () => {
                        const canvas = document.createElement('canvas'); 
                        const ctx = canvas.getContext('2d');
                        const scale = img.width > 800 ? 800 / img.width : 1;
                        canvas.width = img.width * scale; 
                        canvas.height = img.height * scale;
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', file.type === 'image/jpeg' ? 0.7 : undefined)); 
                    };
                    img.onerror = () => reject(new Error("فشل"));
                };
                reader.onerror = () => reject(new Error("فشل"));
            });
            this.toggleLoader(false);
            if(callback) callback(processedBase64);
        } catch (error) { 
            this.toggleLoader(false); 
            this.showToast('خطأ بالصورة', 'error'); 
            if(callback) callback(null); 
        }
    }
};
