
// ============================================================
// auth.js — Registration & Login Logic
// ============================================================

// !! Replace with your deployed Google Apps Script Web App URL !!
const API_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';

// ── Utility: API call ──────────────────────────────────────
async function apiCall(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
    headers: { 'Content-Type': 'text/plain' } // GAS requires text/plain for CORS
  });
  return res.json();
}

// ── Utility: Toast ─────────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = { error: '✕', success: '✓', info: 'ℹ' };
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Utility: Session ───────────────────────────────────────
function saveSession(userId, name, email) {
  sessionStorage.setItem('ludoUser', JSON.stringify({ userId, name, email }));
  localStorage.setItem('ludoUser', JSON.stringify({ userId, name, email }));
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('ludoUser'));
  } catch { return null; }
}

function clearSession() {
  localStorage.removeItem('ludoUser');
  sessionStorage.removeItem('ludoUser');
}

// ── Utility: Loading ───────────────────────────────────────
function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div> Kuch segundos...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled = false;
  }
}

// ── Check if already logged in ────────────────────────────
function checkAuth(redirectTo = 'lobby.html') {
  const user = getSession();
  if (user && user.userId) {
    window.location.href = redirectTo;
    return true;
  }
  return false;
}

// ── Handle email verify token on login page ───────────────
function handleVerifyToken() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid');
  const token = params.get('token');
  if (uid && token) {
    // Auto-fill user ID
    const uidInput = document.getElementById('login-userid');
    if (uidInput) uidInput.value = uid;
    // Trigger verify silently
    apiCall('verifyEmail', { uid, token }).catch(() => {});
    showToast('Email verified! Ab login karein 🎉', 'success');
  }
}

// ============================================================
// PAGE: index.html (Register)
// ============================================================
function initRegisterPage() {
  if (checkAuth()) return;

  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const btn = form.querySelector('button[type="submit"]');

    if (!name || !email) return showToast('Naam aur email daalein', 'error');
    if (!/\S+@\S+\.\S+/.test(email)) return showToast('Valid email daalein', 'error');

    setLoading(btn, true);
    try {
      const res = await apiCall('register', { name, email });
      if (res.success) {
        document.getElementById('register-form-section').classList.add('hidden');
        document.getElementById('register-success-section').classList.remove('hidden');
        document.getElementById('success-email').textContent = email;
      } else {
        showToast(res.message || 'Kuch galat hua', 'error');
      }
    } catch (err) {
      showToast('Network error. Dobara try karein.', 'error');
    }
    setLoading(btn, false);
  });
}

// ============================================================
// PAGE: login.html
// ============================================================
function initLoginPage() {
  if (checkAuth()) return;
  handleVerifyToken();

  const form = document.getElementById('login-form');
  const forgotLink = document.getElementById('forgot-link');
  const forgotSection = document.getElementById('forgot-section');
  const forgotForm = document.getElementById('forgot-form');
  const backToLogin = document.getElementById('back-to-login');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('login-userid').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const btn = form.querySelector('button[type="submit"]');

    if (!userId || !password) return showToast('User ID aur password daalein', 'error');

    setLoading(btn, true);
    try {
      const res = await apiCall('login', { userId, password });
      if (res.success) {
        saveSession(res.userId, res.name, res.email);
        showToast(`Welcome back, ${res.name}! 🎲`, 'success');

        if (res.isFirstLogin) {
          // Show password choice modal
          setTimeout(() => showPasswordChoiceModal(res.userId, password), 800);
        } else {
          setTimeout(() => window.location.href = 'lobby.html', 1200);
        }
      } else {
        showToast(res.message || 'Login failed', 'error');
      }
    } catch {
      showToast('Network error. Dobara try karein.', 'error');
    }
    setLoading(btn, false);
  });

  // Forgot password
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-section').classList.add('hidden');
      forgotSection.classList.remove('hidden');
    });
  }

  if (backToLogin) {
    backToLogin.addEventListener('click', () => {
      forgotSection.classList.add('hidden');
      document.getElementById('login-section').classList.remove('hidden');
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim().toLowerCase();
      const btn = forgotForm.querySelector('button[type="submit"]');
      if (!email) return showToast('Email daalein', 'error');

      setLoading(btn, true);
      try {
        const res = await apiCall('forgotPassword', { email });
        if (res.success) {
          showToast('Email bhej di gayi! Check karein 📧', 'success');
          setTimeout(() => {
            forgotSection.classList.add('hidden');
            document.getElementById('login-section').classList.remove('hidden');
          }, 2000);
        } else {
          showToast(res.message, 'error');
        }
      } catch {
        showToast('Network error', 'error');
      }
      setLoading(btn, false);
    });
  }
}

// ── Password Choice Modal ──────────────────────────────────
function showPasswordChoiceModal(userId, currentPass) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'pwd-modal';
  backdrop.innerHTML = `
    <div class="modal">
      <span class="modal-emoji">🔐</span>
      <div class="modal-title">PASSWORD</div>
      <p class="modal-sub" style="margin-bottom:24px;">Aap pehli baar login kar rahe hain.<br>Password rakhein ya naya set karein?</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="btn btn-secondary" id="keep-pass-btn">✓ Ye Wala Rakhein</button>
        <button class="btn btn-primary" id="change-pass-btn">✎ Naya Password Set Karein</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  document.getElementById('keep-pass-btn').addEventListener('click', () => {
    backdrop.remove();
    window.location.href = 'lobby.html';
  });

  document.getElementById('change-pass-btn').addEventListener('click', () => {
    backdrop.remove();
    sessionStorage.setItem('ludoChangePass', userId);
    window.location.href = 'set-password.html';
  });
}

// ============================================================
// PAGE: set-password.html
// ============================================================
function initSetPasswordPage() {
  const session = getSession();
  const changeUid = sessionStorage.getItem('ludoChangePass');
  const userId = changeUid || (session && session.userId);

  if (!userId) {
    window.location.href = 'login.html';
    return;
  }

  const form = document.getElementById('set-pass-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    const btn = form.querySelector('button[type="submit"]');

    if (!newPass || newPass.length < 4) return showToast('Password minimum 4 characters ka hona chahiye', 'error');
    if (newPass !== confirmPass) return showToast('Passwords match nahi kar rahe', 'error');

    setLoading(btn, true);
    try {
      const res = await apiCall('setPassword', { userId, newPassword: newPass });
      if (res.success) {
        showToast('Password update ho gaya! 🎉', 'success');
        sessionStorage.removeItem('ludoChangePass');
        setTimeout(() => window.location.href = 'lobby.html', 1200);
      } else {
        showToast(res.message, 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setLoading(btn, false);
  });
}
