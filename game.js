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
    const gridBg = 'rgba(64,64,64,0.2)';
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

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const now = performance.now();

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * cellWidth;
                const y = r * cellHeight;

                // Background cell
                ctx.fillStyle = gridBg;
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
                }
            }
        }

        // Draw projectiles for overflow animation
        const projectileRadius = Math.min(cellWidth, cellHeight) * 0.12;
        for (const p of projectiles) {
            const t = Math.min(1, (now - p.start) / p.dur);
            const x = p.sx + (p.ex - p.sx) * t;
            const y = p.sy + (p.ey - p.sy) * t;

            ctx.beginPath();
            ctx.fillStyle = colors[p.color];
            ctx.arc(x, y, projectileRadius, 0, Math.PI * 2);
            ctx.fill();

            if (t >= 1 && !p.applied) {
                // Apply increment on arrival
                p.applied = true;
                if (inBounds(p.targetR, p.targetC)) {
                    const targetCell = grid[p.targetR][p.targetC];
                    if (targetCell.count === 0) {
                        targetCell.color = p.color;
                    }
                    targetCell.count = Math.min(3, targetCell.count + 1);
                }
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
        const { r, c } = canvasToCell(e.clientX, e.clientY);
        if (!inBounds(r, c)) return;

        const cell = grid[r][c];

        if (cell.count === 3) {
            // Single-step overflow with animation: reset clicked cell and animate 4 atoms to neighbors
            const cellColor = cell.color;
            cell.count = 0;
            cell.color = null;
            const { x: sx, y: sy } = cellCenter(r, c);
            const neighbors = [
                [r - 1, c],
                [r + 1, c],
                [r, c - 1],
                [r, c + 1]
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
                    color: cellColor,
                    applied: false,
                    done: false
                });
            }
        } else {
            // Add atom to empty cell or increment existing (if same color or empty)
            if (cell.count === 0) {
                cell.count = 1;
                cell.color = currentColor;
            } else if (cell.color === currentColor && cell.count < 3) {
                cell.count++;
            }
            // If different color, do nothing (would be game rule)
        }
    });

    render();
})();


