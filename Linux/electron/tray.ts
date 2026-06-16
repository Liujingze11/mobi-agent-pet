import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { createGuiWindow, togglePulseCore, getPulseCoreWindow } from './windows'
import { t } from './i18n'

let tray: Tray | null = null

function buildTrayMenu(): Menu {
  const pulseVisible = getPulseCoreWindow()?.isVisible() ?? false
  return Menu.buildFromTemplate([
    { label: t('tray.startWork'), click: () => getPulseCoreWindow()?.webContents.send('tray:start-work') },
    { label: t('tray.startLearning'), click: () => getPulseCoreWindow()?.webContents.send('tray:start-learning') },
    { type: 'separator' },
    {
      label: pulseVisible ? t('tray.hidePulse') : t('tray.showPulse'),
      click: () => {
        togglePulseCore()
        // 重建菜单以更新标签
        if (tray) tray.setContextMenu(buildTrayMenu())
      }
    },
    { label: t('tray.openGui'), click: () => createGuiWindow() },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() }
  ])
}

export function createTray(): Tray {
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const cx = x - 7.5, cy = y - 7.5
      const d = Math.sqrt(cx * cx + cy * cy)
      if (d < 7) {
        buffer[i] = 99; buffer[i + 1] = 102; buffer[i + 2] = 241; buffer[i + 3] = 255
      } else {
        buffer[i + 3] = 0
      }
    }
  }

  const icon = nativeImage.createFromBuffer(buffer, { width: size, height: size })
  tray = new Tray(icon)
  tray.setToolTip(t('tray.tooltip'))
  tray.setContextMenu(buildTrayMenu())

  return tray
}
