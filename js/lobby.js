
// ============================================================
// lobby.js — Room Create / Join Logic
// ============================================================

const COLORS = ['red', 'green', 'blue', 'yellow', 'purple'];
const COLOR_LABELS = { red: '#ff3b6b', green: '#00d46a', blue: '#0099ee', yellow: '#ffd600', purple: '#bf5fff' };
const COLOR_EMOJIS = { red: '🔴', green: '🟢', blue: '🔵', yellow: '🟡', purple: '🟣' };

let currentRoom = null;
let pollInterval = null;
let currentUser = null;

// ── Init ───────────────────────────────────────────────────
function initLobbyPage() {
  currentUser = getSession();
  if (!currentUser || !currentUser.userId) {
    window.location.href = 'login.html';
    return;
  }

  // Show user info
  const nameEl = document.getElementById('user-name-display');
  const idEl = document.getElementById('user-id-display');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = currentUser.name;
  if (idEl) idEl.textContent = '#' + currentUser.userId;
  if (avatarEl) avatarEl.textContent = currentUser.name.charAt(0).toUpperCase();

  // Tabs
  setupTabs();

  // Create room form
  const createBtn = document.getElementById('create-room-btn');
  if (createBtn) createBtn.addEventListener('click', handleCreateRoom);

  // Join room form
  const joinBtn = document.getElementById('join-room-btn');
  if (joinBtn) joinBtn.addEventListener('click', handleJoinRoom);

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = 'login.html';
  });
}

// ── Tabs ───────────────────────────────────────────────────
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });
}

// ── Create Room ────────────────────────────────────────────
async function handleCreateRoom() {
  const maxPlayers = parseInt(document.getElementById('max-players').value) || 4;
  const btn = document.getElementById('create-room-btn');

  setLoading(btn, true);
  try {
    const res = await apiCall('createRoom', {
      userId: currentUser.userId,
      maxPlayers
    });

    if (res.success) {
      currentRoom = res.roomCode;
      showLobbyWaiting(res.roomCode, true);
      startPolling(res.roomCode);
    } else {
      showToast(res.message, 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
  setLoading(btn, false);
}

// ── Join Room ──────────────────────────────────────────────
async function handleJoinRoom() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code || code.length < 4) return showToast('Room code daalein', 'error');

  const btn = document.getElementById('join-room-btn');
  setLoading(btn, true);
  try {
    const res = await apiCall('joinRoom', {
      userId: currentUser.userId,
      roomCode: code
    });

    if (res.success) {
      currentRoom = code;
      showLobbyWaiting(code, false);
      startPolling(code);
    } else {
      showToast(res.message, 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
  setLoading(btn, false);
}

// ── Show Waiting Room ──────────────────────────────────────
function showLobbyWaiting(roomCode, isHost) {
  document.getElementById('lobby-main').classList.add('hidden');
  const waitingSection = document.getElementById('lobby-waiting');
  waitingSection.classList.remove('hidden');

  document.getElementById('room-code-display').textContent = roomCode;
  document.getElementById('start-game-btn').classList.toggle('hidden', !isHost);

  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) startBtn.addEventListener('click', handleStartGame);

  const leaveBtn = document.getElementById('leave-room-btn');
  if (leaveBtn) leaveBtn.addEventListener('click', handleLeaveRoom);

  const copyBtn = document.getElementById('copy-code-btn');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(() => showToast('Code copy ho gaya! 📋', 'success'));
  });
}

// ── Start Game ─────────────────────────────────────────────
async function handleStartGame() {
  const btn = document.getElementById('start-game-btn');
  setLoading(btn, true);
  try {
    const res = await apiCall('startGame', {
      userId: currentUser.userId,
      roomCode: currentRoom
    });

    if (res.success) {
      stopPolling();
      sessionStorage.setItem('ludoRoom', currentRoom);
      window.location.href = `game.html?room=${currentRoom}`;
    } else {
      showToast(res.message, 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
  setLoading(btn, false);
}

// ── Leave Room ─────────────────────────────────────────────
async function handleLeaveRoom() {
  stopPolling();
  try {
    await apiCall('leaveRoom', {
      userId: currentUser.userId,
      roomCode: currentRoom
    });
  } catch {}

  currentRoom = null;
  document.getElementById('lobby-waiting').classList.add('hidden');
  document.getElementById('lobby-main').classList.remove('hidden');
}

// ── Polling ────────────────────────────────────────────────
function startPolling(roomCode) {
  stopPolling();
  pollRoom(roomCode);
  pollInterval = setInterval(() => pollRoom(roomCode), 3000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function pollRoom(roomCode) {
  try {
    const res = await apiCall('getRooms', { roomCode });
    if (!res.success || !res.room) return;

    const room = res.room;
    const players = Array.isArray(room.Players) ? room.Players : JSON.parse(room.Players || '[]');

    // Update player list
    renderWaitingPlayers(players, room.HostUserID, parseInt(room.MaxPlayers));

    // Check if host changed or if we got kicked
    if (!players.includes(currentUser.userId)) {
      stopPolling();
      showToast('Room se nikal diye gaye', 'info');
      document.getElementById('lobby-waiting').classList.add('hidden');
      document.getElementById('lobby-main').classList.remove('hidden');
      return;
    }

    // If game started, redirect to game
    if (room.Status === 'playing') {
      stopPolling();
      sessionStorage.setItem('ludoRoom', roomCode);
      window.location.href = `game.html?room=${roomCode}`;
      return;
    }

    // Update start button visibility (host only)
    const isHost = String(room.HostUserID) === String(currentUser.userId);
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.classList.toggle('hidden', !isHost);
      const canStart = players.length >= 2;
      startBtn.disabled = !canStart;
      if (!canStart) startBtn.title = 'Minimum 2 players chahiye';
    }

  } catch (err) {
    // Silent fail — retry next interval
  }
}

// ── Render Players ─────────────────────────────────────────
function renderWaitingPlayers(players, hostId, maxPlayers) {
  const list = document.getElementById('waiting-players-list');
  const countEl = document.getElementById('player-count');
  if (!list) return;

  if (countEl) countEl.textContent = `${players.length} / ${maxPlayers} Players`;

  list.innerHTML = players.map((uid, idx) => {
    const color = COLORS[idx] || 'red';
    const isHost = String(uid) === String(hostId);
    const isMe = String(uid) === String(currentUser.userId);
    return `
      <li class="player-item">
        <span class="player-color-dot player-dot-${color}" title="${color}"></span>
        <div class="player-info">
          <div class="player-name-text">${isMe ? currentUser.name : uid}</div>
          <div class="player-uid">${COLOR_EMOJIS[color]} ${color.charAt(0).toUpperCase() + color.slice(1)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          ${isHost ? '<span class="badge-host">HOST</span>' : ''}
          ${isMe ? '<span class="badge-you">YOU</span>' : ''}
        </div>
      </li>
    `;
  }).join('');

  // Empty slots
  for (let i = players.length; i < maxPlayers; i++) {
    list.innerHTML += `
      <li class="player-item" style="opacity:0.3;border-style:dashed;">
        <span class="player-color-dot" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.1)"></span>
        <div class="player-info">
          <div class="player-name-text pulse">Waiting...</div>
          <div class="player-uid">Slot ${i + 1}</div>
        </div>
      </li>
    `;
  }
}
