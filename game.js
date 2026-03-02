const socket = io();

const canvas = document.getElementById('chain-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const logicalWidth = 960;
const logicalHeight = 640;
let pixelRatio = 1;

if (canvas) {
    configureCanvasResolution();
}

function configureCanvasResolution() {
    pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(logicalWidth * pixelRatio);
    canvas.height = Math.round(logicalHeight * pixelRatio);
    canvas.style.aspectRatio = `${logicalWidth} / ${logicalHeight}`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;
}

const COLS = 10;
const ROWS = 8;
const cellPadding = 2;
const explosionDurationMs = 180;
const cellWidth = Math.floor(logicalWidth / COLS);
const cellHeight = Math.floor(logicalHeight / ROWS);

const themeColors = {
    red: '#f25c5c',
    blue: '#4a8cff',
    green: '#3cc88c',
    yellow: '#ffc63e',
    purple: '#9b6dff',
    orange: '#ff8a50'
};

const themeColorsLight = {
    red: 'rgba(242, 92, 92, 0.12)',
    blue: 'rgba(74, 140, 255, 0.12)',
    green: 'rgba(60, 200, 140, 0.12)',
    yellow: 'rgba(255, 198, 62, 0.12)',
    purple: 'rgba(155, 109, 255, 0.12)',
    orange: 'rgba(255, 138, 80, 0.12)'
};

const themeColorsDepth = {
    red: '#c43e3e',
    blue: '#3468cc',
    green: '#2a9e6b',
    yellow: '#d4a020',
    purple: '#7548d4',
    orange: '#d46a35'
};

// ═══════════════════════════════════════════════════════════
// UI ELEMENTS
// ═══════════════════════════════════════════════════════════

const mainMenu = document.getElementById('main-menu');
const gameScreen = document.getElementById('game-screen');
const authPanel = document.getElementById('auth-panel');
const joinPanel = document.getElementById('join-panel');
const lobbyPanel = document.getElementById('lobby-panel');

const playerNameInput = document.getElementById('player-name');
const playerColorSelect = document.getElementById('player-color');
const roomCodeInput = document.getElementById('room-code-input');
const roomCodeText = document.getElementById('room-code-text');
const copyCodeBtn = document.getElementById('copy-code-btn');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const gameRoomId = document.getElementById('game-room-id');

const showHostBtn = document.getElementById('show-host-btn');
const showJoinBtn = document.getElementById('show-join-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const backAuthBtn = document.getElementById('back-auth-btn');
const startGameBtn = document.getElementById('start-game-btn');
const waitingHostMsg = document.getElementById('waiting-host-msg');

const scoreBar = document.getElementById('score-bar');
const turnIndicatorBar = document.getElementById('turn-indicator-bar');
const turnPlayerName = document.getElementById('turn-player-name');
const menuBtn = document.getElementById('menu-btn');

const winnerModal = document.getElementById('winner-modal');
const winnerModalTitle = document.getElementById('winner-modal-title');
const winnerModalText = document.getElementById('winner-modal-text');
const modalRematchBtn = document.getElementById('modal-rematch-btn');
const modalExitBtn = document.getElementById('modal-exit-btn');
const modalWaitingMsg = document.getElementById('modal-waiting-msg');

// Toast container reference
const toastContainer = document.getElementById('toast-container');

// ═══════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════

let roomCode = null;
let enabledPlayers = [];
let currentPlayerIndex = 0;
let myPlayerId = null;
let amHost = false;

let grid = createGrid();
let projectiles = [];
let animationFrame = 0;
let turnCount = 0;
let pendingTurnAdvance = false;
let winner = null;
let gameActive = false;
let audioContext;
let statsDirty = true;
let totalExplosions = 0;
let eliminatedPlayers = new Set();
let isRendering = false;
let hasVotedRematch = false;

function createGrid() {
    return Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => ({ count: 0, color: null }))
    );
}

// ═══════════════════════════════════════════════════════════
// TOAST SYSTEM (non-intrusive notifications)
// ═══════════════════════════════════════════════════════════

function showToast(message, durationMs = 3000) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
    });

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove());
    }, durationMs);
}

// ═══════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════

function validateName() {
    const name = playerNameInput.value.trim();
    if (!name || name.length < 1) {
        showToast('Please enter a player name.');
        playerNameInput.focus();
        playerNameInput.style.borderColor = '#f25c5c';
        setTimeout(() => { playerNameInput.style.borderColor = ''; }, 2000);
        return null;
    }
    return name;
}

// ═══════════════════════════════════════════════════════════
// NETWORK EVENTS — Connection
// ═══════════════════════════════════════════════════════════

socket.on('connect', () => {
    myPlayerId = socket.id;
});

// ─── HOST MATCH ───
showHostBtn.addEventListener('click', () => {
    const name = validateName();
    if (!name) return;
    const color = playerColorSelect.value;
    amHost = true;
    socket.emit('hostMatch', { name, color });
});

// ─── JOIN FLOW ───
showJoinBtn.addEventListener('click', () => {
    const name = validateName();
    if (!name) return;
    authPanel.classList.add('hidden');
    joinPanel.classList.remove('hidden');
});

backAuthBtn.addEventListener('click', () => {
    joinPanel.classList.add('hidden');
    authPanel.classList.remove('hidden');
});

joinGameBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) {
        showToast('Please enter a room code.');
        return;
    }
    const name = playerNameInput.value.trim() || 'Player';
    const color = playerColorSelect.value;
    amHost = false;
    socket.emit('joinMatch', { code, name, color });
});

// ─── COPY CODE ───
copyCodeBtn.addEventListener('click', () => {
    if (roomCode) {
        navigator.clipboard.writeText(roomCode).then(() => {
            showToast('Room code copied!');
        });
    }
});

// ─── ERROR HANDLING ───
socket.on('errorMsg', (msg) => {
    showToast(msg, 4000);
});

// ─── ROOM CREATED (host) ───
socket.on('roomCreated', (code) => {
    roomCode = code;
    roomCodeText.textContent = code;
    authPanel.classList.add('hidden');
    lobbyPanel.classList.remove('hidden');
    startGameBtn.classList.remove('hidden');
    waitingHostMsg.classList.add('hidden');
    gameRoomId.textContent = code;
});

// ─── ROOM JOINED (joiner) ───
socket.on('roomJoined', ({ code, assignedName }) => {
    roomCode = code;
    roomCodeText.textContent = code;
    joinPanel.classList.add('hidden');
    lobbyPanel.classList.remove('hidden');
    startGameBtn.classList.add('hidden');
    waitingHostMsg.classList.remove('hidden');
    gameRoomId.textContent = code;

    // Update name input to show assigned name (in case of duplicate rename)
    if (assignedName && assignedName !== playerNameInput.value.trim()) {
        playerNameInput.value = assignedName;
        showToast(`Renamed to "${assignedName}" to avoid duplicate.`);
    }
});

// ─── LOBBY UPDATE ───
socket.on('lobbyUpdate', (players) => {
    enabledPlayers = players;
    lobbyPlayerList.innerHTML = '';

    // Check if I am now the host (first player is always host)
    if (players.length > 0 && players[0].id === myPlayerId) {
        amHost = true;
        if (!gameActive) {
            startGameBtn.classList.remove('hidden');
            waitingHostMsg.classList.add('hidden');
        }
    }

    players.forEach(p => {
        const li = document.createElement('li');
        li.className = 'player-list-item';
        const playerColor = themeColors[p.color] || '#999';
        li.innerHTML = `
            <div style="display:flex; align-items:center;">
                <div class="dot" style="background: ${playerColor};"></div>
                <div class="name">${p.name} ${p.id === myPlayerId ? '(You)' : ''}</div>
            </div>
            ${p.id === players[0].id ? '<div class="label-muted">HOST</div>' : ''}
        `;
        lobbyPlayerList.appendChild(li);
    });
});

// ─── START MATCH ───
startGameBtn.addEventListener('click', () => {
    if (enabledPlayers.length < 2) {
        showToast('Need at least 2 players to start.');
        return;
    }
    socket.emit('startMatch', roomCode);
});

socket.on('matchStarted', ({ players, turnIndex }) => {
    enabledPlayers = players;
    currentPlayerIndex = turnIndex;
    startMatchUI();
});

// ─── ATOM PLACED (from server, for all clients) ───
socket.on('atomPlaced', ({ row, col, playerIndex }) => {
    if (!gameActive && projectiles.length === 0) return;
    currentPlayerIndex = playerIndex;
    const player = enabledPlayers[currentPlayerIndex];
    addAtomAt(row, col, player.color, false);
});

// ═══════════════════════════════════════════════════════════
// GAME OVER — Server-driven winner notification
// ═══════════════════════════════════════════════════════════

socket.on('matchEnded', ({ winnerId, winnerName, winnerColor, reason }) => {
    // Server says game is over — show to ALL clients simultaneously
    const isWinner = winnerId === myPlayerId;
    winner = enabledPlayers.find(p => p.id === winnerId) || { name: winnerName, color: winnerColor };

    gameActive = false;
    hasVotedRematch = false;
    playWinTune();
    statsDirty = true;

    winnerModalTitle.textContent = isWinner ? 'VICTORY!' : 'GAME OVER';
    winnerModalText.textContent = isWinner
        ? 'You dominated the board!'
        : `${winnerName} wins the game!`;

    if (reason) {
        winnerModalText.textContent += ` (${reason})`;
    }

    // Reset modal buttons
    if (modalRematchBtn) {
        modalRematchBtn.classList.remove('hidden');
        modalRematchBtn.querySelector('.btn-content').textContent = 'REMATCH';
        modalRematchBtn.disabled = false;
    }
    if (modalExitBtn) modalExitBtn.classList.remove('hidden');
    if (modalWaitingMsg) modalWaitingMsg.classList.add('hidden');

    winnerModal.classList.remove('hidden');
});

// ─── REMATCH FLOW ───

if (modalRematchBtn) {
    modalRematchBtn.addEventListener('click', () => {
        if (hasVotedRematch) return;
        hasVotedRematch = true;
        socket.emit('rematchVote', roomCode);

        // Show waiting state
        modalRematchBtn.querySelector('.btn-content').textContent = 'VOTED ✓';
        modalRematchBtn.disabled = true;
        if (modalWaitingMsg) {
            modalWaitingMsg.classList.remove('hidden');
            modalWaitingMsg.textContent = 'Waiting for others...';
        }
    });
}

if (modalExitBtn) {
    modalExitBtn.addEventListener('click', () => {
        socket.emit('leaveGame', roomCode);
        returnToMenu();
        // Show auth panel for fresh start
        authPanel.classList.remove('hidden');
        lobbyPanel.classList.add('hidden');
        joinPanel.classList.add('hidden');
    });
}

socket.on('rematchVoteUpdate', ({ votedCount, totalNeeded, voterName }) => {
    if (modalWaitingMsg && !modalWaitingMsg.classList.contains('hidden')) {
        modalWaitingMsg.textContent = `Waiting for players... (${votedCount}/${totalNeeded})`;
    }
    if (voterName && votedCount < totalNeeded) {
        showToast(`${voterName} wants a rematch!`);
    }
});

socket.on('rematchStarted', () => {
    hasVotedRematch = false;
    returnToMenu();
    authPanel.classList.add('hidden');
    joinPanel.classList.add('hidden');
    lobbyPanel.classList.remove('hidden');
    showToast('Rematch! Back to lobby.');
});

// ─── PLAYER LEFT / DISCONNECTED ───

socket.on('playerLeftGame', ({ name, color }) => {
    showToast(`${name} left the game.`, 4000);
});

socket.on('playerDisconnected', ({ name, color, playerId }) => {
    showToast(`${name} disconnected.`, 4000);
    // Mark player as eliminated visually
    eliminatedPlayers.add(playerId);
    statsDirty = true;
});

// ═══════════════════════════════════════════════════════════
// GAME CORE LOGIC
// ═══════════════════════════════════════════════════════════

function startMatchUI() {
    grid = createGrid();
    projectiles = [];
    winner = null;
    pendingTurnAdvance = false;
    turnCount = 0;
    totalExplosions = 0;
    eliminatedPlayers = new Set();
    hasVotedRematch = false;

    gameActive = true;
    statsDirty = true;

    mainMenu.classList.remove('active');
    gameScreen.classList.add('active');

    winnerModal.classList.add('hidden');

    if (!isRendering) {
        isRendering = true;
        requestAnimationFrame(render);
    }
}

function returnToMenu() {
    gameActive = false;
    winner = null;
    pendingTurnAdvance = false;
    projectiles = [];
    eliminatedPlayers = new Set();
    statsDirty = true;
    hasVotedRematch = false;

    gameScreen.classList.remove('active');
    mainMenu.classList.add('active');
    winnerModal.classList.add('hidden');
}

menuBtn.addEventListener('click', () => {
    // Leave the game entirely
    if (roomCode) {
        socket.emit('leaveGame', roomCode);
    }
    window.location.reload();
});

// ═══════════════════════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════════════════════

function initAudio() {
    if (audioContext) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) { }
}

function playTone(freq, type, dur, vol) {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    gain.gain.setValueAtTime(vol, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + dur);
    osc.start();
    osc.stop(audioContext.currentTime + dur);
}

function playAtomSound() { playTone(630, 'square', 0.08, 0.14); }
function playExplosionSound() { playTone(150, 'sawtooth', 0.28, 0.25); }
function playWinTune() { setTimeout(() => playTone(523, 'triangle', 0.2, 0.1), 0); setTimeout(() => playTone(659, 'triangle', 0.2, 0.1), 100); }

// Button pop sound — satisfying tactile click
function playButtonPop() {
    initAudio();
    if (!audioContext) return;
    // High pop
    const osc1 = audioContext.createOscillator();
    const g1 = audioContext.createGain();
    osc1.connect(g1); g1.connect(audioContext.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, audioContext.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.06);
    g1.gain.setValueAtTime(0.12, audioContext.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.06);
    osc1.start(); osc1.stop(audioContext.currentTime + 0.06);
    // Low thud
    const osc2 = audioContext.createOscillator();
    const g2 = audioContext.createGain();
    osc2.connect(g2); g2.connect(audioContext.destination);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(200, audioContext.currentTime);
    g2.gain.setValueAtTime(0.08, audioContext.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.04);
    osc2.start(); osc2.stop(audioContext.currentTime + 0.04);
}

// Attach pop sound to all buttons via event delegation
document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .icon-btn');
    if (btn) playButtonPop();
}, true);

// ═══════════════════════════════════════════════════════════
// GAME MECHANICS (unchanged)
// ═══════════════════════════════════════════════════════════

function inBounds(row, col) { return row >= 0 && row < ROWS && col >= 0 && col < COLS; }

function criticalMass(row, col) {
    let n = 0;
    if (row > 0) n++; if (row < ROWS - 1) n++;
    if (col > 0) n++; if (col < COLS - 1) n++;
    return n;
}

function cellCenter(row, col) {
    return { x: col * cellWidth + cellWidth / 2, y: row * cellHeight + cellHeight / 2 };
}

function explodeAt(row, col, color) {
    playExplosionSound();
    totalExplosions++;
    const { x: sx, y: sy } = cellCenter(row, col);
    grid[row][col].count = 0;
    grid[row][col].color = null;
    statsDirty = true;

    const neighbors = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];
    const startTime = performance.now();

    for (const [nr, nc] of neighbors) {
        if (!inBounds(nr, nc)) continue;
        const { x: ex, y: ey } = cellCenter(nr, nc);
        projectiles.push({
            sx, sy, ex, ey, start: startTime, dur: explosionDurationMs,
            targetRow: nr, targetCol: nc, color, applied: false, done: false
        });
    }
}

function addAtomAt(row, col, color, sourceIsExplosion = false) {
    if (!inBounds(row, col)) return false;
    const cell = grid[row][col];

    if (!sourceIsExplosion && cell.count > 0 && cell.color !== color) return false;
    if (!sourceIsExplosion) playAtomSound();

    cell.color = color;
    cell.count += 1;
    statsDirty = true;

    if (!sourceIsExplosion) pendingTurnAdvance = true;

    if (cell.count >= criticalMass(row, col)) {
        explodeAt(row, col, color);
    }
    return true;
}

function atomCounts() {
    const counts = {};
    enabledPlayers.forEach(p => counts[p.color] = 0);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (cell.count > 0 && counts[cell.color] !== undefined) {
                counts[cell.color] += cell.count;
            }
        }
    }
    return counts;
}

function findNextPlayerIndex(counts) {
    let nextIndex = currentPlayerIndex;
    for (let step = 0; step < enabledPlayers.length; step++) {
        nextIndex = (nextIndex + 1) % enabledPlayers.length;
        const player = enabledPlayers[nextIndex];
        // Skip offline players
        if (player.offline) continue;
        if (turnCount < enabledPlayers.length || counts[player.color] > 0) {
            return nextIndex;
        }
    }
    return currentPlayerIndex;
}

function finalizeTurnIfReady() {
    if (!pendingTurnAdvance || projectiles.length > 0 || !gameActive) return;
    pendingTurnAdvance = false;
    turnCount++;

    const counts = atomCounts();
    if (turnCount >= enabledPlayers.length) {
        const survivors = enabledPlayers.filter(p => !p.offline && counts[p.color] > 0);
        if (survivors.length === 1) {
            winner = survivors[0];
            // Host reports winner to server for synchronized notification
            if (amHost) {
                socket.emit('gameOver', { code: roomCode, winnerId: winner.id });
            }
            statsDirty = true;
            return;
        }
        if (survivors.length === 0) {
            // Edge case: all wiped simultaneously — draw or last player standing
            statsDirty = true;
            return;
        }
    }

    currentPlayerIndex = findNextPlayerIndex(counts);
    statsDirty = true;

    // Only the host syncs the next turn index to server
    if (amHost) {
        socket.emit('syncTurn', { code: roomCode, newTurnIndex: currentPlayerIndex });
    }
}

// ═══════════════════════════════════════════════════════════
// HUD — Score Bar & Turn Indicator
// ═══════════════════════════════════════════════════════════

function updateHudStats() {
    const counts = atomCounts();

    if (scoreBar) {
        scoreBar.innerHTML = '';
        enabledPlayers.forEach(p => {
            const c = counts[p.color] || 0;
            const isEliminated = (turnCount >= enabledPlayers.length && c === 0) || p.offline;
            const isMyTurn = (enabledPlayers[currentPlayerIndex].id === p.id);
            const playerColor = themeColors[p.color] || '#999';
            const playerLight = themeColorsLight[p.color] || 'rgba(0,0,0,0.05)';

            const chip = document.createElement('div');
            chip.className = 'player-chip' + (isMyTurn ? ' active' : '');
            chip.style.background = playerLight;
            chip.style.borderColor = isMyTurn ? playerColor : 'transparent';
            chip.style.color = isMyTurn ? (themeColorsDepth[p.color] || '#333') : '#4a5568';
            chip.style.opacity = isEliminated ? '0.35' : '1';
            if (isMyTurn) {
                chip.style.boxShadow = `0 2px 12px ${playerColor}33`;
            }

            const displayName = p.name.substring(0, 8);
            const statusIcon = p.offline ? ' ⚡' : '';
            chip.innerHTML = `
                <span class="player-dot" style="background:${playerColor}"></span>
                <span>${displayName}${statusIcon}: ${c}</span>
            `;
            scoreBar.appendChild(chip);
        });
    }

    if (winner) {
        const wc = themeColors[winner.color] || '#999';
        const wcLight = themeColorsLight[winner.color] || 'rgba(0,0,0,0.05)';
        const wcDepth = themeColorsDepth[winner.color] || '#333';
        turnIndicatorBar.innerHTML = `<span id="turn-player-name">${winner.name}</span> WINS!`;
        turnIndicatorBar.style.background = wcLight;
        turnIndicatorBar.style.color = wcDepth;
        turnIndicatorBar.style.borderTopColor = wc;
    } else {
        const cp = enabledPlayers[currentPlayerIndex];
        const isMe = cp.id === myPlayerId;
        const cpColor = themeColors[cp.color] || '#999';
        const cpLight = themeColorsLight[cp.color] || 'rgba(0,0,0,0.05)';
        const cpDepth = themeColorsDepth[cp.color] || '#333';
        turnIndicatorBar.innerHTML = `<span id="turn-player-name">${isMe ? 'YOUR' : cp.name + "'S"}</span> TURN`;
        turnIndicatorBar.style.background = cpLight;
        turnIndicatorBar.style.color = cpDepth;
        turnIndicatorBar.style.borderTopColor = cpColor;
    }
}

// ═══════════════════════════════════════════════════════════
// CANVAS RENDERING
// ═══════════════════════════════════════════════════════════

function renderGrid() {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    // Draw grid lines — subtle on light background
    ctx.strokeStyle = 'rgba(58, 70, 96, 0.08)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;

    for (let c = 0; c <= COLS; c++) {
        const x = c * cellWidth; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, logicalHeight); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        const y = r * cellHeight; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(logicalWidth, y); ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (cell.count === 0) continue;

            const cx = c * cellWidth + cellWidth / 2;
            const cy = r * cellHeight + cellHeight / 2;
            const radius = Math.min(cellWidth, cellHeight) * 0.15;
            const sp = radius * 1.2;

            let jx = 0, jy = 0;
            if (cell.count + 1 >= criticalMass(r, c)) {
                jx = Math.sin(animationFrame / 5 + (r * 7 + c)) * 2;
                jy = Math.cos(animationFrame / 5 + (r * 5 + c * 3)) * 2;
            }

            const cValue = typeof cell.color === 'string' && cell.color.startsWith('#') ? cell.color : themeColors[cell.color];
            const cDepth = themeColorsDepth[cell.color] || cValue;

            // 3D sphere illusion: main fill + highlight + shadow
            const drawA = (ax, ay) => {
                ctx.beginPath(); ctx.arc(ax, ay, radius, 0, Math.PI * 2);
                ctx.fillStyle = cValue;
                ctx.shadowColor = cValue;
                ctx.shadowBlur = 8;
                ctx.fill();
                ctx.shadowBlur = 0;

                // Bottom inset shadow
                ctx.beginPath(); ctx.arc(ax, ay + radius * 0.15, radius * 0.85, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.1)';
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';

                // Re-draw main color
                ctx.beginPath(); ctx.arc(ax, ay, radius, 0, Math.PI * 2);
                ctx.fillStyle = cValue;
                ctx.fill();

                // Top highlight
                ctx.beginPath(); ctx.arc(ax - radius * 0.2, ay - radius * 0.2, radius * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fill();
            };

            if (cell.count === 1) { drawA(cx + jx, cy + jy); }
            else if (cell.count === 2) { drawA(cx - sp + jx, cy + jy); drawA(cx + sp + jx, cy + jy); }
            else { drawA(cx - sp + jx, cy - sp * .6 + jy); drawA(cx + sp + jx, cy - sp * .6 + jy); drawA(cx + jx, cy + sp * .8 + jy); }
            ctx.shadowBlur = 0;
        }
    }
}

function renderProjectiles(now) {
    const radius = Math.min(cellWidth, cellHeight) * 0.15;
    for (const p of projectiles) {
        const prog = Math.min(1, (now - p.start) / p.dur);
        const x = p.sx + (p.ex - p.sx) * prog;
        const y = p.sy + (p.ey - p.sy) * prog;

        const cc = typeof p.color === 'string' && p.color.startsWith('#') ? p.color : themeColors[p.color];
        ctx.shadowColor = cc; ctx.shadowBlur = 8; ctx.fillStyle = cc;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        // Top highlight on projectile
        ctx.beginPath(); ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
        ctx.shadowBlur = 0;

        if (prog >= 1 && !p.applied) {
            p.applied = true; p.done = true;
            addAtomAt(p.targetRow, p.targetCol, p.color, true);
        }
    }
    if (projectiles.length > 0) projectiles = projectiles.filter(p => !p.done);
}

function render(now) {
    if (!gameActive && projectiles.length === 0) {
        isRendering = false;
        return;
    }

    renderGrid();
    renderProjectiles(now);
    finalizeTurnIfReady();

    if (statsDirty) {
        updateHudStats();
        statsDirty = false;
    }

    animationFrame++;
    if (gameActive || projectiles.length > 0) requestAnimationFrame(render);
    else isRendering = false;
}

// ═══════════════════════════════════════════════════════════
// CANVAS CLICK HANDLER
// ═══════════════════════════════════════════════════════════

canvas.addEventListener('click', (e) => {
    if (!gameActive || winner || projectiles.length > 0) return;
    initAudio();

    const rect = canvas.getBoundingClientRect();
    const sx = logicalWidth / rect.width;
    const sy = logicalHeight / rect.height;
    const col = Math.floor((e.clientX - rect.left) * sx / cellWidth);
    const row = Math.floor((e.clientY - rect.top) * sy / cellHeight);

    if (!inBounds(row, col)) return;
    const cp = enabledPlayers[currentPlayerIndex];

    if (cp.id !== myPlayerId) {
        // Not your turn — show subtle feedback
        showToast(`It's ${cp.name}'s turn.`);
        return;
    }

    const cell = grid[row][col];
    if (cell.count === 0 || cell.color === cp.color) {
        socket.emit('placeAtom', { code: roomCode, row, col });
    } else {
        showToast("You can only place on empty cells or your own.");
    }
});
