
// ============================================================
// auth.js — Registration & Login Logic
// ============================================================

// !! Replace with your deployed Google Apps Script Web App URL !!
const API_URL = 'https://script.google.com/macros/s/AKfycbwXFO5BqYDb5SquLMWIAgSn6pmDrbf8V_0UubrUTaqqPk3ryx17k5zSUHN46QZYWT663w/exec';





// ============================================================
// auth.js — Registration & Login Logic (English)
// ============================================================

async function apiCall(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
    headers: { 'Content-Type': 'text/plain' }
  });
  return res.json();
}

// ── Toast ──────────────────────────────────────────────────
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

// ── Session ────────────────────────────────────────────────
function saveSession(userId, name, email) {
  const data = JSON.stringify({ userId, name, email });
  sessionStorage.setItem('ludoUser', data);
  localStorage.setItem('ludoUser', data);
}
function getSession() {
  try { return JSON.parse(localStorage.getItem('ludoUser')); } catch { return null; }
}
function clearSession() {
  localStorage.removeItem('ludoUser');
  sessionStorage.removeItem('ludoUser');
}

// ── Loading ────────────────────────────────────────────────
function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div> Please wait...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled = false;
  }
}

// ── Auth check ─────────────────────────────────────────────
function checkAuth(redirectTo = 'lobby.html') {
  const user = getSession();
  if (user && user.userId) { window.location.href = redirectTo; return true; }
  return false;
}

// ── Theme ──────────────────────────────────────────────────
function applyTheme() {
  const theme = localStorage.getItem('ludoTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const html  = document.documentElement;
  const next  = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('ludoTheme', next);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '🌙' : '☀️';
}

// ── Handle verify token from email link ────────────────────
function handleVerifyToken() {
  const params = new URLSearchParams(window.location.search);
  const uid    = params.get('uid');
  const token  = params.get('token');
  if (uid && token) {
    const uidInput = document.getElementById('login-userid');
    if (uidInput) uidInput.value = uid;
    apiCall('verifyEmail', { uid, token }).catch(() => {});
    showToast('Email verified! Please login 🎉', 'success');
  }
}

// ============================================================
// PAGE: index.html (Register)
// ============================================================
function initRegisterPage() {
  applyTheme();
  if (checkAuth()) return;

  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name  = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const btn   = form.querySelector('button[type="submit"]');

    if (!name || !email)           return showToast('Name and email are required', 'error');
    if (!/\S+@\S+\.\S+/.test(email)) return showToast('Please enter a valid email', 'error');
    if (name.length < 2)           return showToast('Name must be at least 2 characters', 'error');

    setLoading(btn, true);
    try {
      const res = await apiCall('register', { name, email });
      if (res.success) {
        document.getElementById('register-form-section').classList.add('hidden');
        document.getElementById('register-success-section').classList.remove('hidden');
        document.getElementById('success-email').textContent = email;
      } else {
        showToast(res.message || 'Something went wrong', 'error');
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    }
    setLoading(btn, false);
  });
}

// ============================================================
// PAGE: login.html
// ============================================================
function initLoginPage() {
  applyTheme();
  if (checkAuth()) return;
  handleVerifyToken();

  const form       = document.getElementById('login-form');
  const forgotLink = document.getElementById('forgot-link');
  const forgotForm = document.getElementById('forgot-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId   = document.getElementById('login-userid').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const btn      = form.querySelector('button[type="submit"]');

    if (!userId || !password) return showToast('Please enter your User ID and password', 'error');

    setLoading(btn, true);
    try {
      const res = await apiCall('login', { userId, password });
      if (res.success) {
        saveSession(res.userId, res.name, res.email);
        showToast(`Welcome back, ${res.name}! 🎲`, 'success');
        if (res.isFirstLogin) {
          setTimeout(() => showPasswordChoiceModal(res.userId), 800);
        } else {
          setTimeout(() => window.location.href = 'lobby.html', 1200);
        }
      } else {
        showToast(res.message || 'Login failed. Check your credentials.', 'error');
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    }
    setLoading(btn, false);
  });

  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-section').classList.add('hidden');
      document.getElementById('forgot-section').classList.remove('hidden');
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim().toLowerCase();
      const btn   = forgotForm.querySelector('button[type="submit"]');
      if (!email) return showToast('Please enter your email', 'error');

      setLoading(btn, true);
      try {
        const res = await apiCall('forgotPassword', { email });
        if (res.success) {
          showToast('New credentials sent to your email! 📧', 'success');
          setTimeout(() => {
            document.getElementById('forgot-section').classList.add('hidden');
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

function showPasswordChoiceModal(userId) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'pwd-modal';
  backdrop.innerHTML = `
    <div class="modal">
      <span class="modal-emoji">🔐</span>
      <div class="modal-title">PASSWORD</div>
      <p class="modal-sub" style="margin-bottom:24px;">This is your first login.<br>Keep the temporary password or set a new one?</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="btn btn-secondary" id="keep-pass-btn">✓ Keep Current Password</button>
        <button class="btn btn-primary"   id="change-pass-btn">✎ Set New Password</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  document.getElementById('keep-pass-btn').addEventListener('click', () => {
    backdrop.remove(); window.location.href = 'lobby.html';
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
  applyTheme();
  const changeUid = sessionStorage.getItem('ludoChangePass');
  const session   = getSession();
  const userId    = changeUid || (session && session.userId);
  if (!userId) { window.location.href = 'login.html'; return; }

  const form = document.getElementById('set-pass-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass     = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    const btn         = form.querySelector('button[type="submit"]');

    if (!newPass || newPass.length < 4) return showToast('Password must be at least 4 characters', 'error');
    if (newPass !== confirmPass)        return showToast('Passwords do not match', 'error');

    setLoading(btn, true);
    try {
      const res = await apiCall('setPassword', { userId, newPassword: newPass });
      if (res.success) {
        showToast('Password updated successfully! 🎉', 'success');
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
