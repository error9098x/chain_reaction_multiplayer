// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the application
    initializeApp();
    setupWindowControls();
});

function initializeApp() {
    console.log('Chain Reaction Game Initialized!');
    
    // Update maximize button icon based on window state
    updateMaximizeIcon();
}

function setupWindowControls() {
    // Minimize button
    const minimizeBtn = document.getElementById('minimize-btn');
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            window.electronAPI.minimizeWindow();
        });
    }

    // Maximize/Restore button
    const maximizeBtn = document.getElementById('maximize-btn');
    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', async () => {
            await window.electronAPI.maximizeWindow();
            updateMaximizeIcon();
        });
    }

    // Close button
    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.electronAPI.closeWindow();
        });
    }
}

async function updateMaximizeIcon() {
    const maximizeBtn = document.getElementById('maximize-btn');
    if (maximizeBtn && window.electronAPI) {
        try {
            const isMaximized = await window.electronAPI.isWindowMaximized();
            const svg = maximizeBtn.querySelector('svg');
            
            if (isMaximized) {
                // Show restore icon (two overlapping rectangles)
                svg.innerHTML = `
                    <rect x="0" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    <rect x="4" y="0" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
                `;
                maximizeBtn.title = 'Restore';
            } else {
                // Show maximize icon (single rectangle)
                svg.innerHTML = `
                    <rect x="0" y="0" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
                `;
                maximizeBtn.title = 'Maximize';
            }
        } catch (error) {
            console.error('Error updating maximize icon:', error);
        }
    }
}



// Handle window resize events to update maximize button
window.addEventListener('resize', () => {
    setTimeout(updateMaximizeIcon, 100);
});



// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + W to close window
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        window.electronAPI.closeWindow();
    }
    
    // F11 to toggle fullscreen (maximize/restore)
    if (e.key === 'F11') {
        e.preventDefault();
        window.electronAPI.maximizeWindow().then(() => {
            updateMaximizeIcon();
        });
    }
});
