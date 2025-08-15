(() => {
    // Minimal Chain Reaction demo: grid with red player cells (values 1..3)
    // On click: if a cell has value 3, it distributes +1 to its 4 neighbors and resets to 0

    const canvas = document.getElementById('chain-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Grid config
    const COLS = 10;
    const ROWS = 8;
    const cellPadding = 2;
    const textColor = '#ffffff';
    
    // Color palette
    const colors = {
        red: '#ff4d4f',
        yellow: '#fadb14',
        green: '#52c41a',
        blue: '#1890ff',
        pink: '#eb2f96',
        cyan: '#13c2c2'
    };
    
    let currentColor = 'red';
    
    // Dark grey grid background
    function getGridBg() {
        return 'rgba(64,64,64,0.2)';
    }
    
    // Audio context for sound effects
    let audioContext;
    
    function initAudio() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }
    
    function playAtomSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Quick "pop" sound
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }
    
    function playExplosionSound() {
        if (!audioContext) return;
        
        // Create noise for explosion effect
        const bufferSize = audioContext.sampleRate * 0.3; // 0.3 seconds
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }
        
        const noise = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const gainNode = audioContext.createGain();
        
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Low-pass filter for more realistic explosion
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        noise.start(audioContext.currentTime);
        noise.stop(audioContext.currentTime + 0.3);
    }

    // Internal pixel size (fixed logical space)
    const logicalWidth = 720;
    const logicalHeight = 480;
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;

    const cellWidth = Math.floor(logicalWidth / COLS);
    const cellHeight = Math.floor(logicalHeight / ROWS);

    // Grid state: each cell stores { count: 0..3, color: 'red'|'yellow'|etc }
    const grid = Array.from({ length: ROWS }, () => 
        Array.from({ length: COLS }, () => ({ count: 0, color: null }))
    );

    // Seed some test modules
    grid[3][3] = { count: 1, color: 'red' };
    grid[3][4] = { count: 2, color: 'red' };
    grid[3][5] = { count: 3, color: 'red' }; // Click this to trigger distribution

    let animationFrame = 0;
    let projectiles = [];
    const explosionDurationMs = 200; // quick animation

    function cellCenter(row, col) {
        return {
            x: col * cellWidth + cellWidth / 2,
            y: row * cellHeight + cellHeight / 2
        };
    }

    function explodeAt(row, col, color) {
        // Play explosion sound
        playExplosionSound();
        
        const { x: sx, y: sy } = cellCenter(row, col);
        // reset the exploding cell
        const origin = grid[row][col];
        origin.count = 0;
        origin.color = null;

        const neighbors = [
            [row - 1, col],
            [row + 1, col],
            [row, col - 1],
            [row, col + 1]
        ];
        const startTime = performance.now();
        for (const [nr, nc] of neighbors) {
            if (!inBounds(nr, nc)) continue;
            const { x: ex, y: ey } = cellCenter(nr, nc);
            projectiles.push({
                sx, sy, ex, ey,
                start: startTime,
                dur: explosionDurationMs,
                targetR: nr,
                targetC: nc,
                color,
                applied: false,
                done: false
            });
        }
    }

    // Unified atom add function used by both clicks and projectile arrivals
    // If sourceIsExplosion is true, we allow adding to any cell regardless of color
    function addAtomAt(row, col, color, sourceIsExplosion = false) {
        if (!inBounds(row, col)) return;
        const cell = grid[row][col];
        
        // Play atom sound only for manual clicks, not for chain reaction propagation
        if (!sourceIsExplosion) {
            playAtomSound();
        }
        
        if (cell.count === 0) {
            cell.count = 1;
            cell.color = color;
        } else {
            if (sourceIsExplosion) {
                // Explosion converts ownership
                cell.color = color;
            } else if (cell.color !== color) {
                // Ignore adding to opponent cell from click (simple rule for demo)
                return;
            }
            cell.count += 1;
        }

        if (cell.count > 3) {
            explodeAt(row, col, color);
        }
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const now = performance.now();

        // Draw grid lines first with team color - bright and vibrant
        const gridColor = colors[currentColor];
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.8;
        
        // Vertical lines
        for (let c = 0; c <= COLS; c++) {
            const x = c * cellWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let r = 0; r <= ROWS; r++) {
            const y = r * cellHeight;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1; // Reset alpha
        
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * cellWidth;
                const y = r * cellHeight;

                // Background cell with dynamic color
                ctx.fillStyle = getGridBg();
                ctx.fillRect(x + cellPadding, y + cellPadding, cellWidth - 2 * cellPadding, cellHeight - 2 * cellPadding);

                const cell = grid[r][c];
                if (cell.count > 0) {
                    // Draw 1, 2, or 3 atoms (small circles). 3 is "excited" (jitter animation)
                    const cx = x + cellWidth / 2;
                    const cy = y + cellHeight / 2;
                    const minDim = Math.min(cellWidth, cellHeight);
                    const atomRadius = minDim * 0.12;
                    const spacing = atomRadius * 1.3; // slight overlap to look "stuck"

                    // Slight vibration for active (3)
                    let jitterX = 0, jitterY = 0;
                    if (cell.count === 3) {
                        jitterX = Math.sin(animationFrame / 6 + (r * 7 + c)) * 1.8;
                        jitterY = Math.cos(animationFrame / 6 + (r * 5 + c * 3)) * 1.8;
                    }

                    // Set up glow effect
                    ctx.shadowColor = colors[cell.color];
                    ctx.shadowBlur = 15;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.fillStyle = colors[cell.color];

                    const drawAtom = (ax, ay) => {
                        ctx.beginPath();
                        ctx.arc(ax, ay, atomRadius, 0, Math.PI * 2);
                        ctx.fill();
                    };

                    if (cell.count === 1) {
                        drawAtom(cx + jitterX, cy + jitterY);
                    } else if (cell.count === 2) {
                        // Two atoms side-by-side
                        drawAtom(cx - spacing + jitterX, cy + jitterY);
                        drawAtom(cx + spacing + jitterX, cy + jitterY);
                    } else if (cell.count === 3) {
                        // Triangle cluster
                        drawAtom(cx - spacing + jitterX, cy - spacing * 0.6 + jitterY);
                        drawAtom(cx + spacing + jitterX, cy - spacing * 0.6 + jitterY);
                        drawAtom(cx + jitterX, cy + spacing * 0.8 + jitterY);
                    }
                    
                    // Reset shadow for other drawing operations
                    ctx.shadowBlur = 0;
                }
            }
        }

        // Draw projectiles for overflow animation
        const projectileRadius = Math.min(cellWidth, cellHeight) * 0.12;
        for (const p of projectiles) {
            const t = Math.min(1, (now - p.start) / p.dur);
            const x = p.sx + (p.ex - p.sx) * t;
            const y = p.sy + (p.ey - p.sy) * t;

            // Add glow to projectiles too
            ctx.shadowColor = colors[p.color];
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            ctx.beginPath();
            ctx.fillStyle = colors[p.color];
            ctx.arc(x, y, projectileRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Reset shadow
            ctx.shadowBlur = 0;

            if (t >= 1 && !p.applied) {
                // Apply increment on arrival using unified function
                p.applied = true;
                addAtomAt(p.targetR, p.targetC, p.color, true);
                p.done = true;
            }
        }

        // Remove finished projectiles
        if (projectiles.length) {
            projectiles = projectiles.filter(p => !p.done);
        }

        animationFrame++;
        requestAnimationFrame(render);
    }

    function inBounds(r, c) {
        return r >= 0 && r < ROWS && c >= 0 && c < COLS;
    }

    function canvasToCell(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        const c = Math.floor(x / cellWidth);
        const r = Math.floor(y / cellHeight);
        return { r, c };
    }

    // Color dropdown handler
    const colorSelect = document.getElementById('player-color');
    if (colorSelect) {
        colorSelect.addEventListener('change', (e) => {
            currentColor = e.target.value;
        });
    }

    canvas.addEventListener('click', (e) => {
        // Initialize audio on first click (required by browsers)
        if (!audioContext) {
            initAudio();
        }
        
        const { r, c } = canvasToCell(e.clientX, e.clientY);
        if (!inBounds(r, c)) return;

        // Use unified function for clicks
        addAtomAt(r, c, currentColor, false);
    });

    // Initialize audio context
    initAudio();
    render();
})();


