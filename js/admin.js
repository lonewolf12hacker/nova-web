/* =========================================================
   Nova admin.js — Admin panel logic
   Requires: firebase-config.js loaded first
   ========================================================= */

/* ── State ──────────────────────────────────────────────── */
let allUsers = [];
let allCommands = [];
let statsCache = {};

/* ── Load all users ─────────────────────────────────────── */
async function loadUsers() {
  const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
  allUsers = [];
  snap.forEach(doc => {
    allUsers.push({ id: doc.id, ...doc.data() });
  });
  renderUsers();
  updateStats();
}

/* ── Load recent commands ───────────────────────────────── */
async function loadCommands() {
  const snap = await db.collection('commands')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();
  allCommands = [];
  snap.forEach(doc => {
    allCommands.push({ id: doc.id, ...doc.data() });
  });
  renderCommands();
  updateStats();
}

/* ── Update stats ───────────────────────────────────────── */
function updateStats() {
  const totalUsers = allUsers.length;
  const totalCmds = allCommands.length;

  // Commands today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmdsToday = allCommands.filter(c => {
    if (!c.timestamp) return false;
    const t = c.timestamp.toDate ? c.timestamp.toDate() : new Date(c.timestamp);
    return t >= today;
  }).length;

  // Active users (logged in last 24h)
  const oneDayAgo = new Date(Date.now() - 86400000);
  const activeUsers = allUsers.filter(u => {
    if (!u.lastLogin) return false;
    const t = u.lastLogin.toDate ? u.lastLogin.toDate() : new Date(u.lastLogin);
    return t >= oneDayAgo;
  }).length;

  document.getElementById('stat-users').textContent = totalUsers;
  document.getElementById('stat-commands').textContent = cmdsToday;
  document.getElementById('stat-total-cmds').textContent = totalCmds;
  document.getElementById('stat-active').textContent = activeUsers;
}

/* ── Render users table ─────────────────────────────────── */
function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = allUsers.map(u => {
    const created = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A';
    const lastLogin = u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : 'N/A';
    const roleBadge = u.role === 'admin'
      ? '<span class="badge badge-cyan">ADMIN</span>'
      : '<span class="badge badge-violet">USER</span>';
    const banBtn = u.role === 'admin' ? '' : (
      u.banned
        ? `<button class="action-btn unban" onclick="unbanUser('${u.id}')">Unban</button>`
        : `<button class="action-btn ban" onclick="banUser('${u.id}')">Ban</button>`
    );
    const makeAdminBtn = u.role !== 'admin'
      ? `<button class="action-btn promote" onclick="promoteUser('${u.id}')">Make Admin</button>`
      : '';
    const statusDot = u.banned
      ? '<span style="color:#ff4466;">● Banned</span>'
      : '<span style="color:#00ff88;">● Active</span>';

    return `<tr>
      <td>${escapeH(u.name || 'N/A')}</td>
      <td>${escapeH(u.email)}</td>
      <td>${roleBadge}</td>
      <td>${statusDot}</td>
      <td>${created}</td>
      <td>${lastLogin}</td>
      <td>${banBtn} ${makeAdminBtn}</td>
    </tr>`;
  }).join('');
}

/* ── Render commands log ────────────────────────────────── */
function renderCommands() {
  const list = document.getElementById('commands-list');
  if (!list) return;
  list.innerHTML = allCommands.map(c => {
    const time = c.timestamp?.toDate ? c.timestamp.toDate().toLocaleString() : 'N/A';
    return `<div class="cmd-log-item">
      <div class="cmd-log-header">
        <span class="cmd-log-email">${escapeH(c.email)}</span>
        <span class="cmd-log-time">${time}</span>
      </div>
      <div class="cmd-log-cmd">› ${escapeH(c.command)}</div>
      <div class="cmd-log-reply">${escapeH(c.reply || '')}</div>
    </div>`;
  }).join('') || '<div style="color:var(--muted);text-align:center;padding:40px;">No commands logged yet.</div>';
}

/* ── User actions ───────────────────────────────────────── */
async function banUser(uid) {
  if (!confirm('Ban this user? They will be logged out immediately.')) return;
  await db.collection('users').doc(uid).update({ banned: true });
  await loadUsers();
}
async function unbanUser(uid) {
  await db.collection('users').doc(uid).update({ banned: false });
  await loadUsers();
}
async function promoteUser(uid) {
  if (!confirm('Give this user admin access? They will be able to manage all users.')) return;
  await db.collection('users').doc(uid).update({ role: 'admin' });
  await loadUsers();
}

/* ── Nova URL management ────────────────────────────────── */
async function loadNovaUrl() {
  const input = document.getElementById('admin-nova-url');
  if (!input) return;
  const url = await getGlobalNovaUrl();
  if (url) input.value = url;
}
async function saveNovaUrl() {
  const input = document.getElementById('admin-nova-url');
  const url = input.value.trim().replace(/\/$/, '');
  await setGlobalNovaUrl(url);
  const status = document.getElementById('nova-url-status');
  status.textContent = '✓ Saved!';
  status.style.color = '#00ff88';
  setTimeout(() => { status.textContent = ''; }, 3000);
}

/* ── Utility ────────────────────────────────────────────── */
function escapeH(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Panel tabs ─────────────────────────────────────────── */
function showAdminPanel(panel) {
  document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.admin-side-link').forEach(l => l.classList.remove('active'));
  const target = document.getElementById(`panel-${panel}`);
  if (target) target.style.display = 'block';
  event.currentTarget.classList.add('active');
}

/* ── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadUsers();
  await loadCommands();
  await loadNovaUrl();

  // Auto-refresh every 30s
  setInterval(async () => {
    await loadUsers();
    await loadCommands();
  }, 30000);
});
