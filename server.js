const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '.')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 4173;

// ═══════════════════════════════════════════════════════════
// ROOM STATE MACHINE
// States: 'lobby' → 'playing' → 'finished' → 'lobby' (via rematch)
// ═══════════════════════════════════════════════════════════

const VALID_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const ROWS = 9;
const COLS = 6;

function createGrid() {
    return Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => ({ count: 0, color: null }))
    );
}

function inBounds(row, col) { return row >= 0 && row < ROWS && col >= 0 && col < COLS; }

function criticalMass(row, col) {
    let n = 0;
    if (row > 0) n++; if (row < ROWS - 1) n++;
    if (col > 0) n++; if (col < COLS - 1) n++;
    return n;
}

const rooms = {};
// Room shape:
// {
//   code: string,
//   host: socketId,
//   players: [{ id, name, color, offline }],
//   state: 'lobby' | 'playing' | 'finished',
//   turnIndex: number,
//   turnCount: number,
//   grid: Array,
//   rematchVotes: Set<socketId>,
//   winnerId: socketId | null,
// }

function generateRoomCode() {
    let result = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Ensure unique player names within a room by appending (2), (3) etc.
function ensureUniqueName(room, rawName) {
    const existing = room.players.map(p => p.name);
    if (!existing.includes(rawName)) return rawName;

    let counter = 2;
    while (existing.includes(`${rawName}(${counter})`)) {
        counter++;
    }
    return `${rawName}(${counter})`;
}

// Find which room a socket belongs to
function findRoomBySocket(socketId) {
    for (const code in rooms) {
        if (rooms[code].players.some(p => p.id === socketId)) {
            return rooms[code];
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════
// AI ENGINE FOR SOLO MODE
// ═══════════════════════════════════════════════════════════

/**
 * Get all valid moves for a player
 * @param {Array} grid - The game grid
 * @param {string} color - The player's color
 * @returns {Array} - Array of {row, col} coordinates
 */
function getValidMoves(grid, color) {
    const moves = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            // Valid if empty or owned by this player
            if (cell.count === 0 || cell.color === color) {
                moves.push({ row: r, col: c });
            }
        }
    }
    return moves;
}

/**
 * Schedule an AI move with appropriate delay
 * @param {string} roomCode - The room code
 */
function scheduleAIMove(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.state !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer || !currentPlayer.isAI) return;

    // Calculate delay based on difficulty
    const delays = {
        easy: { min: 800, max: 1200 },
        medium: { min: 600, max: 1000 },
        hard: { min: 400, max: 800 }
    };

    const delay = delays[room.difficulty];
    const waitTime = delay.min + Math.random() * (delay.max - delay.min);

    setTimeout(() => {
        executeAIMove(roomCode);
    }, waitTime);
}

/**
 * Execute the AI move
 * @param {string} roomCode - The room code
 */
function executeAIMove(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.state !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer || !currentPlayer.isAI) return;

    // Sub-task 13.2: Wrap AI move calculation in try-catch
    try {
        const move = calculateAIMove(room);
        if (!move) {
            // No valid moves - end game
            room.state = 'finished';
            const humanPlayer = room.players.find(p => !p.isAI);
            room.winnerId = humanPlayer.id;
            io.to(roomCode).emit('matchEnded', {
                winnerId: humanPlayer.id,
                winnerName: humanPlayer.name,
                winnerColor: humanPlayer.color,
                reason: 'AI has no valid moves.'
            });
            return;
        }

        // Execute the move using existing game logic
        const events = processTurn(room, move.row, move.col, currentPlayer.color);

        io.to(roomCode).emit('gameStateUpdate', {
            events,
            grid: room.grid,
            turnIndex: room.turnIndex,
            turnCount: room.turnCount,
            winnerId: room.winnerId
        });

        if (room.state === 'finished') {
            const winnerPlayer = room.players.find(p => p.id === room.winnerId);
            io.to(roomCode).emit('matchEnded', {
                winnerId: room.winnerId,
                winnerName: winnerPlayer ? winnerPlayer.name : 'Unknown',
                winnerColor: winnerPlayer ? winnerPlayer.color : 'blue'
            });
        } else if (room.players[room.turnIndex].isAI) {
            // AI has another turn (rare but possible)
            scheduleAIMove(roomCode);
        }
    } catch (error) {
        // Sub-task 13.2: Handle AI calculation errors gracefully
        console.error(`AI error in room ${roomCode}:`, error);
        console.error('Error stack:', error.stack);
        console.error('Room state:', JSON.stringify({
            code: room.code,
            difficulty: room.difficulty,
            turnIndex: room.turnIndex,
            playersCount: room.players.length,
            aiPlayer: room.players.find(p => p.isAI)
        }));
        
        // End game with human player as winner
        room.state = 'finished';
        const humanPlayer = room.players.find(p => !p.isAI);
        room.winnerId = humanPlayer.id;
        
        io.to(roomCode).emit('matchEnded', {
            winnerId: humanPlayer.id,
            winnerName: humanPlayer.name,
            winnerColor: humanPlayer.color,
            reason: 'AI encountered an error.'
        });
    }
}

/**
 * Calculate the best move for the AI opponent
 * @param {Object} room - The game room state
 * @returns {Object} - {row, col} coordinates of the selected move
 */
function calculateAIMove(room) {
    const aiPlayer = room.players.find(p => p.isAI);
    
    if (!aiPlayer) {
        console.error(`No AI player found in room ${room.code}`);
        return null;
    }
    
    const validMoves = getValidMoves(room.grid, aiPlayer.color);

    if (validMoves.length === 0) {
        console.error(`No valid moves for AI in room ${room.code}`);
        return null;
    }

    switch (room.difficulty) {
        case 'easy':
            return calculateEasyMove(validMoves);
        case 'medium':
            return calculateMediumMove(room, validMoves, aiPlayer.color);
        case 'hard':
            return calculateHardMove(room, validMoves, aiPlayer.color);
        default:
            return calculateEasyMove(validMoves);
    }
}

/**
 * Easy AI: Random move selection
 * @param {Array} validMoves - Array of {row, col} valid moves
 * @returns {Object} - {row, col} selected move
 */
function calculateEasyMove(validMoves) {
    const randomIndex = Math.floor(Math.random() * validMoves.length);
    return validMoves[randomIndex];
}

/**
 * Medium AI: Tactical scoring
 * @param {Object} room - The game room state
 * @param {Array} validMoves - Array of {row, col} valid moves
 * @param {string} aiColor - The AI's color
 * @returns {Object} - {row, col} selected move
 */
function calculateMediumMove(room, validMoves, aiColor) {
    const scores = validMoves.map(move => {
        let score = 0;
        const cell = room.grid[move.row][move.col];

        // 1. Prioritize critical cells owned by AI (about to explode)
        if (cell.color === aiColor && cell.count + 1 >= criticalMass(move.row, move.col)) {
            score += 100;
        }

        // 2. Reward moves adjacent to opponent cells (potential captures)
        const neighbors = [
            [move.row - 1, move.col],
            [move.row + 1, move.col],
            [move.row, move.col - 1],
            [move.row, move.col + 1]
        ];

        let adjacentOpponentCount = 0;
        for (const [nr, nc] of neighbors) {
            if (inBounds(nr, nc)) {
                const neighborCell = room.grid[nr][nc];
                if (neighborCell.count > 0 && neighborCell.color !== aiColor) {
                    adjacentOpponentCount++;
                }
            }
        }
        score += adjacentOpponentCount * 30;

        // 3. Prefer building up existing cells over empty cells
        if (cell.count > 0 && cell.color === aiColor) {
            score += 20;
        }

        // 4. Slight preference for center cells (more strategic)
        const centerDistance = Math.abs(move.row - ROWS / 2) + Math.abs(move.col - COLS / 2);
        score += (10 - centerDistance);

        return { move, score };
    });

    // Find maximum score
    const maxScore = Math.max(...scores.map(s => s.score));
    const bestMoves = scores.filter(s => s.score === maxScore);

    // Random selection among tied best moves
    const selected = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    return selected.move;
}

/**
 * Hard AI: Strategic with chain prediction
 * @param {Object} room - The game room state
 * @param {Array} validMoves - Array of {row, col} valid moves
 * @param {string} aiColor - The AI's color
 * @returns {Object} - {row, col} selected move
 */
function calculateHardMove(room, validMoves, aiColor) {
    const scores = validMoves.map(move => {
        let score = 0;

        // 1. Simulate the move to calculate chain potential
        const simulatedGrid = deepCloneGrid(room.grid);
        const chainResult = simulateMove(simulatedGrid, move.row, move.col, aiColor);

        // Offensive scoring: reward moves that capture many opponent cells
        if (chainResult.capturedCells >= 3) {
            score += 200;
        } else if (chainResult.capturedCells > 0) {
            score += chainResult.capturedCells * 50;
        }

        // 2. Defensive scoring: block opponent critical cells
        const opponentThreats = findOpponentThreats(room.grid, aiColor);
        for (const threat of opponentThreats) {
            const distance = Math.abs(move.row - threat.row) + Math.abs(move.col - threat.col);
            if (distance === 1) {
                score += 80;
            }
        }

        // 3. Build up critical cells
        const cell = room.grid[move.row][move.col];
        if (cell.color === aiColor && cell.count + 1 >= criticalMass(move.row, move.col)) {
            score += 60;
        }

        // 4. Control key positions
        const isCorner = (move.row === 0 || move.row === ROWS - 1) &&
                        (move.col === 0 || move.col === COLS - 1);
        const isEdge = move.row === 0 || move.row === ROWS - 1 ||
                      move.col === 0 || move.col === COLS - 1;

        if (isCorner) score += 15;
        else if (isEdge) score += 10;
        else score += 5;

        // 5. Penalize moves that leave opponent with easy captures
        const vulnerabilityPenalty = calculateVulnerability(chainResult.finalGrid, aiColor);
        score -= vulnerabilityPenalty * 10;

        return { move, score };
    });

    // Find maximum score
    const maxScore = Math.max(...scores.map(s => s.score));
    const bestMoves = scores.filter(s => s.score === maxScore);

    // Random selection among tied best moves
    const selected = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    return selected.move;
}

/**
 * Simulate a move and calculate chain reaction results
 * @param {Array} grid - Cloned grid to simulate on
 * @param {number} row - Move row
 * @param {number} col - Move column
 * @param {string} color - Player color
 * @returns {Object} - {capturedCells: number, finalGrid: Array}
 */
function simulateMove(grid, row, col, color) {
    let capturedCells = 0;

    // Place initial atom
    grid[row][col].color = color;
    grid[row][col].count += 1;

    // Simulate explosions
    let safety = 0;
    while (safety < 100) {
        safety++;

        const explodingCells = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].count >= criticalMass(r, c)) {
                    explodingCells.push({ r, c, color: grid[r][c].color });
                }
            }
        }

        if (explodingCells.length === 0) break;

        // Process explosions
        for (const { r, c, color: expColor } of explodingCells) {
            grid[r][c].count = 0;
            grid[r][c].color = null;

            const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            for (const [nr, nc] of neighbors) {
                if (inBounds(nr, nc)) {
                    // Count captures (color conversions)
                    if (grid[nr][nc].count > 0 && grid[nr][nc].color !== expColor) {
                        capturedCells++;
                    }
                    grid[nr][nc].color = expColor;
                    grid[nr][nc].count += 1;
                }
            }
        }
    }

    return { capturedCells, finalGrid: grid };
}

/**
 * Find opponent cells that are one move away from critical mass
 * @param {Array} grid - The game grid
 * @param {string} aiColor - The AI's color
 * @returns {Array} - Array of {row, col} threat positions
 */
function findOpponentThreats(grid, aiColor) {
    const threats = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (cell.count > 0 && cell.color !== aiColor) {
                if (cell.count + 1 >= criticalMass(r, c)) {
                    threats.push({ row: r, col: c });
                }
            }
        }
    }
    return threats;
}

/**
 * Calculate vulnerability score (how many AI cells are at risk)
 * @param {Array} grid - The game grid
 * @param {string} aiColor - The AI's color
 * @returns {number} - Vulnerability score
 */
function calculateVulnerability(grid, aiColor) {
    let vulnerability = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (cell.count > 0 && cell.color === aiColor) {
                const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                for (const [nr, nc] of neighbors) {
                    if (inBounds(nr, nc)) {
                        const neighbor = grid[nr][nc];
                        if (neighbor.count > 0 && neighbor.color !== aiColor &&
                            neighbor.count + 1 >= criticalMass(nr, nc)) {
                            vulnerability++;
                        }
                    }
                }
            }
        }
    }
    return vulnerability;
}

/**
 * Deep clone the grid for simulation
 * @param {Array} grid - The game grid
 * @returns {Array} - Cloned grid
 */
function deepCloneGrid(grid) {
    return grid.map(row => row.map(cell => ({ ...cell })));
}

// ═══════════════════════════════════════════════════════════
// GAME LOGIC HELPERS (used by both AI and socket handlers)
// ═══════════════════════════════════════════════════════════

function getAtomCounts(room) {
    const counts = {};
    room.players.forEach(p => counts[p.color] = 0);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = room.grid[r][c];
            if (cell.count > 0 && counts[cell.color] !== undefined) {
                counts[cell.color] += cell.count;
            }
        }
    }
    return counts;
}

function findNextPlayerIndex(room, counts) {
    let nextIndex = room.turnIndex;
    for (let step = 0; step < room.players.length; step++) {
        nextIndex = (nextIndex + 1) % room.players.length;
        const player = room.players[nextIndex];
        if (player.offline) continue;
        if (room.turnCount < room.players.length || counts[player.color] > 0) {
            return nextIndex;
        }
    }
    return room.turnIndex;
}

function processTurn(room, row, col, playerColor) {
    const events = [];

    // 1. Initial placement
    room.grid[row][col].color = playerColor;
    room.grid[row][col].count += 1;
    events.push({ type: 'place', row, col, color: playerColor });

    // 2. Resolve explosions
    let safety = 0;
    while (safety < 1000) {
        safety++;

        // Find all cells that need to explode in this wave
        const explodingCells = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (room.grid[r][c].count >= criticalMass(r, c)) {
                    explodingCells.push({ r, c, color: room.grid[r][c].color });
                }
            }
        }

        if (explodingCells.length === 0) break; // Chain reaction finished

        const waveEvent = { type: 'explodeWave', explosions: [] };
        const flyingAtoms = [];

        // Clear exploding cells and generate flying atoms
        for (const { r, c, color } of explodingCells) {
            room.grid[r][c].count = 0;
            room.grid[r][c].color = null;
            waveEvent.explosions.push({ row: r, col: c, color });

            const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            for (const [nr, nc] of neighbors) {
                if (inBounds(nr, nc)) {
                    flyingAtoms.push({ r: nr, c: nc, color });
                }
            }
        }
        events.push(waveEvent);

        // Land flying atoms
        for (const { r, c, color } of flyingAtoms) {
            room.grid[r][c].color = color;
            room.grid[r][c].count += 1;
        }
    }

    // Turn completely finalized
    room.turnCount++;

    const counts = getAtomCounts(room);
    if (room.turnCount >= room.players.length) {
        const survivors = room.players.filter(p => !p.offline && counts[p.color] > 0);
        if (survivors.length === 1) {
            room.state = 'finished';
            room.winnerId = survivors[0].id;
        } else if (survivors.length === 0) {
            // Draw
            room.state = 'finished';
            room.winnerId = 'draw';
        }
    }

    if (room.state !== 'finished') {
        room.turnIndex = findNextPlayerIndex(room, counts);
    }

    return events;
}

io.on('connection', (socket) => {

    // ─── CREATE SOLO MATCH ───
    socket.on('createSoloMatch', ({ name, color, difficulty }) => {
        // Sub-task 13.1: Validate inputs
        const trimmedName = (name || '').trim();
        if (!trimmedName || trimmedName.length < 1) {
            socket.emit('errorMsg', 'Please enter a player name.');
            return;
        }
        if (trimmedName.length > 12) {
            socket.emit('errorMsg', 'Name must be 12 characters or less.');
            return;
        }

        if (!VALID_COLORS.includes(color)) {
            socket.emit('errorMsg', 'Invalid color selection.');
            return;
        }

        if (!['easy', 'medium', 'hard'].includes(difficulty)) {
            socket.emit('errorMsg', 'Invalid difficulty level.');
            return;
        }

        // Generate unique room code with "SOLO-" prefix
        let code = 'SOLO-' + generateRoomCode();
        while (rooms[code]) {
            code = 'SOLO-' + generateRoomCode();
        }

        // Sub-task 3.2: Assign AI color (prefer blue, fallback to red if player chose blue)
        const aiColor = color === 'blue' ? 'red' : 'blue';

        // Create solo room with AI opponent
        const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
        rooms[code] = {
            code,
            host: socket.id,
            players: [
                { id: socket.id, name: trimmedName, color, offline: false },
                { id: 'AI', name: `AI (${difficultyLabel})`, color: aiColor, offline: false, isAI: true }
            ],
            state: 'playing', // Start immediately (no lobby wait)
            solo: true,
            difficulty,
            turnIndex: 0,
            turnCount: 0,
            grid: createGrid(),
            rematchVotes: new Set(),
            winnerId: null,
        };

        socket.join(code);

        // Sub-task 3.3: Emit matchStarted event
        io.to(code).emit('matchStarted', {
            players: rooms[code].players,
            turnIndex: 0,
            solo: rooms[code].solo || false,
            code
        });

        // If AI goes first (players[0].isAI), trigger AI move
        if (rooms[code].players[0].isAI) {
            scheduleAIMove(code);
        }
    });

    // ─── HOST MATCH ───
    socket.on('hostMatch', ({ name, color }) => {
        // Validate name
        const trimmedName = (name || '').trim();
        if (!trimmedName || trimmedName.length < 1) {
            socket.emit('errorMsg', 'Please enter a player name.');
            return;
        }
        if (trimmedName.length > 12) {
            socket.emit('errorMsg', 'Name must be 12 characters or less.');
            return;
        }

        // Validate color
        if (!VALID_COLORS.includes(color)) {
            socket.emit('errorMsg', 'Invalid color selection.');
            return;
        }

        // Prevent player from being in multiple rooms
        const existingRoom = findRoomBySocket(socket.id);
        if (existingRoom) {
            socket.emit('errorMsg', 'You are already in a room. Refresh to leave.');
            return;
        }

        let code = generateRoomCode();
        while (rooms[code]) {
            code = generateRoomCode();
        }

        rooms[code] = {
            code,
            host: socket.id,
            players: [{ id: socket.id, name: trimmedName, color, offline: false }],
            state: 'lobby',
            turnIndex: 0,
            turnCount: 0,
            grid: createGrid(),
            rematchVotes: new Set(),
            winnerId: null,
        };

        socket.join(code);
        socket.emit('roomCreated', code);
        io.to(code).emit('lobbyUpdate', rooms[code].players);
    });

    // ─── JOIN MATCH ───
    socket.on('joinMatch', ({ code, name, color }) => {
        // Validate name
        const trimmedName = (name || '').trim();
        if (!trimmedName || trimmedName.length < 1) {
            socket.emit('errorMsg', 'Please enter a player name.');
            return;
        }
        if (trimmedName.length > 12) {
            socket.emit('errorMsg', 'Name must be 12 characters or less.');
            return;
        }

        // Validate color
        if (!VALID_COLORS.includes(color)) {
            socket.emit('errorMsg', 'Invalid color selection.');
            return;
        }

        const room = rooms[code];
        if (!room) {
            socket.emit('errorMsg', 'Room not found.');
            return;
        }

        // Prevent joining solo rooms
        if (room.solo) {
            socket.emit('errorMsg', 'Cannot join solo practice games.');
            return;
        }

        if (room.state !== 'lobby') {
            socket.emit('errorMsg', 'Match already in progress.');
            return;
        }
        if (room.players.length >= 6) {
            socket.emit('errorMsg', 'Room is full (max 6 players).');
            return;
        }

        // Check color conflict
        if (room.players.find(p => p.color === color)) {
            const takenColors = room.players.map(p => p.color);
            const availableColors = VALID_COLORS.filter(c => !takenColors.includes(c));
            const availableList = availableColors.length > 0
                ? availableColors.join(', ')
                : 'none';
            socket.emit('errorMsg', `Color "${color}" is already taken. Available: ${availableList}`);
            return;
        }

        // Prevent player from being in multiple rooms
        const existingRoom = findRoomBySocket(socket.id);
        if (existingRoom) {
            socket.emit('errorMsg', 'You are already in a room. Refresh to leave.');
            return;
        }

        // Ensure unique name
        const uniqueName = ensureUniqueName(room, trimmedName);

        room.players.push({ id: socket.id, name: uniqueName, color, offline: false });
        socket.join(code);
        socket.emit('roomJoined', { code, assignedName: uniqueName });
        io.to(code).emit('lobbyUpdate', room.players);
    });

    // ─── START MATCH ───
    socket.on('startMatch', (code) => {
        const room = rooms[code];
        if (!room) return;

        // Only host can start
        if (room.host !== socket.id) {
            socket.emit('errorMsg', 'Only the host can start the match.');
            return;
        }

        // Must be in lobby state
        if (room.state !== 'lobby') {
            socket.emit('errorMsg', 'Cannot start: game is not in lobby state.');
            return;
        }

        // Need at least 2 players
        if (room.players.length < 2) {
            socket.emit('errorMsg', 'Need at least 2 players to start.');
            return;
        }

        room.state = 'playing';
        room.turnIndex = 0;
        room.turnCount = 0;
        room.grid = createGrid();
        room.rematchVotes = new Set();
        room.winnerId = null;

        io.to(code).emit('matchStarted', {
            players: room.players,
            turnIndex: room.turnIndex,
            solo: room.solo || false,
            code
        });
    });

    // ─── PLACE ATOM ───
    socket.on('placeAtom', ({ code, row, col }) => {
        const room = rooms[code];
        if (!room) return;

        // Must be in playing state
        if (room.state !== 'playing') return;

        // Validate it's this player's turn
        const currentPlayer = room.players[room.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            // Not your turn — send sync correction with empty events
            socket.emit('gameStateUpdate', { 
                events: [],
                turnIndex: room.turnIndex, 
                grid: room.grid,
                turnCount: room.turnCount
            });
            return;
        }

        // Validate safe bounds and empty/owned cell
        if (!inBounds(row, col)) return;
        const cell = room.grid[row][col];
        if (cell.count > 0 && cell.color !== currentPlayer.color) return;

        // Execute server-authoritative turn logic
        const events = processTurn(room, row, col, currentPlayer.color);

        // Forward the validated move to all clients
        io.to(code).emit('gameStateUpdate', {
            events,
            grid: room.grid,
            turnIndex: room.turnIndex,
            turnCount: room.turnCount,
            winnerId: room.winnerId
        });

        // If game ended this turn, send matchEnded
        if (room.state === 'finished') {
            const winnerPlayer = room.players.find(p => p.id === room.winnerId);
            io.to(code).emit('matchEnded', {
                winnerId: room.winnerId,
                winnerName: winnerPlayer ? winnerPlayer.name : (room.winnerId === 'draw' ? 'Nobody' : 'Unknown'),
                winnerColor: winnerPlayer ? winnerPlayer.color : 'blue'
            });
        } else if (room.solo && room.players[room.turnIndex].isAI) {
            // Trigger AI move if it's AI's turn in solo mode
            scheduleAIMove(code);
        }
    });

    // ─── REMATCH MECHANICS ───

    // ─── REMATCH VOTE ───
    socket.on('rematchVote', (code) => {
        const room = rooms[code];
        if (!room) return;
        if (room.state !== 'finished') return;

        // Must be an active (non-offline) player in this room
        const player = room.players.find(p => p.id === socket.id && !p.offline);
        if (!player) return;

        room.rematchVotes.add(socket.id);

        // Count active players (non-offline)
        const activePlayers = room.players.filter(p => !p.offline);
        const totalVotesNeeded = activePlayers.length;
        const currentVotes = room.rematchVotes.size;

        // Notify everyone about the vote count
        io.to(code).emit('rematchVoteUpdate', {
            votedCount: currentVotes,
            totalNeeded: totalVotesNeeded,
            voterName: player.name,
            voterId: socket.id,
        });

        // If all active players voted, restart
        if (currentVotes >= totalVotesNeeded) {
            room.state = 'lobby';
            room.turnIndex = 0;
            room.turnCount = 0;
            room.grid = createGrid();
            room.rematchVotes = new Set();
            room.winnerId = null;

            io.to(code).emit('rematchStarted');
            io.to(code).emit('lobbyUpdate', room.players);
        }
    });

    // ─── LEAVE GAME (explicit exit from game-over screen) ───
    socket.on('leaveGame', (code) => {
        const room = rooms[code];
        if (!room) return;

        const pIndex = room.players.findIndex(p => p.id === socket.id);
        if (pIndex === -1) return;

        const leavingPlayer = room.players[pIndex];

        // Remove from room
        room.players.splice(pIndex, 1);
        socket.leave(code);

        // Remove their rematch vote if any
        room.rematchVotes.delete(socket.id);

        // Notify remaining players
        io.to(code).emit('playerLeftGame', {
            name: leavingPlayer.name,
            color: leavingPlayer.color,
        });

        if (room.players.length === 0) {
            delete rooms[code];
        } else {
            // Reassign host if needed
            if (room.host === socket.id) {
                room.host = room.players[0].id;
            }

            // If in finished state, check if remaining players all voted
            if (room.state === 'finished') {
                const activePlayers = room.players.filter(p => !p.offline);
                if (room.rematchVotes.size >= activePlayers.length && activePlayers.length >= 2) {
                    room.state = 'lobby';
                    room.turnIndex = 0;
                    room.turnCount = 0;
                    room.grid = createGrid();
                    room.rematchVotes = new Set();
                    room.winnerId = null;

                    io.to(code).emit('rematchStarted');
                    io.to(code).emit('lobbyUpdate', room.players);
                } else {
                    // Update lobby with remaining players
                    io.to(code).emit('lobbyUpdate', room.players);
                }
            } else {
                io.to(code).emit('lobbyUpdate', room.players);
            }
        }
    });

    // ─── DISCONNECT ───
    socket.on('disconnect', () => {
        for (const code in rooms) {
            const room = rooms[code];
            const pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex === -1) continue;

            const disconnectedPlayer = room.players[pIndex];

            // Immediately delete solo rooms on disconnect
            if (room.solo) {
                delete rooms[code];
                break;
            }

            if (room.state === 'lobby') {
                // Remove player from lobby
                room.players.splice(pIndex, 1);

                if (room.players.length === 0) {
                    delete rooms[code];
                } else {
                    if (room.host === socket.id) {
                        room.host = room.players[0].id;
                    }
                    io.to(code).emit('lobbyUpdate', room.players);
                    io.to(code).emit('playerLeftGame', {
                        name: disconnectedPlayer.name,
                        color: disconnectedPlayer.color,
                    });
                }

            } else if (room.state === 'playing') {
                // Mark as offline during active game
                room.players[pIndex].offline = true;

                io.to(code).emit('playerDisconnected', {
                    name: disconnectedPlayer.name,
                    color: disconnectedPlayer.color,
                    playerId: disconnectedPlayer.id,
                });

                // If disconnected player was current turn holder, advance turn
                if (room.players[room.turnIndex].id === disconnectedPlayer.id) {
                    const counts = getAtomCounts(room);
                    room.turnIndex = findNextPlayerIndex(room, counts);
                    io.to(code).emit('gameStateUpdate', {
                        events: [],
                        grid: room.grid,
                        turnIndex: room.turnIndex,
                        turnCount: room.turnCount
                    });
                }

                // Check if only 1 active player remains → auto-win
                const activePlayers = room.players.filter(p => !p.offline);
                if (activePlayers.length === 1) {
                    room.state = 'finished';
                    room.winnerId = activePlayers[0].id;
                    room.rematchVotes = new Set();

                    io.to(code).emit('matchEnded', {
                        winnerId: activePlayers[0].id,
                        winnerName: activePlayers[0].name,
                        winnerColor: activePlayers[0].color,
                        reason: 'All other players disconnected.'
                    });
                }

            } else if (room.state === 'finished') {
                // Remove from room and rematch votes
                room.players.splice(pIndex, 1);
                room.rematchVotes.delete(socket.id);

                if (room.players.length === 0) {
                    delete rooms[code];
                } else {
                    if (room.host === socket.id) {
                        room.host = room.players[0].id;
                    }

                    io.to(code).emit('playerLeftGame', {
                        name: disconnectedPlayer.name,
                        color: disconnectedPlayer.color,
                    });

                    // Check if remaining all voted
                    const activePlayers = room.players.filter(p => !p.offline);
                    if (room.rematchVotes.size >= activePlayers.length && activePlayers.length >= 2) {
                        room.state = 'lobby';
                        room.turnIndex = 0;
                        room.turnCount = 0;
                        room.grid = createGrid();
                        room.rematchVotes = new Set();
                        room.winnerId = null;

                        io.to(code).emit('rematchStarted');
                        io.to(code).emit('lobbyUpdate', room.players);
                    }
                }
            }

            break; // A player can only be in one room
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chain Reaction server running at http://0.0.0.0:${PORT}`);
});
