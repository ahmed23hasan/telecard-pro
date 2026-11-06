// ============================================================================
// 🎨 خدمة الواجهات الأساسية (core/uiService.js) - النواة الصلبة V15.5 💎
// 🎯 الوظيفة: أدوات الواجهة المشتركة (الإشعارات، التحميل، النوافذ) بدون منطق عمل
// 🌟 التحديثات المعمارية:
// 1. Zero Inline Styles 🧹: إزالة كافة الستايلات المدمجة وتعيينات zIndex و display المباشرة والاعتماد كلياً على admin.css.
// 2. Dead Code & Duplicate Fix 🛠️: إزالة دالة closeModal المكررة وتوحيد منطق إغلاق النوافذ والـ Drawers وتنظيف العناصر الديناميكية.
// 3. Robust Error Prevention 🛡️: تصحيح أخطاء الـ DOM واستدعاءات getElementById.
// 4. Clean Loader State ⏱️: تبديل حالات شاشة التحميل عبر الفئات النشطة (.active / .hide-element) بدون كسر تخطيط الـ CSS.
// ============================================================================

import { Utils, EventBus } from '../adminUtils.js';
import { AdminTemplates } from '../adminTemplates.js';

export const UIService = {
    _esc: Utils.escapeHTML,
    tempImg: null,
    tempFile: null,
    _loaderTimer: null,

    // 🚀 تحويل الصورة المضغوطة إلى ملف حقيقي لرفعه للسيرفر
    base64ToBlob: function(base64Data, contentType = 'image/jpeg') {
        if (!base64Data || !base64Data.includes(',')) return null;
        const byteCharacters = atob(base64Data.split(',')[1]);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, { type: contentType });
    },

    // 🛡️ درع الحماية الهندسي ضد التخمين التلقائي لمتصفح كروم (Chromium Autofill Heuristics)
    shieldInputsFromBrowserAutofill: function(rootEl = document) {
        if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
        const fields = rootEl.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]), textarea');
        fields.forEach((el, idx) => {
            if (el.type !== 'password') {
                el.setAttribute('autocomplete', 'off');
            }
            el.setAttribute('autocorrect', 'off');
            el.setAttribute('autocapitalize', 'off');
            el.setAttribute('spellcheck', 'false');
            if (!el.getAttribute('name')) {
                el.setAttribute('name', `tc_adm_fld_${idx}`);
            }
        });
    },

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

        if (!this._autofillShieldBound) {
            this._autofillShieldBound = true;
            this.shieldInputsFromBrowserAutofill(document);
            document.addEventListener('focusin', (e) => {
                const el = e.target;
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    const container = el.closest('.modal-content, .section') || el.parentElement;
                    this.shieldInputsFromBrowserAutofill(container);
                }
            }, true);
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

    showAdminPushPrompt: function() {
        if (typeof window === 'undefined' || !window.Notification) return;
        if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
        
        const lastPrompt = localStorage.getItem('tc_admin_push_prompt');
        if (lastPrompt && (Date.now() - parseInt(lastPrompt)) < 7 * 24 * 60 * 60 * 1000) return;

        if (document.getElementById('admin-push-prompt')) return;

        const html = `
            <div id="admin-push-prompt" class="sys-overlay active">
                <div class="modal-content modal-md text-center">
                    <div class="mb-15">
                        <i class="fa-solid fa-satellite-dish text-primary fa-3x mb-10 fa-beat-fade"></i>
                        <h2 class="main-title text-primary">رادار غرفة العمليات</h2>
                    </div>
                    <div class="alert-info mb-20 text-center">
                        هل ترغب بربط هذا الجهاز بغرفة العمليات لتلقي إنذارات فورية (Push Notifications) عند وصول طلبات، إيداعات، أو شكاوى جديدة؟
                    </div>
                    <div class="modal-actions-row">
                        <button class="btn btn-primary flex-1 interactive-scale" data-action="enable-admin-notifs">
                            <i class="fa-solid fa-check"></i> تفعيل الرادار
                        </button>
                        <button class="btn btn-ghost flex-1 interactive-scale" data-action="dismiss-admin-notifs">
                            ليس الآن
                        </button>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);
    },

    showToast: function(message, type='success', duration=3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
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
            if (!overlay || !msgEl) { resolve(confirm(message)); return; }

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

            let isClosing = false;
            const closeDialog = (isOk) => {
                if (isClosing) return;
                isClosing = true;
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
            inputEl.setAttribute('autocomplete', 'off');
            inputEl.setAttribute('name', 'tc_adm_prompt_val');
            inputEl.setAttribute('spellcheck', 'false');
            inputEl.setAttribute('autocorrect', 'off');
            inputEl.type = isPassword ? 'password' : 'text';
            
            const okBtn = document.getElementById('prompt-ok');
            const cancelBtn = document.getElementById('prompt-cancel');
            const newOkBtn = okBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOkBtn, okBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            
            let isClosing = false;
            const closeDialog = (isOk) => {
                if (isClosing) return;
                isClosing = true;
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
            
            inputEl.onkeypress = (e) => { 
                if (e.key === 'Enter') {
                    e.preventDefault();
                    closeDialog(true);
                }
            };
            
            overlay.classList.add('active');
            if (window.innerWidth > 768) setTimeout(() => { inputEl.focus(); }, 350);
        });
    },

    showReportModal: function(title, htmlContent) {
        const existingOverlay = document.getElementById('report-modal-overlay');
        if (existingOverlay) existingOverlay.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'report-modal-overlay';
        overlay.className = 'sys-overlay dynamic-auto-destroy active';
        
        overlay.innerHTML = `
            <div class="modal-content modal-md">
                <div class="modal-close-btn interactive-scale" data-action="close-modal" data-id="report-modal-overlay"><i class="fa-solid fa-xmark"></i></div>
                <h2 class="main-title"><i class="fa-solid fa-file-invoice"></i> ${this._esc(title)}</h2>
                <div class="fh-scroll-list text-start">
                    ${htmlContent}
                </div>
                <div class="modal-actions-row border-top-solid mt-15 pt-15">
                    <button class="btn btn-outline-danger interactive-scale w-100" data-action="close-modal" data-id="report-modal-overlay">إغلاق التقرير</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
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
            textArea.value = txt; 
            textArea.style.position = "fixed"; 
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea); 
            textArea.focus(); 
            textArea.select();
            try { 
                document.execCommand('copy'); 
                this.showToast('تم النسخ!', 'success', 1500); 
                animateElement(element); 
            } catch (err) { 
                this.showToast('فشل النسخ', 'error'); 
            }
            document.body.removeChild(textArea);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => { 
                this.showToast('تم النسخ!', 'success', 1500); 
                animateElement(element); 
            }).catch(() => fallbackCopy(text));
        } else fallbackCopy(text);
    },
    
    copyToClipboard: async function(element) {
        if (!element) return;
        const textToCopy = element.innerText.trim();
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy; 
                textArea.style.position = "fixed"; 
                textArea.style.left = "-999999px";
                document.body.appendChild(textArea); 
                textArea.focus(); 
                textArea.select();
                document.execCommand('copy'); 
                textArea.remove();
            }
            element.classList.add('copied-feedback');
            setTimeout(() => { element.classList.remove('copied-feedback'); }, 300);
            this.showToast(`تم نسخ: ${textToCopy}`, 'success');
        } catch (err) { 
            this.showToast('حدث خطأ أثناء النسخ', 'error'); 
        }
    },

    toggleLoader: function(show, text = 'جاري المعالجة...') {
        const loader = document.getElementById('loader');
        if (loader) {
            if (this._loaderTimer) {
                clearTimeout(this._loaderTimer);
                this._loaderTimer = null;
            }
            const textSpan = loader.querySelector('span');
            if (textSpan && text) textSpan.innerText = text;
            
            if (show) {
                loader.classList.remove('hide-element');
                loader.classList.add('active');
            } else {
                loader.classList.remove('active');
            }
        }
    },    

    openModal: function(id) { 
        if (window.innerWidth < 992 && typeof this.closeSidebar === 'function') this.closeSidebar();
        
        document.querySelectorAll('.modal-overlay.active, .sys-overlay.active, .drawer-overlay.active').forEach(overlay => {
            if (overlay.id !== 'm-' + id && overlay.id !== id) {
                overlay.classList.remove('active');
                if (overlay.classList.contains('dynamic-auto-destroy')) {
                    setTimeout(() => {
                        if (!overlay.classList.contains('active') && overlay.parentElement) overlay.remove();
                    }, 300);
                }
            }
        });

        const modalEl = document.getElementById('m-' + id) || document.getElementById(id);
        if (modalEl) {
            this.shieldInputsFromBrowserAutofill(modalEl);
            const scrollContent = modalEl.querySelector('.modal-content, .ud-modal-body, .ud-modal-pro');
            if (scrollContent) scrollContent.scrollTop = 0; 
            modalEl.scrollTop = 0; 
            modalEl.classList.add('active');
            document.body.style.overflow = 'hidden'; 
        } else {
            console.warn(`⚠️ UIService: لم يتم العثور على نافذة بالمعرف: ${id} أو m-${id}`);
        }

        if (id === 'prod') EventBus.emit('req-render-prod-config');
        if (id === 'profile') EventBus.emit('req-update-profile-ui');
        if (id === 'admin-prefs') EventBus.emit('req-update-prefs-ui');
    },

    closeModal: function(specificId = null) {
        const modalsToClose = specificId ?
            [document.getElementById(specificId) || document.getElementById('m-' + specificId)] :
            document.querySelectorAll('.modal-overlay.active, .sys-overlay.active, .drawer-overlay.active');
        
        modalsToClose.forEach(modal => {
            if (modal) {
                modal.classList.remove('active');
                
                setTimeout(() => {
                    if (!modal.classList.contains('active') && modal.classList.contains('dynamic-auto-destroy') && modal.parentElement) {
                        modal.remove();
                    }
                }, 300);
            }
        });
        
        const anyModalActive = document.querySelectorAll('.modal-overlay.active, .sys-overlay.active, .drawer-overlay.active').length > 0;
        if (!anyModalActive) {
            document.body.style.overflow = '';
            this.tempImg = null;
            this.tempFile = null;
            EventBus.emit('modals-closed');
        }
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
        if (window.innerWidth >= 992) {
            const overlay = document.getElementById('sb-overlay');
            if (overlay) overlay.classList.remove('active');
            
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('open', 'active');
        }
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
        const preview = document.getElementById(previewId); 
        const wrapper = document.getElementById(wrapperId); 
        const input = document.getElementById(inputId);
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
        
        if (file.type === 'image/gif') {
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
                        const maxDimension = Math.max(img.width, img.height);
                        const scale = maxDimension > 800 ? 800 / maxDimension : 1;
                        canvas.width = img.width * scale; 
                        canvas.height = img.height * scale;
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const outputMime = (file.type === 'image/png' || file.type === 'image/webp') ? file.type : 'image/jpeg';
                        resolve(canvas.toDataURL(outputMime, outputMime === 'image/jpeg' ? 0.7 : 0.85)); 
                        
                        // 🧹 [حماية الذاكرة]: تنظيف الكانفاس والصورة من الذاكرة العشوائية (RAM)
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        canvas.width = 0;
                        canvas.height = 0;
                        img.onload = null;
                        img.onerror = null;
                        img.src = '';
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
