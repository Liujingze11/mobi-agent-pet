import { BrowserWindow, screen, app, Menu } from 'electron'
import path from 'node:path'
import { t } from './i18n'

const isDev = !app.isPackaged

function getIconPath() {
  return path.join(app.getAppPath(), 'resources', 'icons', 'icon.png')
}
function getPreloadPath() {
  return path.join(__dirname, 'preload.js')
}

let guiWindow: BrowserWindow | null = null
let pulseCoreWindow: BrowserWindow | null = null

export function getGuiWindow(): BrowserWindow | null { return guiWindow }
export function getPulseCoreWindow(): BrowserWindow | null { return pulseCoreWindow }

export function showPulseCore(): void {
  if (pulseCoreWindow && !pulseCoreWindow.isDestroyed()) {
    pulseCoreWindow.show()
  } else {
    pulseCoreWindow = createPulseCoreWindow()
  }
}

export function hidePulseCore(): void {
  if (pulseCoreWindow && !pulseCoreWindow.isDestroyed()) {
    pulseCoreWindow.hide()
  }
}

export function togglePulseCore(): boolean {
  if (pulseCoreWindow && !pulseCoreWindow.isDestroyed() && pulseCoreWindow.isVisible()) {
    pulseCoreWindow.hide(); return false
  } else {
    showPulseCore(); return true
  }
}

function createPulseCoreWindow(): BrowserWindow {
  if (pulseCoreWindow && !pulseCoreWindow.isDestroyed()) return pulseCoreWindow
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
    type: 'toolbar',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  // 若 GUI 窗口存在，挂载为子窗口（合并任务栏条目）
  if (guiWindow && !guiWindow.isDestroyed()) win.setParentWindow(guiWindow)

  // 显式确保鼠标事件被捕获
  win.setIgnoreMouseEvents(false)

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { label: t('contextMenu.startWork'), click: () => win.webContents.send('tray:start-work') },
    { label: t('contextMenu.startLearning'), click: () => win.webContents.send('tray:start-learning') },
    { type: 'separator' },
    {
      label: t('contextMenu.openGui'),
      click: () => {
        if (guiWindow && !guiWindow.isDestroyed()) { guiWindow.show(); guiWindow.focus() }
        else guiWindow = createGuiWindow()
      }
    },
    { type: 'separator' },
    { label: t('contextMenu.quit'), click: () => app.quit() }
  ])
  win.webContents.on('context-menu', () => contextMenu.popup({ window: win }))
  win.on('closed', () => { pulseCoreWindow = null })

  if (isDev) {
    win.loadURL('http://localhost:5173/src/pulsecore/index.html')
  } else {
    win.loadFile(path.join(__dirname, '../dist/src/pulsecore/index.html'))
  }

  pulseCoreWindow = win
  return win
}

export function createGuiWindow(): BrowserWindow {
  if (guiWindow && !guiWindow.isDestroyed()) {
    guiWindow.show(); guiWindow.focus(); return guiWindow
  }
  guiWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    title: t('window.title'), backgroundColor: '#0f172a', show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: getPreloadPath(), nodeIntegration: false,
      contextIsolation: true, sandbox: false
    }
  })
  guiWindow.once('ready-to-show', () => guiWindow!.show())
  guiWindow.on('close', (e) => {
    // 不真正关闭，隐藏到托盘
    e.preventDefault()
    guiWindow!.hide()
  })
  // 当 GUI 重新显示时，重新挂载 PulseCore 为子窗口
  guiWindow.on('show', () => {
    if (pulseCoreWindow && !pulseCoreWindow.isDestroyed()) {
      pulseCoreWindow.setParentWindow(guiWindow)
    }
  })
  if (isDev) guiWindow.loadURL('http://localhost:5173/src/gui/index.html')
  else guiWindow.loadFile(path.join(__dirname, '../dist/src/gui/index.html'))
  return guiWindow
}
