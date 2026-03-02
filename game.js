const socket = io();

const canvas = document.getElementById('chain-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const logicalWidth = 480;
const logicalHeight = 720;
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

const COLS = 6;
const ROWS = 9;
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

// ─── Color helpers ───
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
let pendingServerEvents = [];
let targetGrid = null;
let targetTurnIndex = 0;
let winner = null;
let gameActive = false;
let audioContext;
let statsDirty = true;
let isRendering = false;

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
    targetTurnIndex = turnIndex;
    grid = createGrid();
    targetGrid = null;
    pendingServerEvents = [];
    projectiles = [];
    startMatchUI();
});

// ─── GAME STATE UPDATE (Server-Authoritative) ───
socket.on('gameStateUpdate', ({ events, grid: serverGrid, turnIndex }) => {
    if (!gameActive) return;

    if (!events || events.length === 0) {
        // Just a sync correction (e.g. invalid move or out of turn)
        grid = serverGrid;
        currentPlayerIndex = turnIndex;
        statsDirty = true;
        if (!isRendering) { isRendering = true; requestAnimationFrame(render); }
        return;
    }

    pendingServerEvents = pendingServerEvents.concat(events);
    targetGrid = serverGrid;
    targetTurnIndex = turnIndex;

    if (!isRendering) {
        isRendering = true;
        requestAnimationFrame(render);
    }
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

// ═══════════════════════════════════════════════════════════
// EVENT PROCESSING (Server-Authoritative Animation)
// ═══════════════════════════════════════════════════════════

function processServerEvents(now) {
    // Wait for flying projectiles to land before processing the next explosion wave
    if (projectiles.length > 0) return;

    if (pendingServerEvents.length === 0) {
        // All events processed, perfectly sync local grid to server's target grid
        if (targetGrid) {
            grid = targetGrid;
            targetGrid = null;
            currentPlayerIndex = targetTurnIndex;
            statsDirty = true;
        }
        return;
    }

    const event = pendingServerEvents.shift();

    if (event.type === 'place') {
        playAtomSound();
        grid[event.row][event.col].color = event.color;
        grid[event.row][event.col].count += 1;
        statsDirty = true;
    }
    else if (event.type === 'explodeWave') {
        playExplosionSound();
        for (const exp of event.explosions) {
            const { row, col, color } = exp;

            // Empty the cell visually
            grid[row][col].count = 0;
            grid[row][col].color = null;

            const { x: sx, y: sy } = cellCenter(row, col);
            const neighbors = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];

            for (const [nr, nc] of neighbors) {
                if (!inBounds(nr, nc)) continue;
                const { x: ex, y: ey } = cellCenter(nr, nc);
                projectiles.push({
                    sx, sy, ex, ey, start: now, dur: explosionDurationMs,
                    targetRow: nr, targetCol: nc, color, applied: false, done: false
                });
            }
        }
        statsDirty = true;
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
            const isEliminated = false; // Elimination styling logic removed for now to simplify, could be re-added via server flag
            const isMyTurn = (enabledPlayers[currentPlayerIndex]?.id === p.id);
            const playerColor = themeColors[p.color] || '#fff';

            const chip = document.createElement('div');
            chip.className = 'player-chip' + (isMyTurn ? ' active' : '');
            // Dark theme chip colors
            chip.style.background = isMyTurn ? hexToRgba(playerColor, 0.18) : 'rgba(255,255,255,0.05)';
            chip.style.borderColor = isMyTurn ? playerColor : 'transparent';
            chip.style.opacity = isEliminated ? '0.3' : '1';
            if (isMyTurn) {
                chip.style.boxShadow = `0 2px 14px ${hexToRgba(playerColor, 0.35)}`;
            }

            const displayName = p.name.substring(0, 8);
            const statusIcon = p.offline ? ' ⚡' : '';
            chip.innerHTML = `
                <span class="player-dot" style="background:${playerColor}; box-shadow: 0 0 6px ${hexToRgba(playerColor, 0.6)}"></span>
                <span>${displayName}${statusIcon}: ${c}</span>
            `;
            scoreBar.appendChild(chip);
        });
    }

    if (winner) {
        const wc = themeColors[winner.color] || '#fff';
        turnIndicatorBar.innerHTML = `<span id="turn-player-name">${winner.name}</span> WINS! 🎉`;
        turnIndicatorBar.style.background = hexToRgba(wc, 0.15);
        turnIndicatorBar.style.color = wc;
        turnIndicatorBar.style.borderTopColor = wc;
    } else {
        const cp = enabledPlayers[currentPlayerIndex];
        const isMe = cp.id === myPlayerId;
        const cpColor = themeColors[cp.color] || '#fff';
        turnIndicatorBar.innerHTML = `<span id="turn-player-name">${isMe ? 'YOUR' : cp.name + "'S"}</span> TURN`;
        turnIndicatorBar.style.background = hexToRgba(cpColor, 0.1);
        turnIndicatorBar.style.color = cpColor;
        turnIndicatorBar.style.borderTopColor = cpColor;
    }
}

// ═══════════════════════════════════════════════════════════
// CANVAS RENDERING
// ═══════════════════════════════════════════════════════════

function renderGrid() {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    // Grid lines colored to current player's turn
    const cp = enabledPlayers[currentPlayerIndex];
    if (gameActive && cp && !winner) {
        const turnColor = themeColors[cp.color] || '#4a5568';
        ctx.strokeStyle = turnColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
    } else {
        ctx.strokeStyle = 'rgba(58, 70, 96, 0.25)';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
    }

    for (let c = 0; c <= COLS; c++) {
        const x = c * cellWidth; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, logicalHeight); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        const y = r * cellHeight; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(logicalWidth, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (cell.count === 0) continue;

            const cx = c * cellWidth + cellWidth / 2;
            const cy = r * cellHeight + cellHeight / 2;
            const radius = Math.min(cellWidth, cellHeight) * 0.18;
            const sp = radius * 1.3;

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
    const radius = Math.min(cellWidth, cellHeight) * 0.18;
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
            // Visually add the atom to the receiver cell
            grid[p.targetRow][p.targetCol].color = p.color;
            grid[p.targetRow][p.targetCol].count += 1;
            statsDirty = true;
        }
    }
    if (projectiles.length > 0) projectiles = projectiles.filter(p => !p.done);
}

function render(now) {
    if (!gameActive && projectiles.length === 0 && pendingServerEvents.length === 0) {
        isRendering = false;
        return;
    }

    renderGrid();
    renderProjectiles(now);

    // Process server-dictated game ticks
    processServerEvents(now);

    if (statsDirty) {
        updateHudStats();
        statsDirty = false;
    }

    animationFrame++;
    if (gameActive || projectiles.length > 0 || pendingServerEvents.length > 0) {
        requestAnimationFrame(render);
    } else {
        isRendering = false;
    }
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

// ═══════════════════════════════════════════════════════════
// GAME GUIDE — "How to Play" Auto-playing Animated Slides
// ═══════════════════════════════════════════════════════════

(function GameGuide() {
    const overlay = document.getElementById('guide-overlay');
    const openBtn = document.getElementById('guide-open-btn');
    const closeBtn = document.getElementById('guide-close-btn');
    const prevBtn = document.getElementById('guide-prev-btn');
    const nextBtn = document.getElementById('guide-next-btn');
    const dotsEl = document.getElementById('guide-dots');
    const titleEl = document.getElementById('guide-slide-title');
    const descEl = document.getElementById('guide-slide-desc');
    const gCanvas = document.getElementById('guide-canvas');
    const gCtx = gCanvas.getContext('2d');

    if (!overlay || !gCanvas) return;

    const W = 560, H = 560;
    let currentSlide = 0;
    let animId = null;

    const colors = {
        red: '#f25c5c', blue: '#4a8cff', green: '#3cc88c',
        yellow: '#ffc63e', purple: '#9b6dff', grid: 'rgba(74, 140, 255, 0.25)'
    };

    // ── SLIDE DEFINITIONS ──

    const slides = [
        {
            title: 'Chain Reaction',
            desc: 'A strategic multiplayer game! Place atoms on the grid, trigger explosive chain reactions, and convert your opponent\'s atoms to dominate the board.',
            draw: drawSlide0
        },
        {
            title: 'Placing Atoms',
            desc: 'Tap any empty cell to place your atom. You can also stack atoms on your own cells — but never on your opponent\'s!',
            draw: drawSlide1
        },
        {
            title: 'Critical Mass',
            desc: 'Each cell has a limit based on its neighbors: corners hold 1, edges hold 2, center cells hold 3. Add one more and it explodes!',
            draw: drawSlide2
        },
        {
            title: 'Chain Reactions',
            desc: 'Explosions send atoms to neighbors, converting them to your color. This can trigger a cascade of explosions across the board!',
            draw: drawSlide3
        },
        {
            title: 'Win the Game',
            desc: 'Eliminate every opponent atom from the board. The last player standing wins! 🏆',
            draw: drawSlide4
        }
    ];

    // ── NAVIGATION ──

    function buildDots() {
        dotsEl.innerHTML = '';
        slides.forEach((_, i) => {
            const d = document.createElement('div');
            d.className = 'guide-dot' + (i === currentSlide ? ' active' : '');
            dotsEl.appendChild(d);
        });
    }

    function updateSlide() {
        const s = slides[currentSlide];
        titleEl.textContent = s.title;
        descEl.textContent = s.desc;
        prevBtn.style.visibility = currentSlide === 0 ? 'hidden' : 'visible';
        nextBtn.querySelector('.btn-content').textContent = currentSlide === slides.length - 1 ? 'DONE' : 'NEXT ›';
        buildDots();
        startAnimation();
    }

    function open() {
        currentSlide = 0;
        overlay.classList.remove('hidden');
        updateSlide();
    }

    function close() {
        stopAnimation();
        overlay.classList.add('hidden');
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    prevBtn.addEventListener('click', () => {
        if (currentSlide > 0) { currentSlide--; updateSlide(); }
    });

    nextBtn.addEventListener('click', () => {
        if (currentSlide < slides.length - 1) { currentSlide++; updateSlide(); }
        else close();
    });

    // ── ANIMATION CORE ──

    function stopAnimation() {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
    }

    function startAnimation() {
        stopAnimation();
        const drawFn = slides[currentSlide].draw;
        const startTime = performance.now();
        function loop(now) {
            const t = (now - startTime) / 1000; // seconds
            gCtx.clearRect(0, 0, W, H);
            drawFn(gCtx, t, W, H);
            animId = requestAnimationFrame(loop);
        }
        animId = requestAnimationFrame(loop);
    }

    // ── SHARED DRAWING HELPERS ──

    function drawSphere(ctx, x, y, r, color) {
        // Main fill + glow
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Highlight
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
    }

    function drawMiniGrid(ctx, ox, oy, rows, cols, cellSize) {
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 2;
        for (let c = 0; c <= cols; c++) {
            ctx.beginPath(); ctx.moveTo(ox + c * cellSize, oy);
            ctx.lineTo(ox + c * cellSize, oy + rows * cellSize); ctx.stroke();
        }
        for (let r = 0; r <= rows; r++) {
            ctx.beginPath(); ctx.moveTo(ox, oy + r * cellSize);
            ctx.lineTo(ox + cols * cellSize, oy + r * cellSize); ctx.stroke();
        }
    }

    // ── SLIDE 0: Welcome — orbiting atoms ──

    function drawSlide0(ctx, t, w, h) {
        const cx = w / 2, cy = h / 2;

        // Rings
        ctx.strokeStyle = 'rgba(74, 140, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 100, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(155, 109, 255, 0.15)';
        ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);

        // Core
        drawSphere(ctx, cx, cy, 28, colors.blue);

        // Orbiting atoms
        const orbitR = 100;
        const atoms = [
            { color: colors.red, speed: 1.2, offset: 0 },
            { color: colors.green, speed: -0.8, offset: 2.1 },
            { color: colors.purple, speed: 0.9, offset: 4.2 }
        ];

        atoms.forEach(a => {
            const angle = t * a.speed + a.offset;
            const ax = cx + Math.cos(angle) * orbitR;
            const ay = cy + Math.sin(angle) * orbitR * 0.6; // elliptical
            drawSphere(ctx, ax, ay, 14, a.color);
        });

        // Floating particles
        for (let i = 0; i < 8; i++) {
            const px = cx + Math.sin(t * 0.5 + i * 1.7) * 140;
            const py = cy + Math.cos(t * 0.4 + i * 2.3) * 140;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(74, 140, 255, ${0.15 + 0.1 * Math.sin(t + i)})`;
            ctx.fill();
        }
    }

    // ── SLIDE 1: Placing atoms — tap animation on mini grid ──

    function drawSlide1(ctx, t, w, h) {
        const cellSz = 100;
        const gCols = 3, gRows = 3;
        const ox = (w - gCols * cellSz) / 2;
        const oy = (h - gRows * cellSz) / 2 - 20;

        drawMiniGrid(ctx, ox, oy, gRows, gCols, cellSz);

        // Cycle through placing atoms in different cells
        const period = 2.5;
        const cycle = t % (period * 4);
        const placements = [
            { r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }, { r: 0, c: 2 }
        ];

        const currentIdx = Math.floor(cycle / period);
        const progress = (cycle % period) / period;

        // Draw already-placed atoms (previous in cycle)
        for (let i = 0; i < currentIdx; i++) {
            const p = placements[i];
            const px = ox + p.c * cellSz + cellSz / 2;
            const py = oy + p.r * cellSz + cellSz / 2;
            drawSphere(ctx, px, py, 20, colors.red);
        }

        // Animate current placement
        if (currentIdx < placements.length) {
            const p = placements[currentIdx];
            const px = ox + p.c * cellSz + cellSz / 2;
            const py = oy + p.r * cellSz + cellSz / 2;

            if (progress < 0.3) {
                // Tap indicator ring
                const ring = progress / 0.3;
                ctx.beginPath();
                ctx.arc(px, py, 30 * ring, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(242, 92, 92, ${0.5 * (1 - ring)})`;
                ctx.lineWidth = 3;
                ctx.stroke();
            } else {
                // Atom appears with scale bounce
                const p2 = Math.min(1, (progress - 0.3) / 0.3);
                const scale = p2 < 1 ? 0.5 + 0.5 * (1 - Math.pow(1 - p2, 3)) : 1;
                drawSphere(ctx, px, py, 20 * scale, colors.red);
            }
        }

        // Cursor hand icon
        if (currentIdx < placements.length) {
            const p = placements[currentIdx];
            const px = ox + p.c * cellSz + cellSz / 2 + 15;
            const py = oy + p.r * cellSz + cellSz / 2 + 20;
            const bounce = Math.sin(t * 4) * 3;
            ctx.font = '32px sans-serif';
            ctx.fillText('👆', px, py + bounce);
        }
    }

    // ── SLIDE 2: Critical mass — numbers on grid cells ──

    function drawSlide2(ctx, t, w, h) {
        const cellSz = 110;
        const gCols = 3, gRows = 3;
        const ox = (w - gCols * cellSz) / 2;
        const oy = (h - gRows * cellSz) / 2 - 20;

        drawMiniGrid(ctx, ox, oy, gRows, gCols, cellSz);

        // Max atoms before explosion (critical mass - 1)
        // Corner: 2 neighbors → explodes at 2 → max 1
        // Edge: 3 neighbors → explodes at 3 → max 2
        // Center: 4 neighbors → explodes at 4 → max 3
        const maxAtoms = [
            [1, 2, 1],
            [2, 3, 2],
            [1, 2, 1]
        ];

        const labelColors = [
            [colors.red, colors.yellow, colors.red],
            [colors.yellow, colors.green, colors.yellow],
            [colors.red, colors.yellow, colors.red]
        ];

        for (let r = 0; r < gRows; r++) {
            for (let c = 0; c < gCols; c++) {
                const cx = ox + c * cellSz + cellSz / 2;
                const cy = oy + r * cellSz + cellSz / 2;
                const max = maxAtoms[r][c];
                const col = labelColors[r][c];

                // Pulse effect
                const pulse = 0.9 + 0.1 * Math.sin(t * 2 + r * 1.5 + c);
                const atomR = 12 * pulse;
                const spacing = 16;

                // Draw the max number of atoms that fit
                if (max === 1) {
                    drawSphere(ctx, cx, cy - 10, atomR, col);
                } else if (max === 2) {
                    drawSphere(ctx, cx - spacing * 0.5, cy - 10, atomR, col);
                    drawSphere(ctx, cx + spacing * 0.5, cy - 10, atomR, col);
                } else {
                    drawSphere(ctx, cx - spacing, cy - 10, atomR, col);
                    drawSphere(ctx, cx, cy - 10, atomR, col);
                    drawSphere(ctx, cx + spacing, cy - 10, atomR, col);
                }

                // Number label
                ctx.font = 'bold 22px Nunito, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`max ${max}`, cx, cy + 32);
            }
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        // Legend at bottom
        ctx.font = 'bold 17px Nunito, sans-serif';
        ctx.fillStyle = colors.red;
        ctx.textAlign = 'center';
        ctx.fillText('🔴 Corner = 1', w / 2 - 130, oy + gRows * cellSz + 40);
        ctx.fillStyle = colors.yellow;
        ctx.fillText('🟡 Edge = 2', w / 2, oy + gRows * cellSz + 40);
        ctx.fillStyle = colors.green;
        ctx.fillText('🟢 Center = 3', w / 2 + 140, oy + gRows * cellSz + 40);
        ctx.textAlign = 'start';
    }

    // ── SLIDE 3: Chain reactions — explosion cascade ──

    function drawSlide3(ctx, t, w, h) {
        const cellSz = 100;
        const gCols = 3, gRows = 3;
        const ox = (w - gCols * cellSz) / 2;
        const oy = (h - gRows * cellSz) / 2 - 10;

        drawMiniGrid(ctx, ox, oy, gRows, gCols, cellSz);

        // Animated chain reaction showing COLOR CONVERSION
        // Setup: Blue atoms on edges/corners, Red builds up in center
        // Phase 0-1s: Board with blue atoms + 1 red in center
        // Phase 1-1.8s: Red atom count in center goes to 3 (about to burst)
        // Phase 1.8-2.2s: Center reaches critical mass (4) — jitters
        // Phase 2.2-3s: Explosion! Red atoms fly to neighbors
        // Phase 3-4.5s: Blue atoms CONVERTED to red on arrival
        // Phase 4.5-6s: Show final converted board, then reset

        const loopT = t % 7;

        // Cell state: {count, color}
        const cells = Array.from({ length: 3 }, () =>
            Array.from({ length: 3 }, () => ({ count: 0, color: null }))
        );

        let explosions = [];
        let flyingAtoms = [];

        // Blue atoms on all 4 edge neighbors of center
        const bluePositions = [[0, 1], [1, 0], [1, 2], [2, 1]];

        if (loopT < 1.0) {
            // Initial state: blue on edges, 1 red in center
            bluePositions.forEach(([r, c]) => { cells[r][c] = { count: 1, color: colors.blue }; });
            cells[1][1] = { count: 1, color: colors.red };
        } else if (loopT < 1.4) {
            // Add 2nd red atom
            bluePositions.forEach(([r, c]) => { cells[r][c] = { count: 1, color: colors.blue }; });
            cells[1][1] = { count: 2, color: colors.red };
        } else if (loopT < 1.8) {
            // Add 3rd red atom
            bluePositions.forEach(([r, c]) => { cells[r][c] = { count: 1, color: colors.blue }; });
            cells[1][1] = { count: 3, color: colors.red };
        } else if (loopT < 2.2) {
            // 4th atom — at critical mass! Jitters violently
            bluePositions.forEach(([r, c]) => { cells[r][c] = { count: 1, color: colors.blue }; });
            cells[1][1] = { count: 4, color: colors.red };

            // Warning text
            const a = 0.5 + 0.5 * Math.sin(loopT * 10);
            ctx.font = 'bold 18px Nunito, sans-serif';
            ctx.fillStyle = `rgba(255, 198, 62, ${a})`;
            ctx.textAlign = 'center';
            ctx.fillText('⚠️ Critical Mass!', w / 2, oy - 15);
            ctx.textAlign = 'start';
        } else if (loopT < 3.0) {
            // EXPLOSION: center empties, atoms fly to blue neighbors
            const prog = (loopT - 2.2) / 0.8;
            const cx1 = ox + 1 * cellSz + cellSz / 2;
            const cy1 = oy + 1 * cellSz + cellSz / 2;

            // Explosion ring from center
            explosions.push({ x: cx1, y: cy1, progress: prog });

            // Blue atoms still visible but about to be converted
            bluePositions.forEach(([r, c]) => {
                // Fade blue as prog increases — being overtaken
                const bx = ox + c * cellSz + cellSz / 2;
                const by = oy + r * cellSz + cellSz / 2;
                ctx.globalAlpha = Math.max(0, 1 - prog);
                drawSphere(ctx, bx, by, 14, colors.blue);
                ctx.globalAlpha = 1;
            });

            // Red projectiles flying outward to neighbors
            bluePositions.forEach(([nr, nc]) => {
                const tx = ox + nc * cellSz + cellSz / 2;
                const ty = oy + nr * cellSz + cellSz / 2;
                const px = cx1 + (tx - cx1) * prog;
                const py = cy1 + (ty - cy1) * prog;
                drawSphere(ctx, px, py, 14, colors.red);
            });

            // BOOM text
            const a = 1 - prog;
            ctx.font = 'bold 22px Nunito, sans-serif';
            ctx.fillStyle = `rgba(242, 92, 92, ${a})`;
            ctx.textAlign = 'center';
            ctx.fillText('💥 BOOM!', w / 2, oy - 15);
            ctx.textAlign = 'start';
        } else if (loopT < 4.5) {
            // Aftermath: all neighbors converted from BLUE → RED
            bluePositions.forEach(([r, c]) => {
                cells[r][c] = { count: 2, color: colors.red }; // 1 existing + 1 from explosion
            });

            // Color transition flash effect
            if (loopT < 3.6) {
                const flash = 0.3 * (1 - (loopT - 3.0) / 0.6);
                bluePositions.forEach(([r, c]) => {
                    const fx = ox + c * cellSz + cellSz / 2;
                    const fy = oy + r * cellSz + cellSz / 2;
                    ctx.beginPath();
                    ctx.arc(fx, fy, 30, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(242, 92, 92, ${flash})`;
                    ctx.fill();
                });
            }

            ctx.font = 'bold 18px Nunito, sans-serif';
            ctx.fillStyle = 'rgba(242, 92, 92, 0.9)';
            ctx.textAlign = 'center';
            ctx.fillText('🔵→🔴 Converted!', w / 2, oy - 15);
            ctx.textAlign = 'start';
        } else {
            // Final state: everything is red now
            bluePositions.forEach(([r, c]) => {
                cells[r][c] = { count: 2, color: colors.red };
            });

            ctx.font = 'bold 18px Nunito, sans-serif';
            ctx.fillStyle = 'rgba(242, 92, 92, 0.8)';
            ctx.textAlign = 'center';
            ctx.fillText('All blue atoms are now red! 🔴', w / 2, oy - 15);
            ctx.textAlign = 'start';
        }

        // Render cells
        for (let r = 0; r < gRows; r++) {
            for (let c = 0; c < gCols; c++) {
                const cell = cells[r][c];
                if (cell.count === 0) continue;
                const cx2 = ox + c * cellSz + cellSz / 2;
                const cy2 = oy + r * cellSz + cellSz / 2;
                const jitter = cell.count >= 4 ? Math.sin(t * 15) * 3 : 0;

                for (let a = 0; a < Math.min(cell.count, 3); a++) {
                    const offx = (a - (Math.min(cell.count, 3) - 1) * 0.5) * 14;
                    drawSphere(ctx, cx2 + offx + jitter, cy2 + jitter, 14, cell.color);
                }
            }
        }

        // Render explosion ring effects
        explosions.forEach(e => {
            ctx.beginPath();
            ctx.arc(e.x, e.y, 50 * e.progress, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(242, 92, 92, ${0.5 * (1 - e.progress)})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        });
    }

    // ── SLIDE 4: Win the game — board domination ──

    function drawSlide4(ctx, t, w, h) {
        const cellSz = 55;
        const gCols = 6, gRows = 5;
        const ox = (w - gCols * cellSz) / 2;
        const oy = (h - gRows * cellSz) / 2 - 20;

        drawMiniGrid(ctx, ox, oy, gRows, gCols, cellSz);

        // Gradually fill the board with red, removing blue
        const totalCells = gCols * gRows;
        const loopDuration = 5;
        const loopT = t % loopDuration;
        const fillProgress = loopT / loopDuration;
        const redCount = Math.floor(fillProgress * totalCells);

        let cellIdx = 0;
        for (let r = 0; r < gRows; r++) {
            for (let c = 0; c < gCols; c++) {
                const cx = ox + c * cellSz + cellSz / 2;
                const cy = oy + r * cellSz + cellSz / 2;

                if (cellIdx < redCount) {
                    // Red atom
                    const scale = 0.8 + 0.2 * Math.sin(t * 2 + cellIdx * 0.5);
                    drawSphere(ctx, cx, cy, 10 * scale, colors.red);
                } else if (cellIdx < redCount + 3 && cellIdx < totalCells) {
                    // Blue atom about to be converted
                    const flicker = 0.4 + 0.6 * Math.abs(Math.sin(t * 6));
                    ctx.globalAlpha = flicker;
                    drawSphere(ctx, cx, cy, 10, colors.blue);
                    ctx.globalAlpha = 1;
                }
                cellIdx++;
            }
        }

        // Victory text
        if (fillProgress > 0.8) {
            const a = Math.min(1, (fillProgress - 0.8) / 0.2);
            ctx.font = 'bold 28px "Lilita One", sans-serif';
            ctx.fillStyle = `rgba(242, 92, 92, ${a})`;
            ctx.textAlign = 'center';
            ctx.fillText('🏆 VICTORY!', w / 2, oy + gRows * cellSz + 50);
            ctx.textAlign = 'start';
        }

        // Score display
        ctx.font = 'bold 18px Nunito, sans-serif';
        ctx.textAlign = 'center';
        const blueLeft = Math.max(0, totalCells - redCount - 3);
        ctx.fillStyle = colors.red;
        ctx.fillText(`🔴 ${redCount}`, w / 2 - 60, oy - 15);
        ctx.fillStyle = colors.blue;
        ctx.fillText(`🔵 ${blueLeft}`, w / 2 + 60, oy - 15);
        ctx.textAlign = 'start';
    }

})();

