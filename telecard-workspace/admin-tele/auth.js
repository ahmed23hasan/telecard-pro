// ============================================================================
// 🔐 محرك المصادقة السحابي للإدارة (auth.js) - ES6 Module
// 🎯 الوظيفة: التحقق من هوية المدير عبر Firebase Auth والتوجيه الآمن
// ============================================================================

import { auth } from './core/firebaseAdapter.js';
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

/**
 * دالة إدارة واجهة أزرار الدخول والتفاعل (UX)
 */
const setBtnLoading = (isLoading) => {
    const btn = document.getElementById('btn-login');
    const btnText = document.getElementById('btn-text');
    const btnIcon = document.getElementById('btn-icon');

    if (!btn) return;

    if (isLoading) {
        btn.disabled = true;
        btn.classList.add('btn-loading');
        if (btnText) btnText.innerText = "جاري التحقق سحابياً...";
        if (btnIcon) btnIcon.className = "fa-solid fa-circle-notch fa-spin spinner";
    } else {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        if (btnText) btnText.innerText = "دخول آمن";
        if (btnIcon) btnIcon.className = "fa-solid fa-arrow-right-to-bracket";
    }
};

// ننتظر حتى يكتمل بناء الصفحة بالكامل
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('admin-login-form');
    const emailInput = document.getElementById('auth-email');
    const passInput = document.getElementById('auth-password');
    const errorMsg = document.getElementById('auth-error');

    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const inputEmail = emailInput.value.trim().toLowerCase();
        const inputPass = passInput.value;

        // 1. تفعيل حالة التحميل وإخفاء الأخطاء
        errorMsg.classList.add('hide-element');
        setBtnLoading(true);

        try {
            // 2. الاتصال بمحرك المصادقة الرسمي لفايربيز
            const userCredential = await signInWithEmailAndPassword(auth, inputEmail, inputPass);
            const user = userCredential.user;

            // 3. الحماية الصارمة: التحقق من المعرف الخاص بك (Master Admin UID)
            if (user.uid !== 'e064MQJyn6dhU9mNXZvXItc7VYg2') {
                await auth.signOut(); // طرد فوري وإلغاء الجلسة
                throw new Error('NotAuthorizedAdmin');
            }

            // 4. نجاح الدخول: إصدار تذكرة المرور المحلية
            sessionStorage.setItem('telecard_admin_auth', 'true');
            
            const btnLogin = document.getElementById('btn-login');
            btnLogin.style.background = "#10b981";
            document.getElementById('btn-text').innerText = "تم التحقق.. جاري الدخول";
            
            // 5. التوجيه بسلام إلى لوحة الإدارة
            setTimeout(() => {
                window.location.replace('admin.html');
            }, 800);

        } catch (error) {
            // ❌ معالجة الأخطاء
            console.error("Login Error:", error.code, error.message);
            
            if (error.message === 'NotAuthorizedAdmin') {
                errorMsg.innerText = 'عذراً، هذا الحساب لا يملك صلاحيات دخول لوحة الإدارة.';
            } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                errorMsg.innerText = 'البريد الإلكتروني أو كلمة المرور غير صحيحة!';
            } else {
                errorMsg.innerText = 'حدث خطأ. تأكد من اتصالك بالإنترنت وأن الحساب موجود في فايربيز.';
            }
            
            errorMsg.classList.remove('hide-element');
            setBtnLoading(false);
            
            // تأثير اهتزاز بصري عند الخطأ
            loginForm.classList.add('shake-anim');
            setTimeout(() => loginForm.classList.remove('shake-anim'), 500);
        }
    });
});
