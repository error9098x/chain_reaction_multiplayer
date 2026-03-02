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

const rooms = {};
// Room shape:
// {
//   code: string,
//   host: socketId,
//   players: [{ id, name, color, offline }],
//   state: 'lobby' | 'playing' | 'finished',
//   turnIndex: number,
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
        room.rematchVotes = new Set();
        room.winnerId = null;

        io.to(code).emit('matchStarted', {
            players: room.players,
            turnIndex: room.turnIndex
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
            // Not your turn — silently ignore (could be latency)
            return;
        }

        // Forward the validated move to all clients
        io.to(code).emit('atomPlaced', {
            row, col,
            playerIndex: room.turnIndex
        });
    });

    // ─── SYNC TURN (from host after explosions resolve) ───
    socket.on('syncTurn', ({ code, newTurnIndex }) => {
        const room = rooms[code];
        if (!room) return;
        if (room.state !== 'playing') return;

        // Only host can sync turn
        if (room.host !== socket.id) return;

        room.turnIndex = newTurnIndex;
    });

    // ─── GAME OVER (host reports winner) ───
    socket.on('gameOver', ({ code, winnerId }) => {
        const room = rooms[code];
        if (!room) return;
        if (room.state !== 'playing') return;
        if (room.host !== socket.id) return;

        room.state = 'finished';
        room.winnerId = winnerId;
        room.rematchVotes = new Set();

        const winnerPlayer = room.players.find(p => p.id === winnerId);
        const winnerName = winnerPlayer ? winnerPlayer.name : 'Unknown';

        // Notify ALL players about the winner simultaneously
        io.to(code).emit('matchEnded', {
            winnerId,
            winnerName,
            winnerColor: winnerPlayer ? winnerPlayer.color : 'blue'
        });
    });

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
