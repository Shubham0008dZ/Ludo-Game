// ============================================================
// game.js — Ludo Game Engine (Full)
// ============================================================

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const PLAYER_COLORS = ['red', 'green', 'blue', 'yellow', 'purple'];
const COLOR_HEX = { red: '#ff3b6b', green: '#00d46a', blue: '#0099ee', yellow: '#ffd600', purple: '#bf5fff' };
const COMPUTER_UID = 'COMPUTER';
const COMPUTER_DELAY = 1400; // ms before computer acts

// Standard Ludo: 52-cell track, each player enters at different position
// Player start entry points on the 52-cell track:
const PLAYER_ENTRY = [0, 13, 26, 39]; // 5th player wraps
// Safe cells (star positions)
const SAFE_CELLS_SET = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

let gameState   = null;
let roomData    = null;
let currentUser = null;
let currentRoom = null;
let pollInterval = null;
let diceValue   = 0;
let diceRolled  = false;
let isVsComputer = false;
let computerColor = '';
let computerUID  = '';
let players      = [];
let piecesData   = {};
let myTurnPending = false; // prevents double-poll racing
let lastUpdated   = '';

// ── Init ───────────────────────────────────────────────────
function initGamePage() {
  currentUser = getSession();
  if (!currentUser || !currentUser.userId) {
    window.location.href = 'login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  currentRoom   = params.get('room') || sessionStorage.getItem('ludoRoom');
  isVsComputer  = params.get('vscomputer') === '1' || sessionStorage.getItem('ludoVsComputer') === '1';

  if (!currentRoom) {
    showToast('Room code not found', 'error');
    setTimeout(() => window.location.href = 'lobby.html', 1500);
    return;
  }

  document.getElementById('topbar-room').textContent = 'ROOM: ' + currentRoom;
  document.getElementById('room-code-info').textContent = currentRoom;

  if (isVsComputer) {
    document.getElementById('vs-computer-info').style.display = 'block';
  }

  // Canvas click
  const canvas = document.getElementById('game-canvas');
  canvas.addEventListener('click', onCanvasClick);

  // Size canvas responsively
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Start
  fetchAndRender();
  pollInterval = setInterval(() => {
    if (!myTurnPending) fetchAndRender();
  }, 2500);
}

function resizeCanvas() {
  const canvas = document.getElementById('game-canvas');
  const available = Math.min(
    window.innerWidth - (window.innerWidth < 769 ? 32 : 480),
    window.innerHeight - 160
  );
  const size = Math.max(280, Math.min(520, available));
  canvas.width  = size;
  canvas.height = size;
  if (gameState) renderBoard();
}

// ── Leave ──────────────────────────────────────────────────
async function handleLeaveGame() {
  if (!confirm('Leave the game?')) return;
  clearInterval(pollInterval);
  if (!isVsComputer) {
    try { await apiCall('leaveRoom', { userId: currentUser.userId, roomCode: currentRoom }); } catch {}
  }
  sessionStorage.removeItem('ludoRoom');
  sessionStorage.removeItem('ludoVsComputer');
  window.location.href = 'lobby.html';
}

// ── Fetch & Render ─────────────────────────────────────────
async function fetchAndRender() {
  try {
    const res = await apiCall('getGameState', { roomCode: currentRoom });
    if (!res.success) return;

    roomData = res.room;

    // If game not started yet
    if (roomData.Status === 'waiting') {
      setStatus('Waiting for host to start the game... 🕐');
      return;
    }

    const gs = res.gameState;
    if (!gs) { setStatus('Initialising game...'); return; }

    // Only re-render if state changed
    if (gs.LastUpdated === lastUpdated && lastUpdated !== '') return;
    lastUpdated = gs.LastUpdated;

    gameState  = gs;
    diceValue  = parseInt(gs.DiceValue) || 0;
    diceRolled = diceValue > 0;

    const pd = typeof gs.Pieces === 'string' ? JSON.parse(gs.Pieces) : gs.Pieces;
    players    = pd.players || [];
    piecesData = pd.pieces  || {};

    renderAll();

    // Winner check
    if (gs.Winner) {
      clearInterval(pollInterval);
      showWinner(gs.Winner);
      return;
    }

    // Computer's turn?
    const currentTurn = gs.CurrentTurn;
    if (isVsComputer && String(currentTurn) === COMPUTER_UID && !diceRolled) {
      setTimeout(computerPlay, COMPUTER_DELAY);
    }

  } catch (err) {
    console.error('fetchAndRender error:', err);
  }
}

// ── Render All ─────────────────────────────────────────────
function renderAll() {
  if (!gameState || !players.length) return;

  const currentTurn = gameState.CurrentTurn;
  const isMyTurn    = String(currentTurn) === String(currentUser.userId);

  renderBoard();
  renderTurnInfo(currentTurn, isMyTurn);
  renderDiceUI(isMyTurn);
  renderScorePanel();
  renderActivityLog();

  if (isMyTurn && diceRolled) {
    // Highlight valid pieces
    setTimeout(renderBoard, 50); // re-draw with glows
  }
}

// ── BOARD RENDERING ────────────────────────────────────────
function renderBoard() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const size = canvas.width;
  const cell = size / 15;

  ctx.clearRect(0, 0, size, size);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  // Background
  ctx.fillStyle = isLight ? '#f8f9ff' : '#0d0d1f';
  roundRectFill(ctx, 0, 0, size, size, 12);

  // Home corner areas
  drawHomeArea(ctx, 0,   0,   'red',    cell, isLight);  // top-left
  drawHomeArea(ctx, 9,   0,   'green',  cell, isLight);  // top-right
  drawHomeArea(ctx, 0,   9,   'yellow', cell, isLight);  // bottom-left
  drawHomeArea(ctx, 9,   9,   'blue',   cell, isLight);  // bottom-right

  // Track cells
  drawTrack(ctx, cell, isLight);

  // Center
  drawCenter(ctx, cell, size);

  // Grid lines
  ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 15; i++) {
    ctx.beginPath(); ctx.moveTo(i*cell, 0); ctx.lineTo(i*cell, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*cell); ctx.lineTo(size, i*cell); ctx.stroke();
  }

  // Pieces on board
  if (players.length) drawAllPieces(ctx, cell, size, isLight);
}

function drawHomeArea(ctx, col, row, color, cell, isLight) {
  const c = COLOR_HEX[color];
  const alpha = isLight ? 0.1 : 0.14;

  // Outer square
  ctx.fillStyle = hexToRgba(c, alpha);
  ctx.fillRect(col*cell, row*cell, 6*cell, 6*cell);
  ctx.strokeStyle = hexToRgba(c, 0.3);
  ctx.lineWidth = 1;
  ctx.strokeRect(col*cell + 0.5, row*cell + 0.5, 6*cell - 1, 6*cell - 1);

  // Inner circle
  const cx = (col + 3) * cell;
  const cy = (row + 3) * cell;
  const r  = cell * 2.1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(c, isLight ? 0.15 : 0.22);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(c, 0.45);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTrack(ctx, cell, isLight) {
  // Color home-stretch lanes
  const lanes = [
    { cells: [[1,7],[2,7],[3,7],[4,7],[5,7]], color: 'red'    }, // left → red home stretch
    { cells: [[7,1],[7,2],[7,3],[7,4],[7,5]], color: 'green'  }, // top → green
    { cells: [[9,7],[10,7],[11,7],[12,7],[13,7]], color: 'blue'  }, // right → blue
    { cells: [[7,9],[7,10],[7,11],[7,12],[7,13]], color: 'yellow' }, // bottom → yellow
  ];
  lanes.forEach(({ cells, color }) => {
    cells.forEach(([c, r]) => {
      ctx.fillStyle = hexToRgba(COLOR_HEX[color], isLight ? 0.18 : 0.22);
      ctx.fillRect(c*cell + 0.5, r*cell + 0.5, cell - 1, cell - 1);
    });
  });

  // Safe cell stars
  SAFE_CELLS_SET.forEach(idx => {
    const [c, r] = TRACK_MAP[idx];
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(c*cell, r*cell, cell, cell);
    ctx.font = `${cell * 0.52}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
    ctx.fillText('★', (c + 0.5)*cell, (r + 0.5)*cell);
  });
}

function drawCenter(ctx, cell, size) {
  const cx = 7.5 * cell, cy = 7.5 * cell;
  // Triangle decorations pointing inward
  const colors = ['red','green','blue','yellow'];
  const triangles = [
    { pts: [[6,6],[7.5,7.5],[6,9]] },   // left (red)
    { pts: [[6,6],[7.5,7.5],[9,6]] },   // top (green)
    { pts: [[9,6],[7.5,7.5],[9,9]] },   // right (blue)
    { pts: [[6,9],[7.5,7.5],[9,9]] },   // bottom (yellow)
  ];
  triangles.forEach(({ pts }, i) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0]*cell, pts[0][1]*cell);
    ctx.lineTo(pts[1][0]*cell, pts[1][1]*cell);
    ctx.lineTo(pts[2][0]*cell, pts[2][1]*cell);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(COLOR_HEX[colors[i]], 0.35);
    ctx.fill();
  });
  // Star
  ctx.font = `${cell * 1.1}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillText('★', cx, cy);
}

function drawAllPieces(ctx, cell, size, isLight) {
  const isMyTurn   = String(gameState.CurrentTurn) === String(currentUser.userId);
  const canMove    = isMyTurn && diceRolled;
  const myIdx      = players.indexOf(currentUser.userId);
  const myPieces   = myIdx >= 0 ? (piecesData[currentUser.userId]?.pieces || []) : [];

  players.forEach((uid, playerIdx) => {
    const color      = PLAYER_COLORS[playerIdx] || 'red';
    const playerPcs  = piecesData[uid]?.pieces || [-1,-1,-1,-1];
    const isComputer = uid === COMPUTER_UID;

    // Group pieces by same position (for stacking display)
    const posGroups = {};
    playerPcs.forEach((pos, pi) => {
      if (pos === 200) return; // finished, show in home-circle center
      const key = pos === -1 ? `home_${pi}` : `track_${pos}`;
      if (!posGroups[key]) posGroups[key] = [];
      posGroups[key].push({ pos, pi });
    });

    playerPcs.forEach((pos, pi) => {
      let cx, cy, r;
      r = cell * 0.36;

      if (pos === -1) {
        // In home
        const homePos = HOME_GRIDS[playerIdx][pi];
        cx = homePos[0] * cell;
        cy = homePos[1] * cell;
      } else if (pos === 200) {
        // Finished — show near center star
        const angle = (playerIdx * Math.PI/2) + (pi * Math.PI/8);
        cx = 7.5*cell + Math.cos(angle) * cell * 0.7;
        cy = 7.5*cell + Math.sin(angle) * cell * 0.7;
        r  = cell * 0.28;
      } else {
        const [tc, tr] = TRACK_MAP[pos % 52];
        cx = (tc + 0.5) * cell;
        cy = (tr + 0.5) * cell;
      }

      // Glow ring if movable
      const isMovable = canMove && String(uid) === String(currentUser.userId) && (
        pos !== 200 && (pos !== -1 || diceValue === 6)
      );
      if (isMovable) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = COLOR_HEX[color];
        ctx.lineWidth   = 2;
        ctx.setLineDash([4, 3]);
        ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 300) * 0.3;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      drawPiece(ctx, cx, cy, color, r, pi + 1, pos === 200);
    });
  });
}

function drawPiece(ctx, cx, cy, color, r, num, isFinished) {
  const c = COLOR_HEX[color];

  // Shadow / glow
  ctx.shadowColor = c;
  ctx.shadowBlur  = 8;

  // Outer circle with radial gradient
  const grad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.3, 0, cx, cy, r);
  grad.addColorStop(0, lighten(c, 0.45));
  grad.addColorStop(1, c);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner highlight
  ctx.beginPath();
  ctx.arc(cx - r*0.25, cy - r*0.25, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  ctx.shadowBlur = 0;

  // Number
  ctx.font = `bold ${Math.max(8, r * 0.85)}px Rajdhani, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'rgba(0,0,0,0.65)';
  ctx.fillText(num, cx + 0.5, cy + 1);

  // Crown for finished
  if (isFinished) {
    ctx.font = `${r * 0.9}px serif`;
    ctx.fillStyle = '#ffd600';
    ctx.fillText('♛', cx, cy - r * 1.2);
  }
}

// ── Canvas Click ───────────────────────────────────────────
function onCanvasClick(e) {
  if (!diceRolled) return;
  const isMyTurn = String(gameState?.CurrentTurn) === String(currentUser.userId);
  if (!isMyTurn) return;

  const canvas  = document.getElementById('game-canvas');
  const rect    = canvas.getBoundingClientRect();
  const scaleX  = canvas.width  / rect.width;
  const scaleY  = canvas.height / rect.height;
  const mx      = (e.clientX - rect.left)  * scaleX;
  const my      = (e.clientY - rect.top)   * scaleY;
  const cell    = canvas.width / 15;
  const myIdx   = players.indexOf(currentUser.userId);
  if (myIdx < 0) return;

  const myPcs = piecesData[currentUser.userId]?.pieces || [];
  let clicked  = -1;
  let bestDist = cell * 0.6;

  myPcs.forEach((pos, pi) => {
    if (pos === 200) return;
    let cx, cy;
    if (pos === -1) {
      const hp = HOME_GRIDS[myIdx][pi];
      cx = hp[0]*cell; cy = hp[1]*cell;
    } else {
      const [tc, tr] = TRACK_MAP[pos % 52];
      cx = (tc+0.5)*cell; cy = (tr+0.5)*cell;
    }
    const dist = Math.hypot(mx-cx, my-cy);
    if (dist < bestDist) { bestDist = dist; clicked = pi; }
  });

  if (clicked !== -1) handleMovePiece(clicked);
}

// ── Roll Dice ──────────────────────────────────────────────
async function handleRollDice() {
  if (!gameState) return;
  const isMyTurn = String(gameState.CurrentTurn) === String(currentUser.userId);
  if (!isMyTurn)    { showToast("It's not your turn yet ⏳", 'info'); return; }
  if (diceRolled)   { showToast('Move a piece first!', 'info'); return; }

  const diceEl = document.getElementById('dice-display');
  const rollBtn = document.getElementById('roll-btn');
  diceEl.classList.add('rolling');
  rollBtn.disabled = true;

  setTimeout(() => diceEl.classList.remove('rolling'), 500);

  try {
    myTurnPending = true;
    const res = await apiCall('rollDice', { userId: currentUser.userId, roomCode: currentRoom });

    if (res.success) {
      diceValue  = res.diceValue;
      diceRolled = true;
      document.getElementById('dice-value').textContent = DICE_FACES[diceValue];
      addLog(`🎲 You rolled a ${diceValue}`);

      // Check if any move is possible
      const myIdx  = players.indexOf(currentUser.userId);
      const myPcs  = piecesData[currentUser.userId]?.pieces || [-1,-1,-1,-1];
      const canAct = myPcs.some(p => p !== 200 && (p !== -1 || diceValue === 6));

      if (!canAct) {
        showToast(`No moves possible with ${diceValue}. Turn skipped.`, 'info');
        document.getElementById('dice-hint').textContent = 'No valid moves — turn passes.';
        setTimeout(async () => {
          await apiCall('skipTurn', { userId: currentUser.userId, roomCode: currentRoom });
          diceRolled = false; diceValue = 0; myTurnPending = false;
          await fetchAndRender();
        }, 1500);
        return;
      }

      document.getElementById('dice-hint').textContent = diceValue === 6
        ? '6! Click a piece to move (bonus turn!)' : 'Click a piece to move it';
      renderBoard();
    } else {
      showToast(res.message || 'Could not roll dice', 'error');
    }
  } catch (err) {
    showToast('Network error. Try again.', 'error');
    console.error(err);
  }
  myTurnPending = false;
  rollBtn.disabled = false;
}

// ── Move Piece ─────────────────────────────────────────────
async function handleMovePiece(pieceIndex) {
  if (!diceRolled) { showToast('Roll the dice first 🎲', 'info'); return; }

  const myPcs = piecesData[currentUser.userId]?.pieces || [];
  const pos   = myPcs[pieceIndex];
  if (pos === 200) return;
  if (pos === -1 && diceValue !== 6) {
    showToast('Roll a 6 to bring a piece out!', 'info'); return;
  }

  myTurnPending = true;
  document.getElementById('roll-btn').disabled = true;

  try {
    const res = await apiCall('movePiece', {
      userId: currentUser.userId,
      roomCode: currentRoom,
      pieceIndex
    });

    if (res.success) {
      diceRolled = false; diceValue = 0;
      document.getElementById('dice-value').textContent = '🎲';
      document.getElementById('dice-hint').textContent  = '';

      if (res.captured)   { showToast('💥 Captured! Bonus turn!', 'success'); addLog('💥 You captured a piece!'); }
      if (res.bonusTurn && !res.captured) { showToast('🎁 You got a bonus turn!', 'success'); }
      if (res.winner)     { showWinner(res.winner); clearInterval(pollInterval); }

      await fetchAndRender();
    } else {
      showToast(res.message || 'Invalid move', 'error');
    }
  } catch (err) {
    showToast('Network error.', 'error');
  }
  myTurnPending = false;
  document.getElementById('roll-btn').disabled = false;
}

// ── Computer AI ────────────────────────────────────────────
async function computerPlay() {
  if (!isVsComputer) return;
  setStatus('🤖 Computer is thinking <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>');
  document.getElementById('status-bar').innerHTML = setStatus.lastMsg || '🤖 Computer thinking...';

  try {
    // Roll dice
    const rollRes = await apiCall('rollDice', { userId: COMPUTER_UID, roomCode: currentRoom });
    if (!rollRes.success) return;

    const compDice = rollRes.diceValue;
    addLog(`🤖 Computer rolled ${compDice}`);

    await delay(800);

    // Fetch latest state
    const stateRes = await apiCall('getGameState', { roomCode: currentRoom });
    if (!stateRes.success || !stateRes.gameState) return;

    const pd2    = typeof stateRes.gameState.Pieces === 'string'
      ? JSON.parse(stateRes.gameState.Pieces) : stateRes.gameState.Pieces;
    const compPcs = pd2.pieces[COMPUTER_UID]?.pieces || [-1,-1,-1,-1];

    // AI: pick best piece to move
    const pieceIdx = chooseBestPiece(compPcs, compDice, pd2, players.indexOf(COMPUTER_UID));
    if (pieceIdx === -1) {
      addLog('🤖 Computer: no valid move, turn passes');
      await apiCall('skipTurn', { userId: COMPUTER_UID, roomCode: currentRoom });
    } else {
      await delay(600);
      const moveRes = await apiCall('movePiece', { userId: COMPUTER_UID, roomCode: currentRoom, pieceIndex: pieceIdx });
      if (moveRes.success) {
        addLog(`🤖 Computer moved piece ${pieceIdx + 1}`);
        if (moveRes.captured)  addLog('🤖 Computer captured your piece!');
        if (moveRes.winner)    { showWinner(moveRes.winner); clearInterval(pollInterval); return; }
        if (moveRes.bonusTurn) setTimeout(computerPlay, COMPUTER_DELAY);
      }
    }
    lastUpdated = ''; // force re-render
    await fetchAndRender();
  } catch (err) {
    console.error('Computer AI error:', err);
  }
}

function chooseBestPiece(pieces, dice, pd, playerIdx) {
  // Priority: capture > advance furthest on track > enter board (6) > any valid
  const entry   = PLAYER_ENTRY[playerIdx] || 0;
  const TRACK   = 52;

  let bestIdx  = -1;
  let bestScore = -Infinity;

  pieces.forEach((pos, pi) => {
    if (pos === 200) return;
    if (pos === -1 && dice !== 6) return;

    let score = 0;
    let newPos;

    if (pos === -1) {
      newPos = entry;
      score  = 5; // entering is good
    } else {
      newPos = (pos + dice) % TRACK;
      score  = newPos; // further is better

      // Bonus if capture possible
      const wouldCapture = Object.entries(pd.pieces || {}).some(([uid, data]) => {
        if (uid === COMPUTER_UID) return false;
        return data.pieces.some(p => p === newPos && !SAFE_CELLS_SET.has(newPos));
      });
      if (wouldCapture) score += 100;
    }

    if (score > bestScore) { bestScore = score; bestIdx = pi; }
  });

  return bestIdx;
}

// ── Render helpers ─────────────────────────────────────────
function renderTurnInfo(currentTurn, isMyTurn) {
  const idx    = players.indexOf(currentTurn);
  const color  = PLAYER_COLORS[idx] || 'red';
  const hex    = COLOR_HEX[color];
  const isComp = currentTurn === COMPUTER_UID;
  const name   = isComp ? '🤖 Computer'
    : (String(currentTurn) === String(currentUser.userId) ? `${currentUser.name} (You)` : currentTurn);

  const turnName = document.getElementById('turn-player-name');
  const turnBar  = document.getElementById('turn-color-bar');
  const myBadge  = document.getElementById('my-turn-badge');

  if (turnName) { turnName.textContent = name; turnName.style.color = hex; }
  if (turnBar)  { turnBar.style.background = hex; turnBar.style.boxShadow = `0 0 8px ${hex}`; }
  if (myBadge)  { myBadge.style.display = isMyTurn ? 'block' : 'none'; }

  setStatus(isMyTurn ? '⚡ Your turn! Roll the dice.' : isComp ? '🤖 Computer is playing...' : `⏳ Waiting for ${name}'s turn`);
}

function renderDiceUI(isMyTurn) {
  const diceEl = document.getElementById('dice-display');
  const rollBtn = document.getElementById('roll-btn');
  if (!diceEl || !rollBtn) return;

  const canRoll = isMyTurn && !diceRolled;
  rollBtn.disabled    = !canRoll;
  diceEl.style.cursor = canRoll ? 'pointer' : 'default';
  diceEl.style.borderColor = canRoll ? 'rgba(255,59,107,0.6)' : '';
  diceEl.onclick = canRoll ? handleRollDice : null;

  if (!diceRolled) document.getElementById('dice-value').textContent = '🎲';
  else if (diceValue > 0) document.getElementById('dice-value').textContent = DICE_FACES[diceValue];
}

function renderScorePanel() {
  const panel = document.getElementById('score-panel');
  if (!panel || !players.length) return;

  panel.innerHTML = players.map((uid, idx) => {
    const color   = PLAYER_COLORS[idx];
    const hex     = COLOR_HEX[color];
    const isComp  = uid === COMPUTER_UID;
    const isMe    = String(uid) === String(currentUser.userId);
    const name    = isComp ? '🤖 Computer' : (isMe ? currentUser.name : uid);
    const pcs     = piecesData[uid]?.pieces || [-1,-1,-1,-1];
    const done    = pcs.filter(p => p === 200).length;
    const onBoard = pcs.filter(p => p >= 0 && p < 200).length;
    const isTurn  = String(gameState?.CurrentTurn) === String(uid);

    const dots = pcs.map(p => {
      if (p === 200) return '<div class="sd done" title="Finished"></div>';
      if (p >= 0)   return '<div class="sd board" title="On board"></div>';
      return '<div class="sd" title="At home"></div>';
    }).join('');

    return `
      <div class="score-item" style="${isTurn ? `border-left:3px solid ${hex};padding-left:9px;` : ''}">
        <div class="score-bar" style="background:${hex};${isTurn ? `box-shadow:0 0 8px ${hex};` : ''}"></div>
        <div class="score-info">
          <div class="score-name">${name}${isMe ? ' <span style="font-size:10px;color:var(--neon-green);">(you)</span>' : ''}</div>
          <div class="score-dots">${dots}</div>
        </div>
        <div class="score-count">${done}/4</div>
      </div>`;
  }).join('');
}

function renderActivityLog() {
  const log = document.getElementById('activity-log');
  if (!log) return;

  let history = [];
  try {
    history = typeof gameState.TurnHistory === 'string'
      ? JSON.parse(gameState.TurnHistory) : (gameState.TurnHistory || []);
  } catch {}

  if (!history.length) { log.innerHTML = '<div class="log-item">Game started!</div>'; return; }

  log.innerHTML = [...history].reverse().slice(0, 20).map(h => {
    const uid  = h.player;
    const name = uid === COMPUTER_UID ? '🤖 Computer'
      : (String(uid) === String(currentUser.userId) ? 'You' : uid);
    const time = new Date(h.ts).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
    return `<div class="log-item"><span style="color:var(--text-muted);margin-right:6px;">${time}</span>${name} rolled ${h.dice} (piece ${h.piece + 1})</div>`;
  }).join('');
}

// ── Status bar ─────────────────────────────────────────────
function setStatus(msg) {
  const el = document.getElementById('status-bar');
  if (el) el.innerHTML = msg;
}

// ── Activity log helper ────────────────────────────────────
function addLog(msg) {
  const log = document.getElementById('activity-log');
  if (!log) return;
  const item = document.createElement('div');
  item.className = 'log-item';
  item.textContent = msg;
  log.insertBefore(item, log.firstChild);
  if (log.children.length > 25) log.removeChild(log.lastChild);
}

// ── Winner ─────────────────────────────────────────────────
function showWinner(winnerId) {
  const modal = document.getElementById('winner-modal');
  if (!modal || !modal.classList.contains('hidden')) return;

  const isMe   = String(winnerId) === String(currentUser.userId);
  const isComp = winnerId === COMPUTER_UID;
  const name   = isComp ? 'Computer' : (isMe ? currentUser.name : winnerId);

  document.getElementById('winner-emoji').textContent = isMe ? '🏆' : isComp ? '🤖' : '🎉';
  document.getElementById('winner-title').textContent = isMe ? 'YOU WIN!' : isComp ? 'COMPUTER WINS' : `${name} WINS!`;
  document.getElementById('winner-sub').textContent   = isMe
    ? 'Congratulations! You are the Ludo Champion!'
    : `Better luck next time!`;
  modal.classList.remove('hidden');
}

// ── BOARD MAP DATA ─────────────────────────────────────────
// 52-cell track: [col, row] in 15x15 grid
const TRACK_MAP = [
  [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  [0,7],
  [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
  [7,0],
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
  [14,7],
  [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
  [7,14],
];

// Home grid positions (cx, cy in cell units) for each player's 4 pieces
const HOME_GRIDS = [
  [[1.5,1.5],[3.5,1.5],[1.5,3.5],[3.5,3.5]],    // red   (top-left)
  [[10.5,1.5],[12.5,1.5],[10.5,3.5],[12.5,3.5]], // green (top-right)
  [[1.5,10.5],[3.5,10.5],[1.5,12.5],[3.5,12.5]], // yellow(bottom-left)
  [[10.5,10.5],[12.5,10.5],[10.5,12.5],[12.5,12.5]], // blue(bottom-right)
  [[6.5,6.5],[8.5,6.5],[6.5,8.5],[8.5,8.5]], // purple (center — 5th player)
];

// ── Utilities ──────────────────────────────────────────────
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(hex, amt) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16) + Math.round(255*amt));
  const g = Math.min(255, parseInt(hex.slice(3,5),16) + Math.round(255*amt));
  const b = Math.min(255, parseInt(hex.slice(5,7),16) + Math.round(255*amt));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
function roundRectFill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  ctx.fill();
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Animate pieces glow continuously
setInterval(() => {
  if (gameState && diceRolled) renderBoard();
}, 600);
