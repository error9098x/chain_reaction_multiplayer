(() => {
    const canvas = document.getElementById('chain-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const logicalWidth = 720;
    const logicalHeight = 480;
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;

    const COLS = 10;
    const ROWS = 8;
    const cellPadding = 2;
    const explosionDurationMs = 180;

    const playerRoster = [
        { id: 'red', name: 'Crimson', color: '#ff4d4f' },
        { id: 'yellow', name: 'Amber', color: '#fadb14' },
        { id: 'green', name: 'Verdant', color: '#52c41a' },
        { id: 'blue', name: 'Cobalt', color: '#1890ff' },
        { id: 'pink', name: 'Magenta', color: '#eb2f96' },
        { id: 'cyan', name: 'Cyan', color: '#13c2c2' }
    ];

    const colors = Object.fromEntries(playerRoster.map((player) => [player.id, player.color]));

    const mainMenu = document.getElementById('main-menu');
    const gameScreen = document.getElementById('game-screen');
    const playerCountSelect = document.getElementById('player-count');
    const startingPlayerSelect = document.getElementById('starting-player');
    const startGameBtn = document.getElementById('start-game-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const menuBtn = document.getElementById('menu-btn');
    const turnPlayerName = document.getElementById('turn-player-name');
    const statusLine = document.getElementById('status-line');

    const cellWidth = Math.floor(logicalWidth / COLS);
    const cellHeight = Math.floor(logicalHeight / ROWS);

    let enabledPlayers = playerRoster.slice(0, 2);
    let currentPlayerIndex = 0;
    let grid = createGrid();
    let projectiles = [];
    let animationFrame = 0;
    let turnCount = 0;
    let pendingTurnAdvance = false;
    let winner = null;
    let gameActive = false;
    let playerHasMoved = {};
    let audioContext;

    function createGrid() {
        return Array.from({ length: ROWS }, () =>
            Array.from({ length: COLS }, () => ({ count: 0, color: null }))
        );
    }

    function initAudio() {
        if (audioContext) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.log('Web Audio API not supported');
        }
    }

    function playAtomSound() {
        if (!audioContext) return;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(780, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(420, audioContext.currentTime + 0.09);
        gainNode.gain.setValueAtTime(0.22, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.09);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.09);
    }

    function playExplosionSound() {
        if (!audioContext) return;

        const bufferSize = audioContext.sampleRate * 0.28;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i += 1) {
            data[i] = (Math.random() * 2 - 1) * 0.26;
        }

        const noise = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const gainNode = audioContext.createGain();

        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1900, audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(130, audioContext.currentTime + 0.28);

        gainNode.gain.setValueAtTime(0.32, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.28);

        noise.start(audioContext.currentTime);
        noise.stop(audioContext.currentTime + 0.28);
    }

    function inBounds(row, col) {
        return row >= 0 && row < ROWS && col >= 0 && col < COLS;
    }

    function criticalMass(row, col) {
        let neighbors = 0;
        if (row > 0) neighbors += 1;
        if (row < ROWS - 1) neighbors += 1;
        if (col > 0) neighbors += 1;
        if (col < COLS - 1) neighbors += 1;
        return neighbors;
    }

    function cellCenter(row, col) {
        return {
            x: col * cellWidth + cellWidth / 2,
            y: row * cellHeight + cellHeight / 2
        };
    }

    function explodeAt(row, col, color) {
        playExplosionSound();

        const { x: sx, y: sy } = cellCenter(row, col);
        grid[row][col].count = 0;
        grid[row][col].color = null;

        const neighbors = [
            [row - 1, col],
            [row + 1, col],
            [row, col - 1],
            [row, col + 1]
        ];

        const startTime = performance.now();

        for (const [neighborRow, neighborCol] of neighbors) {
            if (!inBounds(neighborRow, neighborCol)) continue;
            const { x: ex, y: ey } = cellCenter(neighborRow, neighborCol);
            projectiles.push({
                sx,
                sy,
                ex,
                ey,
                start: startTime,
                dur: explosionDurationMs,
                targetRow: neighborRow,
                targetCol: neighborCol,
                color,
                applied: false,
                done: false
            });
        }
    }

    function addAtomAt(row, col, color, sourceIsExplosion = false) {
        if (!inBounds(row, col)) return false;

        const cell = grid[row][col];

        if (!sourceIsExplosion && cell.count > 0 && cell.color !== color) {
            return false;
        }

        if (!sourceIsExplosion) {
            playAtomSound();
        }

        if (cell.count === 0) {
            cell.color = color;
        } else if (sourceIsExplosion) {
            cell.color = color;
        }

        cell.count += 1;

        if (cell.count >= criticalMass(row, col)) {
            explodeAt(row, col, color);
        }

        return true;
    }

    function atomCounts() {
        const counts = Object.fromEntries(enabledPlayers.map((player) => [player.id, 0]));

        for (let row = 0; row < ROWS; row += 1) {
            for (let col = 0; col < COLS; col += 1) {
                const cell = grid[row][col];
                if (cell.count > 0 && counts[cell.color] !== undefined) {
                    counts[cell.color] += cell.count;
                }
            }
        }

        return counts;
    }

    function currentPlayer() {
        return enabledPlayers[currentPlayerIndex];
    }

    function setStatus(message) {
        if (statusLine) {
            statusLine.textContent = message;
        }
    }

    function setActiveColor(hexColor) {
        const activeSoft = hexToRgba(hexColor, 0.35);
        document.documentElement.style.setProperty('--active-color', hexColor);
        document.documentElement.style.setProperty('--active-color-soft', activeSoft);
    }

    function updateTurnUi() {
        if (!gameActive) return;

        if (winner) {
            turnPlayerName.textContent = `${winner.name} Wins`;
            setActiveColor(winner.color);
            return;
        }

        const player = currentPlayer();
        turnPlayerName.textContent = player.name;
        setActiveColor(player.color);
    }

    function findNextPlayerIndex(counts) {
        let nextIndex = currentPlayerIndex;

        for (let step = 0; step < enabledPlayers.length; step += 1) {
            nextIndex = (nextIndex + 1) % enabledPlayers.length;

            if (turnCount < enabledPlayers.length) {
                return nextIndex;
            }

            const candidate = enabledPlayers[nextIndex];
            if (counts[candidate.id] > 0) {
                return nextIndex;
            }
        }

        return currentPlayerIndex;
    }

    function finalizeTurnIfReady() {
        if (!pendingTurnAdvance || projectiles.length > 0 || !gameActive) return;

        pendingTurnAdvance = false;

        const counts = atomCounts();

        if (turnCount >= enabledPlayers.length) {
            const survivors = enabledPlayers.filter((player) => counts[player.id] > 0);
            if (survivors.length === 1) {
                winner = survivors[0];
                updateTurnUi();
                setStatus(`${winner.name} controls the board.`);
                return;
            }
        }

        currentPlayerIndex = findNextPlayerIndex(counts);
        updateTurnUi();
        setStatus(`${currentPlayer().name} to move.`);
    }

    function canvasToCell(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        return {
            row: Math.floor(y / cellHeight),
            col: Math.floor(x / cellWidth)
        };
    }

    function refreshStartingPlayerOptions() {
        const selectedPlayers = Number(playerCountSelect.value);
        const previousSelection = Number(startingPlayerSelect.value || 0);

        startingPlayerSelect.innerHTML = '';

        for (let index = 0; index < selectedPlayers; index += 1) {
            const player = playerRoster[index];
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = player.name;
            startingPlayerSelect.appendChild(option);
        }

        if (previousSelection < selectedPlayers) {
            startingPlayerSelect.value = String(previousSelection);
        }
    }

    function startMatch() {
        const selectedPlayers = Number(playerCountSelect.value);
        enabledPlayers = playerRoster.slice(0, selectedPlayers);
        refreshStartingPlayerOptions();

        const selectedStarter = Number(startingPlayerSelect.value || 0);

        grid = createGrid();
        projectiles = [];
        winner = null;
        pendingTurnAdvance = false;
        turnCount = 0;
        playerHasMoved = Object.fromEntries(enabledPlayers.map((player) => [player.id, false]));

        currentPlayerIndex = Math.min(selectedStarter, enabledPlayers.length - 1);
        gameActive = true;

        mainMenu.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        gameScreen.setAttribute('aria-hidden', 'false');

        updateTurnUi();
        setStatus(`${currentPlayer().name} starts the match.`);
    }

    function returnToMenu() {
        gameActive = false;
        winner = null;
        pendingTurnAdvance = false;
        projectiles = [];

        gameScreen.classList.add('hidden');
        gameScreen.setAttribute('aria-hidden', 'true');
        mainMenu.classList.remove('hidden');

        setStatus('Select options in the menu to begin.');
    }

    function renderGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const activeColor = gameActive ? currentPlayer().color : playerRoster[0].color;
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.82;

        for (let col = 0; col <= COLS; col += 1) {
            const x = col * cellWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        for (let row = 0; row <= ROWS; row += 1) {
            const y = row * cellHeight;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;

        for (let row = 0; row < ROWS; row += 1) {
            for (let col = 0; col < COLS; col += 1) {
                const x = col * cellWidth;
                const y = row * cellHeight;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fillRect(x + cellPadding, y + cellPadding, cellWidth - 2 * cellPadding, cellHeight - 2 * cellPadding);

                const cell = grid[row][col];
                if (cell.count === 0) continue;

                const cx = x + cellWidth / 2;
                const cy = y + cellHeight / 2;
                const minDimension = Math.min(cellWidth, cellHeight);
                const atomRadius = minDimension * 0.12;
                const spacing = atomRadius * 1.3;

                let jitterX = 0;
                let jitterY = 0;

                if (cell.count + 1 >= criticalMass(row, col)) {
                    jitterX = Math.sin(animationFrame / 6 + (row * 7 + col)) * 1.8;
                    jitterY = Math.cos(animationFrame / 6 + (row * 5 + col * 3)) * 1.8;
                }

                ctx.shadowColor = colors[cell.color];
                ctx.shadowBlur = 14;
                ctx.fillStyle = colors[cell.color];

                const drawAtom = (atomX, atomY) => {
                    ctx.beginPath();
                    ctx.arc(atomX, atomY, atomRadius, 0, Math.PI * 2);
                    ctx.fill();
                };

                if (cell.count === 1) {
                    drawAtom(cx + jitterX, cy + jitterY);
                } else if (cell.count === 2) {
                    drawAtom(cx - spacing + jitterX, cy + jitterY);
                    drawAtom(cx + spacing + jitterX, cy + jitterY);
                } else {
                    drawAtom(cx - spacing + jitterX, cy - spacing * 0.6 + jitterY);
                    drawAtom(cx + spacing + jitterX, cy - spacing * 0.6 + jitterY);
                    drawAtom(cx + jitterX, cy + spacing * 0.8 + jitterY);
                }

                ctx.shadowBlur = 0;
            }
        }
    }

    function renderProjectiles(now) {
        const projectileRadius = Math.min(cellWidth, cellHeight) * 0.12;

        for (const projectile of projectiles) {
            const progress = Math.min(1, (now - projectile.start) / projectile.dur);
            const x = projectile.sx + (projectile.ex - projectile.sx) * progress;
            const y = projectile.sy + (projectile.ey - projectile.sy) * progress;

            ctx.shadowColor = colors[projectile.color];
            ctx.shadowBlur = 10;
            ctx.fillStyle = colors[projectile.color];
            ctx.beginPath();
            ctx.arc(x, y, projectileRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            if (progress >= 1 && !projectile.applied) {
                projectile.applied = true;
                addAtomAt(projectile.targetRow, projectile.targetCol, projectile.color, true);
                projectile.done = true;
            }
        }

        if (projectiles.length > 0) {
            projectiles = projectiles.filter((projectile) => !projectile.done);
        }
    }

    function render(now) {
        renderGrid();
        renderProjectiles(now);
        finalizeTurnIfReady();

        animationFrame += 1;
        requestAnimationFrame(render);
    }

    function handleCanvasClick(event) {
        if (!gameActive || winner || projectiles.length > 0) return;

        initAudio();

        const { row, col } = canvasToCell(event.clientX, event.clientY);
        if (!inBounds(row, col)) return;

        const player = currentPlayer();
        const moved = addAtomAt(row, col, player.id, false);

        if (!moved) {
            setStatus('Move blocked: you can play only on empty or owned cells.');
            return;
        }

        playerHasMoved[player.id] = true;
        turnCount += 1;
        pendingTurnAdvance = true;

        finalizeTurnIfReady();
    }

    function hexToRgba(hex, alpha) {
        const normalized = hex.replace('#', '');
        const r = parseInt(normalized.substring(0, 2), 16);
        const g = parseInt(normalized.substring(2, 4), 16);
        const b = parseInt(normalized.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    playerCountSelect.addEventListener('change', refreshStartingPlayerOptions);
    startGameBtn.addEventListener('click', startMatch);
    newGameBtn.addEventListener('click', startMatch);
    menuBtn.addEventListener('click', returnToMenu);
    canvas.addEventListener('click', handleCanvasClick);

    refreshStartingPlayerOptions();
    setActiveColor(playerRoster[0].color);
    render(performance.now());
})();
