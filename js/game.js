
// ============================================================
// game.js — Ludo Game Engine
// ============================================================

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const PLAYER_COLORS = ['red', 'green', 'blue', 'yellow', 'purple'];
const COLOR_HEX = { red: '#ff3b6b', green: '#00d46a', blue: '#0099ee', yellow: '#ffd600', purple: '#bf5fff' };

// Board: 52 track cells + home stretches
// Standard Ludo track cell layout (0-51)
// Each player's start position on the track:
const PLAYER_STARTS = [0, 13, 26, 39, 52]; // 52 wraps to 0 for 5th
const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47]; // safe spots

let gameState = null;
let roomData = null;
let currentUser = null;
let currentRoom = null;
let pollInterval = null;
let diceValue = 0;
let diceRolled = false;
let activityLog = [];
let playerNames = {}; // uid -> name (only current user's name known)

// ── Init ───────────────────────────────────────────────────
function initGamePage() {
  currentUser = getSession();
  if (!currentUser || !currentUser.userId) {
    window.location.href = 'login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  currentRoom = params.get('room') || sessionStorage.getItem('ludoRoom');

  if (!currentRoom) {
    showToast('Room code nahi mila', 'error');
    setTimeout(() => window.location.href = 'lobby.html', 1500);
    return;
  }

  playerNames[currentUser.userId] = currentUser.name;

  // Wire up dice
  const diceEl = document.getElementById('dice-display');
  if (diceEl) diceEl.addEventListener('click', handleRollDice);

  // Leave button
  const leaveBtn = document.getElementById('leave-game-btn');
  if (leaveBtn) leaveBtn.addEventListener('click', handleLeaveGame);

  // Start polling
  fetchAndRender();
  pollInterval = setInterval(fetchAndRender, 2500);
}

// ── Leave Game ─────────────────────────────────────────────
async function handleLeaveGame() {
  if (!confirm('Kya aap game se bahar jaana chahte hain?')) return;
  clearInterval(pollInterval);
  try {
    await apiCall('leaveRoom', { userId: currentUser.userId, roomCode: currentRoom });
  } catch {}
  window.location.href = 'lobby.html';
}

// ── Fetch & Render ─────────────────────────────────────────
async function fetchAndRender() {
  try {
    const res = await apiCall('getGameState', { roomCode: currentRoom });
    if (!res.success) return;

    roomData = res.room;
    const gs = res.gameState;

    if (!gs) {
      // Game not started yet
      renderWaitingState();
      return;
    }

    gameState = gs;
    diceValue = parseInt(gs.DiceValue) || 0;
    diceRolled = diceValue > 0;

    renderAll();

    // Check winner
    if (gs.Winner) {
      clearInterval(pollInterval);
      showWinnerModal(gs.Winner);
    }

  } catch (err) {
    // Silent network error
  }
}

// ── Render All ─────────────────────────────────────────────
function renderAll() {
  if (!gameState) return;

  const piecesData = gameState.Pieces;
  if (!piecesData || !piecesData.players) return;

  const players = piecesData.players || [];
  const pieces = piecesData.pieces || {};
  const currentTurn = gameState.CurrentTurn;
  const isMyTurn = String(currentTurn) === String(currentUser.userId);

  // Render board
  renderBoard(players, pieces);

  // Render turn info
  renderTurnInfo(currentTurn, players, isMyTurn);

  // Render dice
  renderDice(isMyTurn);

  // Render score panel
  renderScorePanel(players, pieces);

  // Render activity
  renderActivity();

  // Render clickable pieces if my turn & dice rolled
  if (isMyTurn && diceRolled) {
    highlightMovablePieces(players, pieces);
  }
}

// ── Render Board ───────────────────────────────────────────
function renderBoard(players, pieces) {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cellSize = size / 15;

  ctx.clearRect(0, 0, size, size);

  // Draw board background
  drawBoardBackground(ctx, size, cellSize);

  // Draw pieces on board
  players.forEach((uid, playerIdx) => {
    const color = PLAYER_COLORS[playerIdx];
    const playerPieces = pieces[uid] ? pieces[uid].pieces : [-1,-1,-1,-1];

    playerPieces.forEach((pos, pieceIdx) => {
      if (pos === -1) {
        // Draw in home
        drawHomepiece(ctx, playerIdx, pieceIdx, color, cellSize);
      } else if (pos === 200) {
        // Finished - draw in center
        drawFinishedPiece(ctx, playerIdx, pieceIdx, color, cellSize, size);
      } else {
        // On track
        const { x, y } = getTrackCellCoords(pos, cellSize);
        drawPiece(ctx, x + cellSize/2, y + cellSize/2, color, cellSize * 0.38, pieceIdx);
      }
    });
  });
}

function drawBoardBackground(ctx, size, cell) {
  const isDark = true;

  // Background
  ctx.fillStyle = '#0d0d1f';
  ctx.fillRect(0, 0, size, size);

  // Draw the 15x15 grid
  // Home areas (6x6 corners)
  const homeAreas = [
    { col: 0, row: 0, color: '#ff3b6b', alpha: 0.15 },   // top-left red
    { col: 9, row: 0, color: '#00d46a', alpha: 0.12 },   // top-right green
    { col: 0, row: 9, color: '#ffd600', alpha: 0.10 },   // bottom-left yellow
    { col: 9, row: 9, color: '#0099ee', alpha: 0.12 },   // bottom-right blue
  ];

  homeAreas.forEach(({ col, row, color, alpha }) => {
    ctx.fillStyle = hexToRgba(color, alpha);
    ctx.beginPath();
    roundRect(ctx, col * cell, row * cell, 6 * cell, 6 * cell, 8);
    ctx.fill();

    // Inner home circle
    const cx = (col + 3) * cell;
    const cy = (row + 3) * cell;
    const r = cell * 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, alpha * 1.5);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Track cells
  drawTrackCells(ctx, cell);

  // Center star
  const cx = 7.5 * cell, cy = 7.5 * cell;
  ctx.font = `${cell * 1.2}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillText('★', cx, cy);

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 15; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
  }
}

function drawTrackCells(ctx, cell) {
  // The standard Ludo track: 52 cells in L-shaped path around board
  // Colored home stretch columns/rows
  const homeStretches = [
    { cells: [[1,7],[2,7],[3,7],[4,7],[5,7]], color: '#ff3b6b' },   // red → right
    { cells: [[7,1],[7,2],[7,3],[7,4],[7,5]], color: '#00d46a' },   // green → down
    { cells: [[9,7],[10,7],[11,7],[12,7],[13,7]], color: '#0099ee' }, // blue → left
    { cells: [[7,9],[7,10],[7,11],[7,12],[7,13]], color: '#ffd600' }, // yellow → up
  ];

  homeStretches.forEach(({ cells, color }) => {
    cells.forEach(([c, r]) => {
      ctx.fillStyle = hexToRgba(color, 0.2);
      ctx.fillRect(c * cell + 0.5, r * cell + 0.5, cell - 1, cell - 1);
    });
  });

  // Safe cells (star markers)
  SAFE_CELLS.forEach(cellIdx => {
    const { x, y } = getTrackCellCoords(cellIdx, cell);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    ctx.font = `${cell * 0.55}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('★', x + cell/2, y + cell/2);
  });
}

// Maps track position 0-51 to canvas x,y
function getTrackCellCoords(pos, cell) {
  // Standard Ludo 52-cell clockwise track mapping to 15x15 grid
  const trackMap = buildTrackMap();
  const [col, row] = trackMap[pos % 52] || [7, 7];
  return { x: col * cell, y: row * cell };
}

function buildTrackMap() {
  // 52 cells clockwise starting from red entry (col=6, row=14 going up)
  return [
    [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],  // 0-5: left side going up
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],        // 6-11: top-left going left
    [0,7],                                       // 12: corner
    [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],        // 13-18: top going right
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],        // 19-24: right side going up
    [7,0],                                       // 25: top corner
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],        // 26-31: going down
    [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],   // 32-37: top-right going right
    [14,7],                                      // 38: right corner
    [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],   // 39-44: right going left
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],   // 45-50: going down
    [7,14],                                      // 51: bottom
  ];
}

function drawHomepiece(ctx, playerIdx, pieceIdx, color, cell) {
  // Home positions for each player (2x2 grid in each home circle)
  const homeGrids = [
    [[1.5,1.5],[3,1.5],[1.5,3],[3,3]],         // red (top-left)
    [[10,1.5],[11.5,1.5],[10,3],[11.5,3]],     // green (top-right)
    [[1.5,10],[3,10],[1.5,11.5],[3,11.5]],     // yellow (bottom-left)
    [[10,10],[11.5,10],[10,11.5],[11.5,11.5]], // blue (bottom-right)
    [[6,6.5],[8,6.5],[6,8],[8,8]]              // purple (center-ish as 5th)
  ];

  const grid = homeGrids[playerIdx] || homeGrids[0];
  const [col, row] = grid[pieceIdx] || [7,7];
  drawPiece(ctx, col * cell, row * cell, color, cell * 0.38, pieceIdx);
}

function drawFinishedPiece(ctx, playerIdx, pieceIdx, color, cell, size) {
  // Draw finished pieces near center
  const angle = (playerIdx * Math.PI / 2.5) + (pieceIdx * Math.PI / 8);
  const r = cell * 0.8;
  const cx = size / 2 + Math.cos(angle) * r;
  const cy = size / 2 + Math.sin(angle) * r;
  drawPiece(ctx, cx, cy, color, cell * 0.28, pieceIdx);

  // Crown
  ctx.font = `${cell * 0.3}px serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd600';
  ctx.fillText('♛', cx, cy - cell * 0.3);
}

function drawPiece(ctx, x, y, color, radius, pieceIdx) {
  const colorMap = COLOR_HEX;
  const c = colorMap[color] || '#fff';

  // Shadow
  ctx.shadowColor = c;
  ctx.shadowBlur = 8;

  // Outer circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(x - radius*0.3, y - radius*0.3, 0, x, y, radius);
  grad.addColorStop(0, lighten(c, 0.4));
  grad.addColorStop(1, c);
  ctx.fillStyle = grad;
  ctx.fill();

  // Piece number
  ctx.shadowBlur = 0;
  ctx.font = `bold ${radius * 0.8}px "Rajdhani", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(pieceIdx + 1, x, y + 1);
}

// Highlight movable pieces (overlay on canvas)
function highlightMovablePieces(players, pieces) {
  const myIdx = players.indexOf(currentUser.userId);
  if (myIdx === -1) return;

  const myData = pieces[currentUser.userId];
  if (!myData) return;

  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  // Add click handler for pieces
  canvas.onclick = (e) => {
    if (!diceRolled) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const cell = canvas.width / 15;

    myData.pieces.forEach((pos, pieceIdx) => {
      let cx, cy;
      if (pos === -1) {
        const homeGrids = [
          [[1.5,1.5],[3,1.5],[1.5,3],[3,3]],
          [[10,1.5],[11.5,1.5],[10,3],[11.5,3]],
          [[1.5,10],[3,10],[1.5,11.5],[3,11.5]],
          [[10,10],[11.5,10],[10,11.5],[11.5,11.5]],
          [[6,6.5],[8,6.5],[6,8],[8,8]]
        ];
        const [col, row] = homeGrids[myIdx][pieceIdx];
        cx = col * cell; cy = row * cell;
      } else if (pos === 200) {
        return; // finished
      } else {
        const { x, y } = getTrackCellCoords(pos, cell);
        cx = x + cell/2; cy = y + cell/2;
      }

      const dist = Math.sqrt((mx - cx)**2 + (my - cy)**2);
      if (dist < cell * 0.5) {
        handleMovePiece(pieceIdx);
      }
    });
  };

  // Draw glow on clickable pieces
  const ctx = canvas.getContext('2d');
  const cell = canvas.width / 15;
  const color = PLAYER_COLORS[myIdx];
  const c = COLOR_HEX[color];

  myData.pieces.forEach((pos, pieceIdx) => {
    if (pos === 200) return;
    let cx, cy;
    if (pos === -1) {
      if (diceValue !== 6) return; // can't move from home
      const homeGrids = [
        [[1.5,1.5],[3,1.5],[1.5,3],[3,3]],
        [[10,1.5],[11.5,1.5],[10,3],[11.5,3]],
        [[1.5,10],[3,10],[1.5,11.5],[3,11.5]],
        [[10,10],[11.5,10],[10,11.5],[11.5,11.5]],
        [[6,6.5],[8,6.5],[6,8],[8,8]]
      ];
      const [col, row] = homeGrids[myIdx][pieceIdx];
      cx = col * cell; cy = row * cell;
    } else {
      const coords = getTrackCellCoords(pos, cell);
      cx = coords.x + cell/2; cy = coords.y + cell/2;
    }

    // Pulsing ring
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.shadowColor = c;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  });
}

// ── Roll Dice ──────────────────────────────────────────────
async function handleRollDice() {
  if (!gameState) return;
  const isMyTurn = String(gameState.CurrentTurn) === String(currentUser.userId);
  if (!isMyTurn) return showToast('Abhi aapki baari nahi hai ⏳', 'info');
  if (diceRolled) return showToast('Pehle piece move karein', 'info');

  const diceEl = document.getElementById('dice-display');
  diceEl.classList.add('rolling');
  setTimeout(() => diceEl.classList.remove('rolling'), 600);

  try {
    const res = await apiCall('rollDice', {
      userId: currentUser.userId,
      roomCode: currentRoom
    });

    if (res.success) {
      diceValue = res.diceValue;
      diceRolled = true;
      document.getElementById('dice-value').textContent = DICE_FACES[diceValue];
      addActivity(`🎲 Aapne ${diceValue} roll kiya`);
      await fetchAndRender();
    } else {
      showToast(res.message, 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
}

// ── Move Piece ─────────────────────────────────────────────
async function handleMovePiece(pieceIndex) {
  if (!diceRolled) return showToast('Pehle dice roll karein 🎲', 'info');

  try {
    const res = await apiCall('movePiece', {
      userId: currentUser.userId,
      roomCode: currentRoom,
      pieceIndex
    });

    if (res.success) {
      diceRolled = false;
      diceValue = 0;
      document.getElementById('dice-value').textContent = '🎲';

      if (res.captured) {
        addActivity(`💥 Aapne ek piece capture kiya!`);
        showToast('Capture! Bonus turn 🎉', 'success');
      }
      if (res.bonusTurn) {
        showToast('Bonus turn! Again roll karein 🎯', 'success');
      }
      if (res.winner) {
        showWinnerModal(res.winner);
        clearInterval(pollInterval);
      } else {
        await fetchAndRender();
      }
    } else {
      showToast(res.message, 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
}

// ── Render Turn Info ───────────────────────────────────────
function renderTurnInfo(currentTurn, players, isMyTurn) {
  const turnEl = document.getElementById('turn-player-name');
  const turnBar = document.getElementById('turn-color-bar');
  const turnBadge = document.getElementById('my-turn-badge');

  const idx = players.indexOf(currentTurn);
  const color = PLAYER_COLORS[idx] || 'red';
  const colorHex = COLOR_HEX[color];
  const name = String(currentTurn) === String(currentUser.userId)
    ? `${currentUser.name} (Aap)`
    : currentTurn;

  if (turnEl) turnEl.textContent = name;
  if (turnBar) turnBar.style.background = colorHex;
  if (turnBadge) {
    turnBadge.style.display = isMyTurn ? 'block' : 'none';
  }
}

// ── Render Dice ────────────────────────────────────────────
function renderDice(isMyTurn) {
  const diceEl = document.getElementById('dice-display');
  const diceVal = document.getElementById('dice-value');
  if (!diceEl) return;

  diceEl.style.cursor = isMyTurn && !diceRolled ? 'pointer' : 'default';
  diceEl.style.borderColor = isMyTurn && !diceRolled
    ? 'rgba(255,59,107,0.6)'
    : 'rgba(255,255,255,0.1)';

  if (diceVal && !diceRolled) diceVal.textContent = '🎲';
  else if (diceVal && diceValue > 0) diceVal.textContent = DICE_FACES[diceValue];
}

// ── Render Score Panel ─────────────────────────────────────
function renderScorePanel(players, pieces) {
  const panel = document.getElementById('score-panel');
  if (!panel) return;

  panel.innerHTML = players.map((uid, idx) => {
    const color = PLAYER_COLORS[idx];
    const colorHex = COLOR_HEX[color];
    const name = String(uid) === String(currentUser.userId) ? currentUser.name : uid;
    const playerPieces = pieces[uid] ? pieces[uid].pieces : [-1,-1,-1,-1];

    const pieceStatus = playerPieces.map(pos => {
      if (pos === -1) return '<span class="ps-dot home" title="Ghar mein"></span>';
      if (pos === 200) return '<span class="ps-dot done" title="Finish!"></span>';
      return '<span class="ps-dot board" title="Board pe"></span>';
    }).join('');

    const finished = playerPieces.filter(p => p === 200).length;
    const isCurrentTurn = String(gameState?.CurrentTurn) === String(uid);

    return `
      <div class="score-item" style="${isCurrentTurn ? `border-left:3px solid ${colorHex};padding-left:13px;` : ''}">
        <div class="score-color-bar" style="background:${colorHex};${isCurrentTurn ? `box-shadow:0 0 8px ${colorHex};` : ''}"></div>
        <div class="player-info">
          <div class="score-name">${name}</div>
          <div class="piece-status">${pieceStatus}</div>
        </div>
        <div class="score-pcs">${finished}/4</div>
      </div>
    `;
  }).join('');
}

// ── Activity Log ───────────────────────────────────────────
function addActivity(msg) {
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  activityLog.unshift({ msg, time });
  if (activityLog.length > 30) activityLog.pop();
  renderActivity();
}

function renderActivity() {
  const log = document.getElementById('activity-log');
  if (!log) return;

  if (gameState && gameState.TurnHistory && Array.isArray(gameState.TurnHistory)) {
    const history = [...gameState.TurnHistory].reverse().slice(0, 15);
    log.innerHTML = history.map(h => {
      const uid = h.player;
      const name = String(uid) === String(currentUser.userId) ? currentUser.name : uid;
      const time = new Date(h.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return `<div class="log-item"><span class="log-time">${time}</span><span>${name} ne ${h.dice} roll kiya (Piece ${h.piece + 1})</span></div>`;
    }).join('') || '<div class="log-item"><span class="log-time">-</span><span>Game abhi shuru hua hai...</span></div>';
  }
}

// ── Waiting State ──────────────────────────────────────────
function renderWaitingState() {
  const status = document.getElementById('game-status');
  if (status) {
    status.textContent = 'Host ke game start karne ka wait kar rahe hain...';
    status.className = 'pulse';
  }
}

// ── Winner Modal ───────────────────────────────────────────
function showWinnerModal(winnerId) {
  const isMe = String(winnerId) === String(currentUser.userId);
  const name = isMe ? currentUser.name : winnerId;

  const existing = document.getElementById('winner-modal');
  if (existing) return; // Already shown

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'winner-modal';
  backdrop.innerHTML = `
    <div class="modal">
      <span class="modal-emoji">${isMe ? '🏆' : '🎉'}</span>
      <div class="modal-title">${isMe ? 'JEET GAYE!' : 'GAME OVER'}</div>
      <p class="modal-sub">${isMe ? 'Congratulations! Aap Ludo Champion hain!' : `<strong>${name}</strong> ne game jeeta!`}</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="btn btn-primary" onclick="window.location.href='lobby.html'">🎲 Dobara Khelein</button>
        <button class="btn btn-secondary" onclick="document.getElementById('winner-modal').remove()">× Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
}

// ── Utilities ──────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lighten(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.slice(3,5),16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.slice(5,7),16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
