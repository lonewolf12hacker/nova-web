/* =========================================================
   Nova portal.js — Dashboard voice/text command interface
   Now integrates with Firebase for command logging
   ========================================================= */

/* ── Config ─────────────────────────────────────────────── */
let NOVA_API = localStorage.getItem('nova_api_url') || '';

/* ── DOM refs ───────────────────────────────────────────── */
const orbEl        = document.getElementById('portal-orb');
const orbLabel     = document.getElementById('orb-label');
const micBtn       = document.getElementById('mic-btn');
const textInput    = document.getElementById('cmd-input');
const sendBtn      = document.getElementById('send-btn');
const replyEl      = document.getElementById('nova-reply');
const historyEl    = document.getElementById('cmd-history');
const apiUrlInput  = document.getElementById('api-url-input');
const connectBtn   = document.getElementById('connect-btn');
const connStatus   = document.getElementById('conn-status');

/* ── State ──────────────────────────────────────────────── */
let commandHistory = [];
let isListening = false;
let recognition = null;

/* ── Load global Nova URL from Firestore ────────────────── */
async function loadGlobalNovaUrl() {
  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    try {
      const url = await getGlobalNovaUrl();
      if (url) {
        NOVA_API = url;
        if (apiUrlInput) apiUrlInput.value = url;
        localStorage.setItem('nova_api_url', url);
      }
    } catch (e) {
      console.log('Could not load global Nova URL:', e);
    }
  }
}

/* ── Connection ─────────────────────────────────────────── */
function updateApiUrl() {
  const url = (apiUrlInput ? apiUrlInput.value.trim() : '');
  NOVA_API = url.replace(/\/$/, '');
  localStorage.setItem('nova_api_url', NOVA_API);
  checkConnection();
}
async function checkConnection() {
  if (!connStatus) return;
  connStatus.textContent = 'Checking...';
  connStatus.style.color = '#aaa';
  try {
    const url = NOVA_API ? `${NOVA_API}/api/status` : '/api/status';
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      connStatus.textContent = '● Connected';
      connStatus.style.color = '#00ff88';
    } else throw new Error();
  } catch {
    connStatus.textContent = '● Disconnected';
    connStatus.style.color = '#ff4466';
  }
}

/* ── Nova API call ──────────────────────────────────────── */
async function sendToNova(cmd) {
  const endpoint = NOVA_API ? `${NOVA_API}/api/command` : '/api/command';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: cmd }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ── Process command ────────────────────────────────────── */
async function processCommand(cmd) {
  if (!cmd || !cmd.trim()) return;
  cmd = cmd.trim();

  setOrbState('thinking');
  replyEl.innerHTML = '<span class="dot-loader"><span></span><span></span><span></span></span>';

  let reply = '';
  try {
    const data = await sendToNova(cmd);
    reply = data.reply || 'Done.';
  } catch (e) {
    reply = localFallback(cmd);
  }

  replyEl.textContent = reply;
  addToHistory(cmd, reply);
  setOrbState('speaking');
  speakReply(reply, () => setOrbState('idle'));

  // Log to Firestore
  if (typeof firebase !== 'undefined' && isFirebaseConfigured() && auth.currentUser) {
    logCommand(auth.currentUser.uid, cmd, reply);
  }
}

/* ── Local fallback for when Nova PC is offline ─────────── */
function localFallback(cmd) {
  const c = cmd.toLowerCase();
  if (c.includes('time')) return `Current time: ${new Date().toLocaleTimeString()}`;
  if (c.includes('date')) return `Today is ${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}`;
  if (c.includes('hello') || c.includes('hey')) return "Hey! I'm Nova. Your PC isn't connected right now — set the API URL to connect.";
  return "Nova's PC isn't connected. Enter your ngrok URL in the sidebar to connect from anywhere.";
}

/* ── History ────────────────────────────────────────────── */
function addToHistory(q, r) {
  commandHistory.unshift({ q, r, t: new Date().toLocaleTimeString() });
  if (commandHistory.length > 20) commandHistory.pop();
  renderHistory();
}
function renderHistory() {
  if (!historyEl) return;
  historyEl.innerHTML = commandHistory.map((h, i) => `
    <div class="history-item" style="animation:fadeUp 0.3s ease ${i*0.05}s both">
      <div class="history-you">You: <span>${escapeHtml(h.q)}</span></div>
      <div class="history-nova">Nova: ${escapeHtml(h.r)}</div>
      <div class="history-time">${h.t}</div>
    </div>
  `).join('');
}
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Speech ─────────────────────────────────────────────── */
function speakReply(text, onDone) {
  if (!('speechSynthesis' in window)) { if (onDone) onDone(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.05; utter.pitch = 1.1;
  utter.onend = onDone || (() => {});
  utter.onerror = onDone || (() => {});
  window.speechSynthesis.speak(utter);
}

/* ── Microphone ─────────────────────────────────────────── */
function toggleMic() {
  if (isListening) { stopListening(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { replyEl.textContent = 'Voice not supported. Use Chrome or Edge.'; return; }
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    const t = e.results[0][0].transcript;
    if (textInput) textInput.value = t;
    stopListening();
    processCommand(t);
  };
  recognition.onerror = () => stopListening();
  recognition.onend = () => stopListening();
  recognition.start();
  isListening = true;
  setOrbState('listening');
  if (micBtn) { micBtn.classList.add('recording'); micBtn.textContent = '🔴'; }
}
function stopListening() {
  if (recognition) { try { recognition.stop(); } catch {} recognition = null; }
  isListening = false;
  if (micBtn) { micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; }
  if (orbEl && orbEl.dataset.state !== 'thinking') setOrbState('idle');
}

/* ── Orb state ──────────────────────────────────────────── */
function setOrbState(state) {
  if (!orbEl) return;
  orbEl.dataset.state = state;
  orbEl.className = 'portal-orb ' + state;
  const labels = { idle: 'Ready', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' };
  if (orbLabel) orbLabel.textContent = labels[state] || '';
}

/* ── Fade-up animation ──────────────────────────────────── */
if (!document.getElementById('fadeup-style')) {
  const s = document.createElement('style');
  s.id = 'fadeup-style';
  s.textContent = '@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}';
  document.head.appendChild(s);
}

/* ── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Restore api url
  if (apiUrlInput && NOVA_API) apiUrlInput.value = NOVA_API;
  // Load global Nova URL
  await loadGlobalNovaUrl();
  // Events
  if (micBtn) micBtn.addEventListener('click', toggleMic);
  if (sendBtn) sendBtn.addEventListener('click', () => { processCommand(textInput.value); textInput.value = ''; });
  if (textInput) textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); processCommand(textInput.value); textInput.value = ''; }
  });
  if (connectBtn) connectBtn.addEventListener('click', updateApiUrl);
  setOrbState('idle');
  checkConnection();
  setInterval(checkConnection, 30000);
});
