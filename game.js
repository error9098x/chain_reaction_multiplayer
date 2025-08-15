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
    const red = '#ff4d4f';
    const redDim = 'rgba(255,77,79,0.15)';
    const textColor = '#ffffff';

    // Internal pixel size (fixed logical space)
    const logicalWidth = 720;
    const logicalHeight = 480;
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;

    const cellWidth = Math.floor(logicalWidth / COLS);
    const cellHeight = Math.floor(logicalHeight / ROWS);

    // Simple grid state: counts 0..3 for red player
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

    // Seed some test modules
    grid[3][3] = 1;
    grid[3][4] = 2;
    grid[3][5] = 3; // Click this to trigger distribution

    let animationFrame = 0;

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * cellWidth;
                const y = r * cellHeight;

                // Background cell
                ctx.fillStyle = redDim;
                ctx.fillRect(x + cellPadding, y + cellPadding, cellWidth - 2 * cellPadding, cellHeight - 2 * cellPadding);

                const val = grid[r][c];
                if (val > 0) {
                    // Draw a circle representing the group size
                    const cx = x + cellWidth / 2;
                    const cy = y + cellHeight / 2;
                    const baseRadius = Math.min(cellWidth, cellHeight) * 0.28;

                    // Slight vibration for active (3)
                    let jitterX = 0, jitterY = 0;
                    if (val === 3) {
                        jitterX = Math.sin(animationFrame / 6 + (r * 7 + c)) * 1.8;
                        jitterY = Math.cos(animationFrame / 6 + (r * 5 + c * 3)) * 1.8;
                    }

                    ctx.beginPath();
                    ctx.fillStyle = red;
                    ctx.arc(cx + jitterX, cy + jitterY, baseRadius, 0, Math.PI * 2);
                    ctx.fill();

                    // Count text
                    ctx.fillStyle = textColor;
                    ctx.font = `${Math.floor(baseRadius * 1.4)}px system-ui, -apple-system, Segoe UI, Roboto`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(val), cx + jitterX, cy + jitterY + 1);
                }
            }
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

    canvas.addEventListener('click', (e) => {
        const { r, c } = canvasToCell(e.clientX, e.clientY);
        if (!inBounds(r, c)) return;

        if (grid[r][c] === 3) {
            // Single-step overflow: reset clicked cell, add +1 to orthogonal neighbors
            grid[r][c] = 0;
            const neighbors = [
                [r - 1, c],
                [r + 1, c],
                [r, c - 1],
                [r, c + 1]
            ];
            for (const [nr, nc] of neighbors) {
                if (inBounds(nr, nc)) {
                    grid[nr][nc] = Math.min(3, grid[nr][nc] + 1); // cap at 3 for this demo
                }
            }
        }
    });

    render();
})();


