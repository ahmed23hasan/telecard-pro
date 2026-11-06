// ============================================================================
// 🔐 محرك المصادقة السحابي للإدارة (auth.js) - Bank Grade Security 🏦 V16.6 💎
// 🎯 الوظيفة: التحقق من هوية المشرف، حماية الجلسات، ودعم المصادقة الثنائية (2FA)
// ============================================================================

import { auth } from './core/firebaseAdapter.js';
import {
    signInWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence,
    getMultiFactorResolver,
    TotpMultiFactorGenerator
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// 🚀 الاعتماد الكامل على كلاس btn-loading المعرّف في admin.css لإظهار/إخفاء السبنر والأيقونة تلقائياً
const setBtnLoading = (isLoading) => {
    const btn = document.getElementById('btn-login');
    const btnText = document.getElementById('btn-text');
    
    if (!btn) return;
    
    btn.disabled = isLoading;
    btn.classList.toggle('btn-loading', isLoading);
    if (btnText) {
        btnText.innerText = isLoading ? "جاري التحقق..." : "دخول آمن";
    }
};

/**
 * 👑 دالة إنهاء الدخول وفحص صلاحيات الإدارة (Custom Claims)
 */
const finalizeAdminLogin = async (user) => {
    const idTokenResult = await user.getIdTokenResult();
    const isAuthorizedAdmin = idTokenResult.claims.admin === true;
    
    if (!isAuthorizedAdmin) {
        await auth.signOut();
        throw new Error('NotAuthorizedAdmin');
    }
    
    localStorage.setItem('telecard_admin_auth', 'true');
    localStorage.setItem('telecard_admin_last_activity', Date.now().toString());
    
    const btnLogin = document.getElementById('btn-login');
    const modal2fa = document.getElementById('admin-2fa-modal');
    const btnVerify = document.getElementById('btn-verify-2fa');
    
    if (modal2fa && modal2fa.classList.contains('active')) {
        if (btnVerify) {
            btnVerify.classList.add('is-success');
            btnVerify.innerHTML = "تم التحقق ✔";
        }
    } else if (btnLogin) {
        btnLogin.classList.remove('btn-loading');
        btnLogin.classList.add('is-success');
        const btnText = document.getElementById('btn-text');
        if (btnText) btnText.innerText = "تم التحقق.. جاري الدخول";
    }
    
    setTimeout(() => {
        window.location.replace('admin.html');
    }, 600);
};

/**
 * 🛡️ دالة إدارة المصادقة الثنائية (2FA) - بطريقة معمارية نظيفة
 */
const handle2FARequest = (resolver) => {
    const modal = document.getElementById('admin-2fa-modal');
    const input = document.getElementById('admin-2fa-code');
    const btnVerify = document.getElementById('btn-verify-2fa');
    const btnCancel = document.getElementById('btn-cancel-2fa');
    const errorMsg = document.getElementById('admin-2fa-error');
    
    if (!modal || !input || !btnVerify || !btnCancel || !errorMsg) return;
    
    input.value = '';
    errorMsg.classList.add('hide-element');
    modal.classList.add('active');
    input.focus();
    
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!btnVerify.disabled) btnVerify.click();
        }
    };
    
    btnCancel.onclick = () => {
        modal.classList.remove('active');
        setBtnLoading(false);
    };
    
    btnVerify.onclick = async () => {
        const code = input.value.trim();
        if (code.length !== 6) {
            errorMsg.innerText = "يجب إدخال 6 أرقام";
            errorMsg.classList.remove('hide-element');
            return;
        }
        
        const originalText = btnVerify.innerText;
        btnVerify.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        btnVerify.disabled = true;
        
        try {
            const tfaHint = resolver.hints[0];
            const assertion = TotpMultiFactorGenerator.assertionForSignIn(tfaHint.uid, code);
            const userCredential = await resolver.resolveSignIn(assertion);
            
            await finalizeAdminLogin(userCredential.user);
            
        } catch (error) {
            console.error("2FA Error:", error);
            if (error.message === 'NotAuthorizedAdmin') {
                errorMsg.innerText = "عذراً، هذا الحساب لا يملك صلاحيات (Admin) لدخول لوحة الإدارة.";
            } else {
                errorMsg.innerText = "الرمز غير صحيح أو منتهي الصلاحية";
            }
            errorMsg.classList.remove('hide-element');
            btnVerify.innerHTML = originalText;
            btnVerify.disabled = false;
        }
    };
};

// ============================================================================
// 🚀 بدء التنصت على نموذج الدخول
// ============================================================================
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
        
        errorMsg.classList.add('hide-element');
        setBtnLoading(true);
        
        try {
            await setPersistence(auth, browserLocalPersistence);
            const userCredential = await signInWithEmailAndPassword(auth, inputEmail, inputPass);
            await finalizeAdminLogin(userCredential.user);
            
        } catch (error) {
            if (error.code === 'auth/multi-factor-auth-required') {
                const resolver = getMultiFactorResolver(auth, error);
                handle2FARequest(resolver);
                return;
            }
            
            console.error("Login Error:", error.code, error.message);
            
            if (error.message === 'NotAuthorizedAdmin') {
                errorMsg.innerText = 'عذراً، هذا الحساب لا يملك صلاحيات (Admin) لدخول لوحة الإدارة.';
            } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                errorMsg.innerText = 'البريد الإلكتروني أو كلمة المرور غير صحيحة!';
            } else if (error.code === 'auth/too-many-requests') {
                errorMsg.innerText = 'محاولات خاطئة كثيرة! تم حظر الدخول مؤقتاً لحماية المتجر.';
            } else {
                errorMsg.innerText = 'حدث خطأ. تأكد من اتصالك بالإنترنت.';
            }
            
            errorMsg.classList.remove('hide-element');
            setBtnLoading(false);
            
            loginForm.classList.add('shake-anim');
            setTimeout(() => loginForm.classList.remove('shake-anim'), 500);
        }
    });
});