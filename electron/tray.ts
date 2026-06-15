import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'

let tray: Tray | null = null

export function createTray(
  pulseCoreWindow: BrowserWindow,
  getGuiWindow: () => BrowserWindow | null
): Tray {
  // 创建 16x16 占位图标
  const icon = nativeImage.createEmpty()

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '开始工作',
      click: () => pulseCoreWindow.webContents.send('tray:start-work')
    },
    {
      label: '开始学习',
      click: () => pulseCoreWindow.webContents.send('tray:start-learning')
    },
    { type: 'separator' },
    {
      label: '打开管理面板',
      click: () => {
        const guiWin = getGuiWindow()
        if (guiWin) {
          guiWin.show()
          guiWin.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出 DevPulse AI',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('DevPulse AI — PulseCore 脉核')
  tray.setContextMenu(contextMenu)

  return tray
}
