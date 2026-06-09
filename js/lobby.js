// ============================================================
// lobby.js — Room Create / Join Logic (English)
// ============================================================

const COLORS       = ['red','green','blue','yellow','purple'];
const COLOR_HEX_L  = { red:'#ff3b6b', green:'#00d46a', blue:'#0099ee', yellow:'#ffd600', purple:'#bf5fff' };
const COLOR_EMOJI  = { red:'🔴', green:'🟢', blue:'🔵', yellow:'🟡', purple:'🟣' };
const COMPUTER_UID = 'COMPUTER';

let currentRoom = null;
let pollInterval = null;
let currentUser  = null;

function initLobbyPage() {
  applyTheme();
  currentUser = getSession();
  if (!currentUser || !currentUser.userId) { window.location.href = 'login.html'; return; }

  const nameEl   = document.getElementById('user-name-display');
  const idEl     = document.getElementById('user-id-display');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl)   nameEl.textContent   = currentUser.name;
  if (idEl)     idEl.textContent     = '#' + currentUser.userId;
  if (avatarEl) avatarEl.textContent = currentUser.name.charAt(0).toUpperCase();

  setupTabs();

  document.getElementById('create-room-btn') ?.addEventListener('click', handleCreateRoom);
  document.getElementById('join-room-btn')   ?.addEventListener('click', handleJoinRoom);
  document.getElementById('play-computer-btn')?.addEventListener('click', handlePlayComputer);
  document.getElementById('logout-btn')      ?.addEventListener('click', () => { clearSession(); window.location.href = 'login.html'; });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });
}

// ── Play vs Computer ───────────────────────────────────────
async function handlePlayComputer() {
  const maxPlayers = parseInt(document.getElementById('max-players')?.value) || 2;
  const btn = document.getElementById('play-computer-btn');
  setLoading(btn, true);

  try {
    // Create a room, then auto-join computer
    const res = await apiCall('createRoom', { userId: currentUser.userId, maxPlayers: 2 });
    if (!res.success) { showToast(res.message, 'error'); setLoading(btn, false); return; }

    const code = res.roomCode;

    // Add computer as player
    await apiCall('joinRoom', { userId: COMPUTER_UID, roomCode: code });

    // Start game immediately
    const startRes = await apiCall('startGame', { userId: currentUser.userId, roomCode: code });
    if (!startRes.success) { showToast(startRes.message, 'error'); setLoading(btn, false); return; }

    sessionStorage.setItem('ludoRoom', code);
    sessionStorage.setItem('ludoVsComputer', '1');
    window.location.href = `game.html?room=${code}&vscomputer=1`;
  } catch {
    showToast('Network error. Try again.', 'error');
  }
  setLoading(btn, false);
}

// ── Create Room ────────────────────────────────────────────
async function handleCreateRoom() {
  const maxPlayers = parseInt(document.getElementById('max-players')?.value) || 4;
  const btn = document.getElementById('create-room-btn');
  setLoading(btn, true);

  try {
    const res = await apiCall('createRoom', { userId: currentUser.userId, maxPlayers });
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
  const code = document.getElementById('join-code-input')?.value.trim().toUpperCase();
  if (!code || code.length < 4) return showToast('Please enter a room code', 'error');

  const btn = document.getElementById('join-room-btn');
  setLoading(btn, true);

  try {
    const res = await apiCall('joinRoom', { userId: currentUser.userId, roomCode: code });
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

// ── Waiting Room ───────────────────────────────────────────
function showLobbyWaiting(roomCode, isHost) {
  document.getElementById('lobby-main').classList.add('hidden');
  const ws = document.getElementById('lobby-waiting');
  ws.classList.remove('hidden');
  document.getElementById('room-code-display').textContent = roomCode;
  document.getElementById('start-game-btn').classList.toggle('hidden', !isHost);

  document.getElementById('start-game-btn')?.addEventListener('click', handleStartGame);
  document.getElementById('leave-room-btn')?.addEventListener('click', handleLeaveRoom);
  document.getElementById('copy-code-btn') ?.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(() => showToast('Code copied! 📋', 'success'));
  });
}

async function handleStartGame() {
  const btn = document.getElementById('start-game-btn');
  setLoading(btn, true);
  try {
    const res = await apiCall('startGame', { userId: currentUser.userId, roomCode: currentRoom });
    if (res.success) {
      stopPolling();
      sessionStorage.setItem('ludoRoom', currentRoom);
      sessionStorage.removeItem('ludoVsComputer');
      window.location.href = `game.html?room=${currentRoom}`;
    } else {
      showToast(res.message, 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
  setLoading(btn, false);
}

async function handleLeaveRoom() {
  stopPolling();
  try { await apiCall('leaveRoom', { userId: currentUser.userId, roomCode: currentRoom }); } catch {}
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
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

async function pollRoom(roomCode) {
  try {
    const res = await apiCall('getRooms', { roomCode });
    if (!res.success || !res.room) return;

    const room    = res.room;
    const players = Array.isArray(room.Players) ? room.Players : JSON.parse(room.Players || '[]');

    renderWaitingPlayers(players, room.HostUserID, parseInt(room.MaxPlayers));

    if (!players.includes(currentUser.userId)) {
      stopPolling();
      showToast('You were removed from the room', 'info');
      document.getElementById('lobby-waiting').classList.add('hidden');
      document.getElementById('lobby-main').classList.remove('hidden');
      return;
    }

    if (room.Status === 'playing') {
      stopPolling();
      sessionStorage.setItem('ludoRoom', roomCode);
      window.location.href = `game.html?room=${roomCode}`;
      return;
    }

    const isHost  = String(room.HostUserID) === String(currentUser.userId);
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.classList.toggle('hidden', !isHost);
      startBtn.disabled = players.length < 2;
    }
  } catch {}
}

function renderWaitingPlayers(players, hostId, maxPlayers) {
  const list    = document.getElementById('waiting-players-list');
  const countEl = document.getElementById('player-count');
  if (!list) return;
  if (countEl) countEl.textContent = `${players.length} / ${maxPlayers} Players`;

  list.innerHTML = players.map((uid, idx) => {
    const color  = COLORS[idx] || 'red';
    const isHost = String(uid) === String(hostId);
    const isMe   = String(uid) === String(currentUser.userId);
    const name   = isMe ? currentUser.name : uid;
    return `
      <li class="player-item">
        <span class="player-color-dot player-dot-${color}"></span>
        <div class="player-info">
          <div class="player-name-text">${name}</div>
          <div class="player-uid">${COLOR_EMOJI[color]} ${color.charAt(0).toUpperCase()+color.slice(1)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          ${isHost ? '<span class="badge-host">HOST</span>' : ''}
          ${isMe   ? '<span class="badge-you">YOU</span>'  : ''}
        </div>
      </li>`;
  }).join('');

  // Empty slots
  for (let i = players.length; i < maxPlayers; i++) {
    list.innerHTML += `
      <li class="player-item" style="opacity:0.3;border-style:dashed;">
        <span class="player-color-dot" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.1)"></span>
        <div class="player-info">
          <div class="player-name-text pulse">Waiting...</div>
          <div class="player-uid">Slot ${i+1}</div>
        </div>
      </li>`;
  }
}
