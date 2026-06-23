/* =========================================================
   Firebase Configuration
   ─────────────────────────────────────────────────────────
   SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com/
   2. Click "Add project" → name it "nova-ai" → Create
   3. Go to Project Settings → General → scroll to "Your apps"
   4. Click the Web icon (</>) → Register app as "nova-web"
   5. Copy the config object below and replace the placeholders
   6. Go to Authentication → Sign-in method → Enable Email/Password
   7. Go to Firestore Database → Create database → Start in test mode
   ========================================================= */

// ── Firebase SDK (loaded via CDN in HTML) ──────────────────

const firebaseConfig = {
  apiKey:            "AIzaSyCKQCd6NWoBPpYfCNjD40e3e6riho7yCMg",
  authDomain:        "nova-bfe2a.firebaseapp.com",
  projectId:         "nova-bfe2a",
  storageBucket:     "nova-bfe2a.firebasestorage.app",
  messagingSenderId: "83650549672",
  appId:             "1:83650549672:web:e5c8a0d0f097e77ee66f9d",
  measurementId:     "G-QQD07BNL33"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export references
const auth = firebase.auth();
const db   = firebase.firestore();

// ── Helper: Check if config is set up ──────────────────────
function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
}

// ── Helper: Get current user's Firestore profile ───────────
async function getUserProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error('getUserProfile error:', e);
    return null;
  }
}

// ── Helper: Check if current user is admin ─────────────────
async function isAdmin(uid) {
  const profile = await getUserProfile(uid);
  return profile && profile.role === 'admin';
}

// ── Helper: Create/update user profile on login ────────────
async function ensureUserProfile(user, extraData = {}) {
  const ref = db.collection('users').doc(user.uid);
  const doc = await ref.get();
  if (!doc.exists) {
    // First login — create profile
    await ref.set({
      email: user.email,
      name: extraData.name || user.email.split('@')[0],
      role: 'user',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      banned: false
    });
  } else {
    // Update last login
    await ref.update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

// ── Helper: Log a command to Firestore ─────────────────────
async function logCommand(uid, command, reply) {
  try {
    await db.collection('commands').add({
      uid: uid,
      email: auth.currentUser?.email || 'unknown',
      command: command,
      reply: reply,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('logCommand error:', e);
  }
}

// ── Helper: Get global Nova URL from Firestore ─────────────
async function getGlobalNovaUrl() {
  try {
    const doc = await db.collection('config').doc('nova').get();
    if (doc.exists && doc.data().apiUrl) {
      return doc.data().apiUrl;
    }
  } catch (e) {
    console.error('getGlobalNovaUrl error:', e);
  }
  return '';
}

// ── Helper: Set global Nova URL (admin only) ───────────────
async function setGlobalNovaUrl(url) {
  await db.collection('config').doc('nova').set({
    apiUrl: url,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}
