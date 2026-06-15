import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { createGuiWindow } from './windows'

let tray: Tray | null = null

export function createTray(pulseCoreWindow: BrowserWindow): Tray {
  // 创建一个简单的彩色图标 (16x16 RGBA)
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const cx = x - 7.5, cy = y - 7.5
      const d = Math.sqrt(cx * cx + cy * cy)
      if (d < 7) {
        buffer[i] = 99     // R - indigo
        buffer[i + 1] = 102 // G
        buffer[i + 2] = 241 // B
        buffer[i + 3] = 255 // A
      } else {
        buffer[i + 3] = 0  // transparent
      }
    }
  }

  const icon = nativeImage.createFromBuffer(buffer, { width: size, height: size })
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '💼 开始工作',
      click: () => pulseCoreWindow.webContents.send('tray:start-work')
    },
    {
      label: '📚 开始学习',
      click: () => pulseCoreWindow.webContents.send('tray:start-learning')
    },
    { type: 'separator' },
    {
      label: '📊 打开管理面板',
      click: () => createGuiWindow()
    },
    { type: 'separator' },
    {
      label: '❌ 退出 DevPulse AI',
      click: () => app.quit()
    }
  ])

  tray.setToolTip('DevPulse AI — PulseCore 脉核')
  tray.setContextMenu(contextMenu)

  return tray
}
