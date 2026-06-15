import { BrowserWindow, screen, app, Menu } from 'electron'
import path from 'node:path'

const isDev = !app.isPackaged

function getPreloadPath() {
  return path.join(__dirname, 'preload.js')
}

let guiWindow: BrowserWindow | null = null
export function getGuiWindow(): BrowserWindow | null { return guiWindow }

export function createPulseCoreWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: 180,
    height: 220,
    x: screenWidth - 220,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    type: 'normal',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  // 显式确保鼠标事件被捕获
  win.setIgnoreMouseEvents(false)

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { label: '💼 开始工作', click: () => win.webContents.send('tray:start-work') },
    { label: '📚 开始学习', click: () => win.webContents.send('tray:start-learning') },
    { type: 'separator' },
    {
      label: '📊 打开管理面板',
      click: () => {
        if (guiWindow && !guiWindow.isDestroyed()) { guiWindow.show(); guiWindow.focus() }
        else guiWindow = createGuiWindow()
      }
    },
    { type: 'separator' },
    { label: '❌ 退出 DevPulse AI', click: () => app.quit() }
  ])
  win.webContents.on('context-menu', () => contextMenu.popup({ window: win }))

  if (isDev) {
    win.loadURL('http://localhost:5173/src/pulsecore/index.html')
  } else {
    win.loadFile(path.join(__dirname, '../dist/src/pulsecore/index.html'))
  }

  return win
}

export function createGuiWindow(): BrowserWindow {
  if (guiWindow && !guiWindow.isDestroyed()) {
    guiWindow.show(); guiWindow.focus(); return guiWindow
  }
  guiWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    title: 'DevPulse AI', backgroundColor: '#0f172a', show: false,
    webPreferences: {
      preload: getPreloadPath(), nodeIntegration: false,
      contextIsolation: true, sandbox: false
    }
  })
  guiWindow.once('ready-to-show', () => guiWindow!.show())
  guiWindow.on('closed', () => { guiWindow = null })
  if (isDev) guiWindow.loadURL('http://localhost:5173/src/gui/index.html')
  else guiWindow.loadFile(path.join(__dirname, '../dist/src/gui/index.html'))
  return guiWindow
}
