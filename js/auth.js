/* =========================================================
   Nova auth.js — Firebase Auth + localStorage fallback
   ========================================================= */

const SESSION_KEY = 'nova_session';

/* ── Session helpers (local cache of Firebase state) ────── */
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}
function setSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* ── Auth guard — redirects to login if not authenticated ── */
function requireAuth(callback) {
  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
      const profile = await getUserProfile(user.uid);
      if (profile && profile.banned) {
        await auth.signOut();
        clearSession();
        alert('Your account has been suspended. Contact the administrator.');
        window.location.href = 'login.html';
        return;
      }
      const session = {
        uid: user.uid,
        email: user.email,
        name: profile?.name || user.email.split('@')[0],
        role: profile?.role || 'user'
      };
      setSession(session);
      if (callback) callback(session);
    });
  } else {
    // Fallback: localStorage only
    const s = getSession();
    if (!s) { window.location.href = 'login.html'; return; }
    if (callback) callback(s);
  }
}

/* ── Admin guard — only admin role can access ──────────── */
function requireAdmin(callback) {
  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    auth.onAuthStateChanged(async (user) => {
      if (!user) { window.location.href = 'login.html'; return; }
      const admin = await isAdmin(user.uid);
      if (!admin) {
        alert('Access denied. Admin privileges required.');
        window.location.href = 'dashboard.html';
        return;
      }
      const profile = await getUserProfile(user.uid);
      const session = {
        uid: user.uid,
        email: user.email,
        name: profile?.name || user.email.split('@')[0],
        role: 'admin'
      };
      setSession(session);
      if (callback) callback(session);
    });
  } else {
    const s = getSession();
    if (!s || s.role !== 'admin') {
      alert('Access denied. Admin privileges required.');
      window.location.href = 'dashboard.html';
      return;
    }
    if (callback) callback(s);
  }
}

/* ── Logout ─────────────────────────────────────────────── */
function logout() {
  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    auth.signOut().then(() => {
      clearSession();
      window.location.href = 'login.html';
    });
  } else {
    clearSession();
    window.location.href = 'login.html';
  }
}

/* ── Register (Firebase) ────────────────────────────────── */
async function firebaseRegister(name, email, password) {
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await ensureUserProfile(cred.user, { name });
    setSession({ uid: cred.user.uid, email, name, role: 'user' });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: firebaseErrorMsg(e.code) };
  }
}

/* ── Login (Firebase) ───────────────────────────────────── */
async function firebaseLogin(email, password) {
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    await ensureUserProfile(cred.user);
    const profile = await getUserProfile(cred.user.uid);
    if (profile && profile.banned) {
      await auth.signOut();
      return { ok: false, msg: 'Your account has been suspended.' };
    }
    setSession({
      uid: cred.user.uid,
      email: cred.user.email,
      name: profile?.name || cred.user.email.split('@')[0],
      role: profile?.role || 'user'
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: firebaseErrorMsg(e.code) };
  }
}

/* ── Fallback register/login (localStorage) ─────────────── */
function localRegister(name, email, password) {
  const users = JSON.parse(localStorage.getItem('nova_users') || '{}');
  const key = email.toLowerCase().trim();
  if (users[key]) return { ok: false, msg: 'An account with this email already exists.' };
  if (password.length < 6) return { ok: false, msg: 'Password must be at least 6 characters.' };
  users[key] = { name: name.trim(), email: key, hash: btoa(password), role: 'user' };
  localStorage.setItem('nova_users', JSON.stringify(users));
  setSession({ email: key, name: name.trim(), role: 'user' });
  return { ok: true };
}
function localLogin(email, password) {
  const users = JSON.parse(localStorage.getItem('nova_users') || '{}');
  const key = email.toLowerCase().trim();
  const user = users[key];
  if (!user) return { ok: false, msg: 'No account found with that email.' };
  if (user.hash !== btoa(password)) return { ok: false, msg: 'Incorrect password.' };
  setSession({ email: key, name: user.name, role: user.role || 'user' });
  return { ok: true };
}

/* ── Unified register/login (auto-picks Firebase or local) ─ */
async function register(name, email, password) {
  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    return await firebaseRegister(name, email, password);
  }
  return localRegister(name, email, password);
}
async function login(email, password) {
  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    return await firebaseLogin(email, password);
  }
  return localLogin(email, password);
}

/* ── Firebase error messages ────────────────────────────── */
function firebaseErrorMsg(code) {
  const msgs = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/invalid-credential': 'Invalid email or password.',
  };
  return msgs[code] || `Authentication error: ${code}`;
}

/* ── UI helpers ─────────────────────────────────────────── */
function showError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.animation = 'none';
  requestAnimationFrame(() => { el.style.animation = 'shake 0.4s ease'; });
}
function hideError() {
  const el = document.getElementById('auth-error');
  if (el) el.style.display = 'none';
}
function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.orig = btn.textContent;
    btn.innerHTML = '<span class="dot-loader"><span></span><span></span><span></span></span>';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.orig || 'Submit';
    btn.disabled = false;
  }
}

/* ── Tab switch ─────────────────────────────────────────── */
function switchTab(tab) {
  const loginPanel = document.getElementById('login-panel');
  const registerPanel = document.getElementById('register-panel');
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  if (tab === 'login') {
    if (loginPanel) loginPanel.style.display = 'block';
    if (registerPanel) registerPanel.style.display = 'none';
  } else {
    if (loginPanel) loginPanel.style.display = 'none';
    if (registerPanel) registerPanel.style.display = 'block';
  }
  hideError();
}

/* ── Form handlers ──────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  setLoading(btn, true);
  const res = await login(email, pass);
  setLoading(btn, false);
  if (res.ok) {
    window.location.href = 'dashboard.html';
  } else {
    showError(res.msg);
  }
}
async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const pass = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-confirm').value;
  if (pass !== confirm) { showError('Passwords do not match.'); return; }
  setLoading(btn, true);
  const res = await register(name, email, pass);
  setLoading(btn, false);
  if (res.ok) {
    window.location.href = 'dashboard.html';
  } else {
    showError(res.msg);
  }
}

/* Shake animation for error */
if (!document.getElementById('shake-style')) {
  const shakeStyle = document.createElement('style');
  shakeStyle.id = 'shake-style';
  shakeStyle.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-8px)}
    40%{transform:translateX(8px)}
    60%{transform:translateX(-6px)}
    80%{transform:translateX(6px)}
  }`;
  document.head.appendChild(shakeStyle);
}
