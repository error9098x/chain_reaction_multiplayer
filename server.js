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

io.on('connection', (socket) => {

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
            turnIndex: room.turnIndex
        });
    });

    // ─── GAME LOGIC HELPERS ───
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
