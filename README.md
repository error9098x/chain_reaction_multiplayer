# Electron Hello World with Custom Navbar

A beautiful Hello World Electron application featuring a custom navbar with modern UI design.

## Features

- 🎨 **Custom Navbar**: Frameless window with custom title bar and window controls
- ⚡ **Modern UI**: Beautiful gradient design with glassmorphism effects
- 🔒 **Secure**: Implements Electron security best practices with context isolation
- 📱 **Responsive**: Adaptive design that works on different screen sizes
- ⌨️ **Keyboard Shortcuts**: 
  - `Ctrl/Cmd + W` - Close window
  - `F11` - Toggle maximize/restore
- 🎭 **Interactive**: Smooth animations and hover effects

## Installation

1. Make sure you have Node.js installed
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development Mode
```bash
npm run dev
```
This will start the application with developer tools enabled.

### Production Mode
```bash
npm start
```
This will start the application in production mode.

## Project Structure

```
Chain Reaction/
├── main.js          # Main Electron process
├── preload.js       # Preload script for secure IPC
├── index.html       # Main HTML file
├── styles.css       # CSS styling
├── renderer.js      # Frontend JavaScript
├── package.json     # Project configuration
└── README.md        # This file
```

## Architecture

- **Main Process** (`main.js`): Creates and manages the application window
- **Preload Script** (`preload.js`): Safely exposes IPC methods to the renderer
- **Renderer Process** (`renderer.js`): Handles UI interactions and window controls
- **Security**: Uses context isolation and disabled node integration for security

## Window Controls

The custom navbar includes three window control buttons:
- **Minimize**: Minimizes the window to taskbar
- **Maximize/Restore**: Toggles between maximized and restored states
- **Close**: Closes the application

## Customization

You can easily customize the appearance by modifying:
- `styles.css` - Change colors, fonts, and layout
- `index.html` - Modify content and structure
- `renderer.js` - Add new interactive features

## Technologies Used

- Electron 28.0.0
- HTML5 & CSS3
- JavaScript (ES6+)
- CSS Grid & Flexbox
- CSS Backdrop Filter for glassmorphism effects

## Browser Compatibility

This application runs in Electron's Chromium environment and uses modern web technologies including:
- CSS Grid
- CSS Flexbox
- CSS Backdrop Filter
- ES6+ JavaScript features

Enjoy your Electron Hello World application! 🚀
# chain_reaction_multiplayer
# chain_reaction_multiplayer
# chain_reaction_multiplayer
# chain_reaction_multiplayer
# chain_reaction_multiplayer
