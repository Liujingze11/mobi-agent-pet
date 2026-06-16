import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
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
      click: () => { togglePulseCore(); if (tray) tray.setContextMenu(buildTrayMenu()) }
    },
    { label: t('tray.openGui'), click: () => createGuiWindow() },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() }
  ])
}

function getTrayIcon() {
  const iconPath = path.join(app.getAppPath(), 'resources', 'icons', 'icon_32.png')
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  }
  // fallback: 程序化生成
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const d = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2)
      if (d < 7) { buffer[i] = 99; buffer[i + 1] = 102; buffer[i + 2] = 241; buffer[i + 3] = 255 }
      else { buffer[i + 3] = 0 }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size })
}

export function createTray(): Tray {
  tray = new Tray(getTrayIcon())
  tray.setToolTip(t('tray.tooltip'))
  tray.setContextMenu(buildTrayMenu())
  return tray
}
