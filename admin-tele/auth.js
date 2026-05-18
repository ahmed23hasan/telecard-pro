// ============================================================================
// 🔐 محرك المصادقة السحابي (auth.js) - ES6 Module
// الوظيفة: التحقق من هوية المدير عبر Firestore والتوجيه الآمن
// ============================================================================

import { DB_KEYS } from './adminConfig.js';
import { FirebaseAdapter } from './core/firebaseAdapter.js';

/**
 * دالة إدارة واجهة أزرار الدخول (UX)
 */
const setBtnLoading = (isLoading) => {
    const btn = document.getElementById('btn-login');
    const btnText = document.getElementById('btn-text');
    const btnIcon = document.getElementById('btn-icon');

    if (isLoading) {
        btn.disabled = true;
        btn.classList.add('btn-loading');
        if (btnText) btnText.innerText = "جاري التحقق سحابياً...";
        if (btnIcon) btnIcon.className = "fa-solid fa-circle-notch fa-spin";
    } else {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        if (btnText) btnText.innerText = "دخول آمن";
        if (btnIcon) btnIcon.className = "fa-solid fa-arrow-right-to-bracket";
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('admin-login-form');
    const errorMsg = document.getElementById('auth-error');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const emailInput = document.getElementById('auth-email');
            const passInput = document.getElementById('auth-password');
            const email = emailInput.value.trim().toLowerCase();
            const password = passInput.value.trim();

            // 1. تفعيل حالة التحميل
            setBtnLoading(true);
            errorMsg.classList.add('hide-element');

            try {
                // 2. جلب بيانات المدير من السحابة (مستند singleton)
                // نحن نستخدم getById لأن الإدمن دائماً مستند واحد فريد
                const adminProfile = await FirebaseAdapter.getById(DB_KEYS.ADMIN, 'singleton');

                // 3. منطق التحقق الاحترافي
                if (adminProfile) {
                    if (email === adminProfile.email.toLowerCase() && password === adminProfile.pass) {
                        // ✅ نجاح الدخول
                        sessionStorage.setItem('telecard_admin_auth', 'true');
                        
                        // حفظ لقطة لبروفايل الإدمن للسرعة (اختياري)
                        localStorage.setItem('telecard_admin_identity', JSON.stringify({
                            name: adminProfile.name,
                            img: adminProfile.img
                        }));

                        window.location.replace('admin.html');
                    } else {
                        throw new Error('Invalid Credentials');
                    }
                } else {
                    // 🚩 Fallback: في حال كانت قاعدة البيانات فارغة تماماً عند أول تشغيل
                    if (email === 'admin@telecard.pro' && password === '123') {
                        sessionStorage.setItem('telecard_admin_auth', 'true');
                        window.location.replace('admin.html');
                    } else {
                        throw new Error('No Admin Found');
                    }
                }

            } catch (error) {
                // ❌ فشل الدخول
                console.error("Auth System Error:", error.message);
                errorMsg.classList.remove('hide-element');
                setBtnLoading(false);
                
                // إضافة تأثير اهتزاز للنموذج عند الخطأ (UX)
                loginForm.classList.add('shake-anim');
                setTimeout(() => loginForm.classList.remove('shake-anim'), 500);
            }
        });
    }
});
