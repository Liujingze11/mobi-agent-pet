import { BrowserWindow, screen, app } from 'electron'
import path from 'node:path'

const isDev = !app.isPackaged

function getPreloadPath() {
  return path.join(__dirname, 'preload.js')
}

export function createPulseCoreWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: 160,
    height: 190,
    x: screenWidth - 200,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173/src/pulsecore/index.html')
  } else {
    win.loadFile(path.join(__dirname, '../dist/src/pulsecore/index.html'))
  }

  return win
}

export function createGuiWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DevPulse AI',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173/src/gui/index.html')
  } else {
    win.loadFile(path.join(__dirname, '../dist/src/gui/index.html'))
  }

  return win
}
