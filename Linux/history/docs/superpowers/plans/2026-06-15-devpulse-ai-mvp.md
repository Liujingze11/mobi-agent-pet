# DevPulse AI — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of DevPulse AI — an Electron desktop app with PulseCore floating energy-core pet + GUI management panel, supporting work/learning time tracking, AI-powered summaries via DeepSeek API, and auto-generated daily/weekly/monthly reports.

**Architecture:** Electron main process owns all business logic (Timer Engine, AI Provider, Report Generator, SQLite). Two BrowserWindow renderers (PulseCore floating window + GUI management window) communicate via contextBridge IPC. SQLite via better-sqlite3 for local-first data persistence.

**Tech Stack:** Electron 33+, React 18, TypeScript 5, Tailwind CSS 4, shadcn/ui, Recharts, better-sqlite3, Vite (renderer bundler), electron-builder (packaging).

**Priority:** Linux development first, with macOS/Windows compatibility maintained throughout.

---

## Phase 0: Project Scaffolding

### Task 0.1: Initialize project with package.json

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create package.json with all dependencies**

```json
{
  "name": "devpulse-ai",
  "version": "0.1.0",
  "description": "DevPulse AI — 智能研发记录桌面助手，PulseCore 脉核",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build": "vite build && electron-builder",
    "electron:build:linux": "vite build && electron-builder --linux",
    "electron:build:mac": "vite build && electron-builder --mac",
    "electron:build:win": "vite build && electron-builder --win"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "electron-store": "^10.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "concurrently": "^9.1.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "lucide-react": "^0.460.0",
    "postcss": "^8.4.49",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.13.0",
    "tailwindcss": "^3.4.16",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.0",
    "wait-on": "^8.0.0"
  }
}
```

- [ ] **Step 2: Run npm install**

```bash
cd /path/to/DevPulse_AI && npm install
```

Expected: dependencies install without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize project with Electron + React + TypeScript dependencies"
```

---

### Task 0.2: Configure TypeScript

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@electron/*": ["./electron/*"]
    }
  },
  "include": ["src", "electron"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts", "electron-builder.yml"]
}
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json tsconfig.node.json
git commit -m "chore: add TypeScript configuration"
```

---

### Task 0.3: Configure Vite + Electron plugin

**Files:**
- Create: `vite.config.ts`

- [ ] **Step 1: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3', 'electron']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    electronRenderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron')
    }
  },
  build: {
    rollupOptions: {
      input: {
        pulsecore: path.resolve(__dirname, 'src/pulsecore/index.html'),
        gui: path.resolve(__dirname, 'src/gui/index.html')
      }
    }
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add Vite + Electron plugin configuration"
```

---

### Task 0.4: Configure Tailwind CSS + PostCSS

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

- [ ] **Step 1: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        pulse: {
          idle: '#6366f1',      // indigo-500
          working: '#3b82f6',   // blue-500
          learning: '#22c55e',  // green-500
          focus: '#f59e0b',     // amber-500
          paused: '#6b7280',    // gray-500
          achievement: '#fbbf24' // amber-400
        },
        surface: {
          dark: '#0f172a',      // slate-900
          card: '#1e293b',      // slate-800
          border: '#334155'     // slate-700
        }
      },
      animation: {
        'pulse-core': 'pulseCore 2s ease-in-out infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
        'ripple': 'ripple 1.5s ease-out infinite',
        'heartbeat': 'heartbeat 0.8s ease-in-out infinite',
        'achievement-burst': 'achievementBurst 0.5s ease-out 3',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out'
      },
      keyframes: {
        pulseCore: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.05)', opacity: '1' }
        },
        breathe: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99,102,241,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(99,102,241,0.6)' }
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(1.5)', opacity: '0' }
        },
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '15%': { transform: 'scale(1.1)' },
          '30%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.08)' },
          '60%': { transform: 'scale(1)' }
        },
        achievementBurst: {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(251,191,36,0)' },
          '50%': { transform: 'scale(1.3)', boxShadow: '0 0 60px rgba(251,191,36,0.8)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(251,191,36,0)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
}
```

- [ ] **Step 2: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js postcss.config.js
git commit -m "chore: add Tailwind CSS + PostCSS with PulseCore animation keyframes"
```

---

### Task 0.5: Create HTML entry points and global styles

**Files:**
- Create: `src/pulsecore/index.html`
- Create: `src/gui/index.html`
- Create: `src/styles/globals.css`

- [ ] **Step 1: Create PulseCore HTML entry**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PulseCore</title>
  </head>
  <body class="bg-transparent overflow-hidden select-none">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create GUI HTML entry**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DevPulse AI</title>
  </head>
  <body class="bg-surface-dark text-white antialiased">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* PulseCore 专用全局样式 */
.pulsecore-window {
  -webkit-app-region: drag;
  background: transparent !important;
}

.pulsecore-window .interactive {
  -webkit-app-region: no-drag;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

/* 禁用文本选择（PulseCore 悬浮窗） */
.no-select {
  user-select: none;
  -webkit-user-select: none;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pulsecore/index.html src/gui/index.html src/styles/globals.css
git commit -m "chore: add HTML entry points and global styles"
```

---

### Task 0.6: Create Electron main process skeleton

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `electron/windows.ts`
- Create: `electron/tray.ts`

- [ ] **Step 1: Create main.ts**

```typescript
import { app, BrowserWindow } from 'electron'
import { createPulseCoreWindow, createGuiWindow } from './windows'
import { createTray } from './tray'
import { initDatabase } from './db/connection'
import { runMigrations } from './db/migrate'
import { seedDefaults } from './db/seed'
import { initIpcHandlers } from './ipc-handlers'
import { TimerEngine } from './timer/engine'
import { AIProviderRegistry } from './ai/registry'
import { ReportGenerator } from './report/generator'

// 全局单例
export let timerEngine: TimerEngine
export let aiRegistry: AIProviderRegistry
export let reportGenerator: ReportGenerator

let pulseCoreWindow: BrowserWindow | null = null
let guiWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  // 初始化数据库
  const db = initDatabase()
  runMigrations(db)
  seedDefaults(db)

  // 初始化核心服务
  timerEngine = new TimerEngine(db)
  aiRegistry = new AIProviderRegistry(db)
  reportGenerator = new ReportGenerator(db, aiRegistry)

  // 初始化 IPC
  initIpcHandlers()

  // 创建窗口
  pulseCoreWindow = createPulseCoreWindow()
  createTray(pulseCoreWindow, () => guiWindow)

  // 崩溃恢复
  await timerEngine.recoverFromSnapshot()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      pulseCoreWindow = createPulseCoreWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 不退出应用，保持后台运行
  // macOS 和 Linux 上应用继续在托盘运行
})

app.on('before-quit', () => {
  // 保存当前状态快照
  if (timerEngine) {
    timerEngine.saveSnapshot()
  }
})
```

- [ ] **Step 2: Create preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // Timer
  timer: {
    startWork: (projectId: string, taskId?: string) =>
      ipcRenderer.invoke('timer:start-work', projectId, taskId),
    startLearning: (topicId: string) =>
      ipcRenderer.invoke('timer:start-learning', topicId),
    pause: () => ipcRenderer.invoke('timer:pause'),
    resume: () => ipcRenderer.invoke('timer:resume'),
    stop: () => ipcRenderer.invoke('timer:stop'),
    getState: () => ipcRenderer.invoke('timer:get-state'),
    getTodayStats: () => ipcRenderer.invoke('timer:get-today-stats'),
    onTick: (callback: (payload: any) => void) => {
      const handler = (_event: any, payload: any) => callback(payload)
      ipcRenderer.on('timer:tick', handler)
      return () => ipcRenderer.removeListener('timer:tick', handler)
    },
    onStateChange: (callback: (state: any) => void) => {
      const handler = (_event: any, state: any) => callback(state)
      ipcRenderer.on('timer:state-change', handler)
      return () => ipcRenderer.removeListener('timer:state-change', handler)
    }
  },

  // Projects
  projects: {
    list: (companyId?: string) => ipcRenderer.invoke('projects:list', companyId),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    create: (data: any) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id)
  },

  // Tasks
  tasks: {
    listByProject: (projectId: string) => ipcRenderer.invoke('tasks:list-by-project', projectId),
    create: (data: any) => ipcRenderer.invoke('tasks:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('tasks:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('tasks:remove', id)
  },

  // Learning
  learning: {
    listCategories: () => ipcRenderer.invoke('learning:list-categories'),
    createCategory: (data: any) => ipcRenderer.invoke('learning:create-category', data),
    listTopics: (categoryId?: string) => ipcRenderer.invoke('learning:list-topics', categoryId),
    createTopic: (data: any) => ipcRenderer.invoke('learning:create-topic', data)
  },

  // Sessions
  sessions: {
    listWork: (filters?: any) => ipcRenderer.invoke('sessions:list-work', filters),
    listLearning: (filters?: any) => ipcRenderer.invoke('sessions:list-learning', filters),
    getWork: (id: string) => ipcRenderer.invoke('sessions:get-work', id),
    getLearning: (id: string) => ipcRenderer.invoke('sessions:get-learning', id),
    saveReview: (id: string, type: string, data: any) =>
      ipcRenderer.invoke('sessions:save-review', id, type, data)
  },

  // AI
  ai: {
    summarize: (input: any) => ipcRenderer.invoke('ai:summarize', input),
    generateReport: (input: any) => ipcRenderer.invoke('ai:generate-report', input),
    validateConnection: () => ipcRenderer.invoke('ai:validate-connection'),
    getSettings: () => ipcRenderer.invoke('ai:get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('ai:save-settings', settings)
  },

  // Reports
  reports: {
    getDaily: (date: string) => ipcRenderer.invoke('reports:get-daily', date),
    generateDaily: (date: string) => ipcRenderer.invoke('reports:generate-daily', date),
    getWeekly: (year: number, week: number) => ipcRenderer.invoke('reports:get-weekly', year, week),
    generateWeekly: (year: number, week: number) => ipcRenderer.invoke('reports:generate-weekly', year, week),
    getMonthly: (year: number, month: number) => ipcRenderer.invoke('reports:get-monthly', year, month),
    generateMonthly: (year: number, month: number) => ipcRenderer.invoke('reports:generate-monthly', year, month),
    exportMarkdown: (reportId: string, type: string) => ipcRenderer.invoke('reports:export-markdown', reportId, type)
  },

  // Achievements
  achievements: {
    listAll: () => ipcRenderer.invoke('achievements:list-all'),
    listUnlocked: () => ipcRenderer.invoke('achievements:list-unlocked'),
    check: () => ipcRenderer.invoke('achievements:check')
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:get-all')
  },

  // Window controls
  window: {
    openGui: () => ipcRenderer.invoke('window:open-gui'),
    minimizePulseCore: () => ipcRenderer.invoke('window:minimize-pulsecore'),
    closeGui: () => ipcRenderer.invoke('window:close-gui')
  },

  // App
  app: {
    getMode: () => ipcRenderer.invoke('app:get-mode'),
    setMode: (mode: string) => ipcRenderer.invoke('app:set-mode', mode),
    quit: () => ipcRenderer.invoke('app:quit')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
```

- [ ] **Step 3: Create windows.ts skeleton**

```typescript
import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

const isDev = !app.isPackaged

function getPulseCorePreload() {
  return path.join(__dirname, 'preload.js')
}

// Will be properly imported after main.ts creates app
import { app } from 'electron'

export function createPulseCoreWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: 140,
    height: 160,
    x: screenWidth - 180,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      preload: getPulseCorePreload(),
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

  // 鼠标穿透：核心外区域点击穿透
  win.setIgnoreMouseEvents(false)

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
    show: false, // 先隐藏，ready-to-show 后再显示避免白屏
    webPreferences: {
      preload: getPulseCorePreload(),
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
```

- [ ] **Step 4: Create tray.ts skeleton**

```typescript
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import path from 'node:path'

let tray: Tray | null = null

export function createTray(
  pulseCoreWindow: BrowserWindow,
  getGuiWindow: () => BrowserWindow | null
): Tray {
  // 创建简单托盘图标（16x16 的彩色方块作为占位）
  const icon = nativeImage.createEmpty()
  // Linux: 使用模板图标路径；实际图标后续替换
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
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts electron/windows.ts electron/tray.ts
git commit -m "feat: add Electron main process skeleton with window management"
```

---

### Task 0.7: Create utility modules

**Files:**
- Create: `electron/utils/time.ts`
- Create: `electron/utils/id.ts`
- Create: `electron/utils/logger.ts`

- [ ] **Step 1: Create time.ts**

```typescript
export function now(): string {
  return new Date().toISOString()
}

export function nowTimestamp(): number {
  return Date.now()
}

export function formatSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export function formatSecondsCompact(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return {
    year: d.getUTCFullYear(),
    week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }
}

export function getDaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  const current = new Date(start)
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10))
    current.setDate(current.getDate() + 1)
  }
  return days
}

export function isWithin24Hours(isoString: string): boolean {
  const then = new Date(isoString).getTime()
  const now = Date.now()
  return (now - then) < 24 * 60 * 60 * 1000
}
```

- [ ] **Step 2: Create id.ts**

```typescript
import { randomBytes } from 'node:crypto'

export function generateId(): string {
  return randomBytes(16).toString('hex')
}
```

- [ ] **Step 3: Create logger.ts**

```typescript
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const logDir = path.join(app.getPath('userData'), 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

const logFile = path.join(logDir, 'devpulse.log')

function writeLog(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`
  fs.appendFileSync(logFile, line)
  if (process.env.NODE_ENV === 'development') {
    console.log(line.trim())
  }
}

export const logger = {
  info: (msg: string, data?: any) => writeLog('INFO', msg, data),
  warn: (msg: string, data?: any) => writeLog('WARN', msg, data),
  error: (msg: string, data?: any) => writeLog('ERROR', msg, data),
  debug: (msg: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') writeLog('DEBUG', msg, data)
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/utils/time.ts electron/utils/id.ts electron/utils/logger.ts
git commit -m "feat: add utility modules (time, id, logger)"
```

---

## Phase 1: Database Layer

### Task 1.1: Create SQLite schema

**Files:**
- Create: `electron/db/schema.sql`

- [ ] **Step 1: Write complete DDL**

```sql
-- ============================================================
-- DevPulse AI — Database Schema v1.0
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  avatar_path TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_companies (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  company_id    TEXT REFERENCES companies(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  color         TEXT DEFAULT '#6366f1',
  total_seconds INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'todo',
  priority      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  icon        TEXT DEFAULT '📚',
  color       TEXT DEFAULT '#22c55e',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_topics (
  id            TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES learning_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  project_id        TEXT NOT NULL REFERENCES projects(id),
  task_id           TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  start_time        TEXT NOT NULL,
  end_time          TEXT,
  paused_seconds    INTEGER NOT NULL DEFAULT 0,
  effective_seconds INTEGER,
  raw_notes         TEXT,
  completed_work    TEXT,
  problems          TEXT,
  solutions         TEXT,
  next_steps        TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  topic_id          TEXT NOT NULL REFERENCES learning_topics(id),
  start_time        TEXT NOT NULL,
  end_time          TEXT,
  paused_seconds    INTEGER NOT NULL DEFAULT 0,
  effective_seconds INTEGER,
  raw_notes         TEXT,
  learning_content  TEXT,
  gains             TEXT,
  questions         TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id                TEXT PRIMARY KEY,
  session_type      TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  summary_json      TEXT NOT NULL,
  raw_response      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  date             TEXT NOT NULL,
  content_json     TEXT NOT NULL,
  work_seconds     INTEGER NOT NULL DEFAULT 0,
  learning_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  year             INTEGER NOT NULL,
  week             INTEGER NOT NULL,
  content_json     TEXT NOT NULL,
  work_seconds     INTEGER NOT NULL DEFAULT 0,
  learning_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, year, week)
);

CREATE TABLE IF NOT EXISTS monthly_reports (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL,
  content_json     TEXT NOT NULL,
  work_seconds     INTEGER NOT NULL DEFAULT 0,
  learning_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, year, month)
);

CREATE TABLE IF NOT EXISTS achievements (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  icon          TEXT DEFAULT '🏆',
  category      TEXT NOT NULL DEFAULT 'general',
  condition_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  achievement_id  TEXT NOT NULL REFERENCES achievements(id),
  unlocked_at     TEXT NOT NULL DEFAULT (datetime('now')),
  notified        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#94a3b8'
);

CREATE TABLE IF NOT EXISTS work_session_tags (
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

CREATE TABLE IF NOT EXISTS learning_session_tags (
  session_id TEXT NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

CREATE TABLE IF NOT EXISTS pulsecore_snapshot (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  state                     TEXT NOT NULL,
  session_type              TEXT,
  session_id                TEXT,
  project_id                TEXT,
  task_id                   TEXT,
  topic_id                  TEXT,
  start_time                TEXT,
  paused_at                 TEXT,
  accumulated_pause_seconds INTEGER DEFAULT 0,
  saved_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_work_sessions_user ON work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_project ON work_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_date ON work_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_topic ON learning_sessions(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_date ON learning_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
```

- [ ] **Step 2: Commit**

```bash
git add electron/db/schema.sql
git commit -m "feat: add complete SQLite schema (16 tables + indexes)"
```

---

### Task 1.2: Create database connection + migration + seed

**Files:**
- Create: `electron/db/connection.ts`
- Create: `electron/db/migrate.ts`
- Create: `electron/db/seed.ts`

- [ ] **Step 1: Create connection.ts**

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  const dbDir = path.join(app.getPath('userData'), 'data')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.join(dbDir, 'devpulse.db')
  db = new Database(dbPath)

  // 启用 WAL 模式提高并发性能
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}
```

- [ ] **Step 2: Create migrate.ts**

```typescript
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function runMigrations(db: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql')
  // For development, read from electron/db/schema.sql
  const devSchemaPath = path.join(__dirname, '..', '..', 'electron', 'db', 'schema.sql')

  let schemaSql: string
  if (fs.existsSync(schemaPath)) {
    schemaSql = fs.readFileSync(schemaPath, 'utf-8')
  } else if (fs.existsSync(devSchemaPath)) {
    schemaSql = fs.readFileSync(devSchemaPath, 'utf-8')
  } else {
    throw new Error('Schema file not found')
  }

  db.exec(schemaSql)
}
```

- [ ] **Step 3: Create seed.ts**

```typescript
import Database from 'better-sqlite3'
import { generateId } from '../utils/id'

export function seedDefaults(db: Database.Database): void {
  // 检查是否已有用户
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any
  if (userCount.count > 0) return

  // 创建默认用户
  const userId = generateId()
  db.prepare(`INSERT INTO users (id, name) VALUES (?, ?)`).run(userId, '默认用户')

  // 创建默认公司
  const companyId = generateId()
  db.prepare(`INSERT INTO companies (id, name, description) VALUES (?, ?, ?)`).run(
    companyId, '个人项目', '个人研发项目'
  )
  db.prepare(`INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)`).run(
    userId, companyId, 'owner'
  )

  // 创建默认知识分类
  const defaultCategories = [
    { name: 'AI', icon: '🤖', color: '#8b5cf6', sort: 0 },
    { name: '前端', icon: '🎨', color: '#3b82f6', sort: 1 },
    { name: '后端', icon: '⚙️', color: '#22c55e', sort: 2 },
    { name: '数据库', icon: '🗄️', color: '#f59e0b', sort: 3 },
    { name: 'Linux', icon: '🐧', color: '#ef4444', sort: 4 },
    { name: 'Claude Code', icon: '💻', color: '#6366f1', sort: 5 },
    { name: 'DeepSeek', icon: '🔮', color: '#06b6d4', sort: 6 },
    { name: '论文阅读', icon: '📄', color: '#84cc16', sort: 7 },
    { name: '公司业务', icon: '🏢', color: '#f97316', sort: 8 },
    { name: '架构设计', icon: '🏗️', color: '#a855f7', sort: 9 }
  ]

  const insertCat = db.prepare(
    `INSERT INTO learning_categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`
  )
  for (const cat of defaultCategories) {
    insertCat.run(generateId(), cat.name, cat.icon, cat.color, cat.sort)
  }

  // 创建默认成就定义
  const defaultAchievements = [
    { key: 'first_session', name: '初次记录', description: '完成第一次工作或学习记录',
      icon: '🌱', category: 'milestone',
      condition: JSON.stringify({ type: 'session_count', threshold: 1 }) },
    { key: 'streak_3_days', name: '连续3天', description: '连续3天有记录',
      icon: '🔥', category: 'streak',
      condition: JSON.stringify({ type: 'streak_days', threshold: 3 }) },
    { key: 'streak_7_days', name: '连续7天', description: '连续7天有记录',
      icon: '🔥', category: 'streak',
      condition: JSON.stringify({ type: 'streak_days', threshold: 7 }) },
    { key: 'streak_30_days', name: '月度全勤', description: '连续30天有记录',
      icon: '⭐', category: 'streak',
      condition: JSON.stringify({ type: 'streak_days', threshold: 30 }) },
    { key: 'work_100h', name: '研发100小时', description: '累计研发时长达到100小时',
      icon: '⚡', category: 'volume',
      condition: JSON.stringify({ type: 'total_work_hours', threshold: 100 }) },
    { key: 'work_500h', name: '研发500小时', description: '累计研发时长达到500小时',
      icon: '💎', category: 'volume',
      condition: JSON.stringify({ type: 'total_work_hours', threshold: 500 }) },
    { key: 'learning_50h', name: '学习50小时', description: '累计学习时长达到50小时',
      icon: '📚', category: 'volume',
      condition: JSON.stringify({ type: 'total_learning_hours', threshold: 50 }) },
    { key: 'sessions_10', name: '完成10次记录', description: '完成10次工作或学习 session',
      icon: '🎯', category: 'milestone',
      condition: JSON.stringify({ type: 'session_count', threshold: 10 }) },
    { key: 'sessions_50', name: '完成50次记录', description: '完成50次工作或学习 session',
      icon: '🎖️', category: 'milestone',
      condition: JSON.stringify({ type: 'session_count', threshold: 50 }) },
    { key: 'first_project_done', name: '首个项目完成', description: '完成第一个项目',
      icon: '🏁', category: 'special',
      condition: JSON.stringify({ type: 'project_completed', threshold: 1 }) },
    { key: 'first_report', name: '第一篇周报', description: '生成第一篇周报',
      icon: '📝', category: 'special',
      condition: JSON.stringify({ type: 'weekly_report_count', threshold: 1 }) },
    { key: 'ai_summaries_10', name: 'AI 总结10次', description: '使用 AI 总结功能10次',
      icon: '🤖', category: 'special',
      condition: JSON.stringify({ type: 'ai_summary_count', threshold: 10 }) }
  ]

  const insertAchievement = db.prepare(
    `INSERT INTO achievements (id, key, name, description, icon, category, condition_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const ach of defaultAchievements) {
    insertAchievement.run(generateId(), ach.key, ach.name, ach.description, ach.icon, ach.category, ach.condition)
  }

  // 设置默认应用模式
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`).run('app_mode', '"solo"')
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/db/connection.ts electron/db/migrate.ts electron/db/seed.ts
git commit -m "feat: add database connection, migration, and seed data"
```

---

### Task 1.3: Create database query modules

**Files:**
- Create: `electron/db/queries/projects.ts`
- Create: `electron/db/queries/tasks.ts`
- Create: `electron/db/queries/work-sessions.ts`
- Create: `electron/db/queries/learning.ts`
- Create: `electron/db/queries/reports.ts`
- Create: `electron/db/queries/achievements.ts`
- Create: `electron/db/queries/settings.ts`
- Create: `electron/db/queries/users.ts`

- [ ] **Step 1: Create projects.ts**

```typescript
import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function listProjects(db: Database.Database, companyId?: string) {
  if (companyId) {
    return db.prepare(`SELECT * FROM projects WHERE company_id = ? AND status != 'archived' ORDER BY updated_at DESC`).all(companyId)
  }
  return db.prepare(`SELECT * FROM projects WHERE status != 'archived' ORDER BY updated_at DESC`).all()
}

export function getProject(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)
}

export function createProject(db: Database.Database, data: { companyId?: string; name: string; description?: string; color?: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO projects (id, company_id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.companyId || null, data.name, data.description || null, data.color || '#6366f1', timestamp, timestamp
  )
  return getProject(db, id)
}

export function updateProject(db: Database.Database, id: string, data: { name?: string; description?: string; color?: string; status?: string }) {
  const sets: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`)
      params.push(value)
    }
  }
  if (sets.length === 0) return getProject(db, id)
  sets.push(`updated_at = ?`)
  params.push(now())
  params.push(id)
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getProject(db, id)
}

export function removeProject(db: Database.Database, id: string) {
  return db.prepare(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`).run(now(), id)
}

export function addProjectSeconds(db: Database.Database, projectId: string, seconds: number) {
  db.prepare(`UPDATE projects SET total_seconds = total_seconds + ?, updated_at = ? WHERE id = ?`).run(seconds, now(), projectId)
}
```

- [ ] **Step 2: Create tasks.ts**

```typescript
import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function listTasksByProject(db: Database.Database, projectId: string) {
  return db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC`).all(projectId)
}

export function getTask(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id)
}

export function createTask(db: Database.Database, data: { projectId: string; name: string; description?: string; priority?: number }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO tasks (id, project_id, name, description, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.projectId, data.name, data.description || null, data.priority || 0, timestamp, timestamp
  )
  return getTask(db, id)
}

export function updateTask(db: Database.Database, id: string, data: { name?: string; description?: string; status?: string; priority?: number }) {
  const sets: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`)
      params.push(value)
    }
  }
  if (sets.length === 0) return getTask(db, id)
  sets.push(`updated_at = ?`)
  params.push(now())
  params.push(id)
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getTask(db, id)
}

export function removeTask(db: Database.Database, id: string) {
  return db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
}
```

- [ ] **Step 3: Create work-sessions.ts**

```typescript
import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function createWorkSession(db: Database.Database, data: { userId: string; projectId: string; taskId?: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO work_sessions (id, user_id, project_id, task_id, start_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.userId, data.projectId, data.taskId || null, timestamp, timestamp, timestamp
  )
  return getWorkSession(db, id)
}

export function getWorkSession(db: Database.Database, id: string) {
  const session = db.prepare(`SELECT * FROM work_sessions WHERE id = ?`).get(id) as any
  if (session) {
    session.tags = db.prepare(`SELECT t.* FROM tags t JOIN work_session_tags wst ON t.id = wst.tag_id WHERE wst.session_id = ?`).all(id)
  }
  return session
}

export function completeWorkSession(db: Database.Database, id: string, data: { effectiveSeconds: number; rawNotes?: string; completedWork?: string; problems?: string; solutions?: string; nextSteps?: string }) {
  db.prepare(`UPDATE work_sessions SET end_time = ?, effective_seconds = ?, raw_notes = ?, completed_work = ?, problems = ?, solutions = ?, next_steps = ?, status = 'completed', updated_at = ? WHERE id = ?`).run(
    now(), data.effectiveSeconds, data.rawNotes || null, data.completedWork || null, data.problems || null, data.solutions || null, data.nextSteps || null, now(), id
  )
  return getWorkSession(db, id)
}

export function listWorkSessions(db: Database.Database, filters?: { userId?: string; projectId?: string; dateFrom?: string; dateTo?: string; limit?: number }) {
  let sql = `SELECT ws.*, p.name as project_name, t.name as task_name FROM work_sessions ws LEFT JOIN projects p ON ws.project_id = p.id LEFT JOIN tasks t ON ws.task_id = t.id WHERE 1=1`
  const params: any[] = []
  if (filters?.userId) { sql += ` AND ws.user_id = ?`; params.push(filters.userId) }
  if (filters?.projectId) { sql += ` AND ws.project_id = ?`; params.push(filters.projectId) }
  if (filters?.dateFrom) { sql += ` AND ws.start_time >= ?`; params.push(filters.dateFrom) }
  if (filters?.dateTo) { sql += ` AND ws.start_time <= ?`; params.push(filters.dateTo + 'T23:59:59.999Z') }
  sql += ` ORDER BY ws.start_time DESC`
  if (filters?.limit) { sql += ` LIMIT ?`; params.push(filters.limit) }
  return db.prepare(sql).all(...params)
}

export function getWorkSessionsByDate(db: Database.Database, date: string, userId?: string) {
  let sql = `SELECT ws.*, p.name as project_name FROM work_sessions ws LEFT JOIN projects p ON ws.project_id = p.id WHERE ws.start_time >= ? AND ws.start_time <= ?`
  const params: any[] = [date + 'T00:00:00.000Z', date + 'T23:59:59.999Z']
  if (userId) { sql += ` AND ws.user_id = ?`; params.push(userId) }
  sql += ` ORDER BY ws.start_time ASC`
  return db.prepare(sql).all(...params)
}

export function getTotalWorkSecondsByDateRange(db: Database.Database, dateFrom: string, dateTo: string, userId?: string) {
  let sql = `SELECT COALESCE(SUM(effective_seconds), 0) as total FROM work_sessions WHERE start_time >= ? AND start_time <= ? AND status = 'completed'`
  const params: any[] = [dateFrom + 'T00:00:00.000Z', dateTo + 'T23:59:59.999Z']
  if (userId) { sql += ` AND user_id = ?`; params.push(userId) }
  return (db.prepare(sql).get(...params) as any).total
}
```

- [ ] **Step 4: Create learning.ts**

```typescript
import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function listCategories(db: Database.Database) {
  return db.prepare(`SELECT * FROM learning_categories ORDER BY sort_order ASC`).all()
}

export function createCategory(db: Database.Database, data: { name: string; icon?: string; color?: string }) {
  const id = generateId()
  db.prepare(`INSERT INTO learning_categories (id, name, icon, color) VALUES (?, ?, ?, ?)`).run(id, data.name, data.icon || '📚', data.color || '#22c55e')
  return db.prepare(`SELECT * FROM learning_categories WHERE id = ?`).get(id)
}

export function listTopics(db: Database.Database, categoryId?: string) {
  if (categoryId) {
    return db.prepare(`SELECT lt.*, lc.name as category_name FROM learning_topics lt JOIN learning_categories lc ON lt.category_id = lc.id WHERE lt.category_id = ? ORDER BY lt.updated_at DESC`).all(categoryId)
  }
  return db.prepare(`SELECT lt.*, lc.name as category_name FROM learning_topics lt JOIN learning_categories lc ON lt.category_id = lc.id ORDER BY lt.updated_at DESC`).all()
}

export function createTopic(db: Database.Database, data: { categoryId: string; name: string; description?: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO learning_topics (id, category_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.categoryId, data.name, data.description || null, timestamp, timestamp)
  return db.prepare(`SELECT * FROM learning_topics WHERE id = ?`).get(id)
}

export function createLearningSession(db: Database.Database, data: { userId: string; topicId: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO learning_sessions (id, user_id, topic_id, start_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.userId, data.topicId, timestamp, timestamp, timestamp)
  return db.prepare(`SELECT * FROM learning_sessions WHERE id = ?`).get(id)
}

export function getLearningSession(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM learning_sessions WHERE id = ?`).get(id)
}

export function completeLearningSession(db: Database.Database, id: string, data: { effectiveSeconds: number; rawNotes?: string; learningContent?: string; gains?: string; questions?: string }) {
  db.prepare(`UPDATE learning_sessions SET end_time = ?, effective_seconds = ?, raw_notes = ?, learning_content = ?, gains = ?, questions = ?, status = 'completed', updated_at = ? WHERE id = ?`).run(
    now(), data.effectiveSeconds, data.rawNotes || null, data.learningContent || null, data.gains || null, data.questions || null, now(), id
  )
  return getLearningSession(db, id)
}

export function listLearningSessions(db: Database.Database, filters?: { userId?: string; topicId?: string; dateFrom?: string; dateTo?: string }) {
  let sql = `SELECT ls.*, lt.name as topic_name, lc.name as category_name FROM learning_sessions ls JOIN learning_topics lt ON ls.topic_id = lt.id JOIN learning_categories lc ON lt.category_id = lc.id WHERE 1=1`
  const params: any[] = []
  if (filters?.userId) { sql += ` AND ls.user_id = ?`; params.push(filters.userId) }
  if (filters?.topicId) { sql += ` AND ls.topic_id = ?`; params.push(filters.topicId) }
  if (filters?.dateFrom) { sql += ` AND ls.start_time >= ?`; params.push(filters.dateFrom) }
  if (filters?.dateTo) { sql += ` AND ls.start_time <= ?`; params.push(filters.dateTo + 'T23:59:59.999Z') }
  sql += ` ORDER BY ls.start_time DESC`
  return db.prepare(sql).all(...params)
}
```

- [ ] **Step 5: Create reports.ts**

```typescript
import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function getDailyReport(db: Database.Database, userId: string, date: string) {
  return db.prepare(`SELECT * FROM daily_reports WHERE user_id = ? AND date = ?`).get(userId, date)
}

export function saveDailyReport(db: Database.Database, data: { userId: string; date: string; contentJson: string; workSeconds: number; learningSeconds: number }) {
  const existing = getDailyReport(db, data.userId, data.date)
  if (existing) {
    db.prepare(`UPDATE daily_reports SET content_json = ?, work_seconds = ?, learning_seconds = ?, created_at = ? WHERE user_id = ? AND date = ?`).run(
      data.contentJson, data.workSeconds, data.learningSeconds, now(), data.userId, data.date
    )
  } else {
    db.prepare(`INSERT INTO daily_reports (id, user_id, date, content_json, work_seconds, learning_seconds) VALUES (?, ?, ?, ?, ?, ?)`).run(
      generateId(), data.userId, data.date, data.contentJson, data.workSeconds, data.learningSeconds
    )
  }
  return getDailyReport(db, data.userId, data.date)
}

export function getWeeklyReport(db: Database.Database, userId: string, year: number, week: number) {
  return db.prepare(`SELECT * FROM weekly_reports WHERE user_id = ? AND year = ? AND week = ?`).get(userId, year, week)
}

export function saveWeeklyReport(db: Database.Database, data: { userId: string; year: number; week: number; contentJson: string; workSeconds: number; learningSeconds: number }) {
  const existing = getWeeklyReport(db, data.userId, data.year, data.week)
  if (existing) {
    db.prepare(`UPDATE weekly_reports SET content_json = ?, work_seconds = ?, learning_seconds = ?, created_at = ? WHERE user_id = ? AND year = ? AND week = ?`).run(
      data.contentJson, data.workSeconds, data.learningSeconds, now(), data.userId, data.year, data.week
    )
  } else {
    db.prepare(`INSERT INTO weekly_reports (id, user_id, year, week, content_json, work_seconds, learning_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      generateId(), data.userId, data.year, data.week, data.contentJson, data.workSeconds, data.learningSeconds
    )
  }
  return getWeeklyReport(db, data.userId, data.year, data.week)
}

export function getMonthlyReport(db: Database.Database, userId: string, year: number, month: number) {
  return db.prepare(`SELECT * FROM monthly_reports WHERE user_id = ? AND year = ? AND month = ?`).get(userId, year, month)
}

export function saveMonthlyReport(db: Database.Database, data: { userId: string; year: number; month: number; contentJson: string; workSeconds: number; learningSeconds: number }) {
  const existing = getMonthlyReport(db, data.userId, data.year, data.month)
  if (existing) {
    db.prepare(`UPDATE monthly_reports SET content_json = ?, work_seconds = ?, learning_seconds = ?, created_at = ? WHERE user_id = ? AND year = ? AND month = ?`).run(
      data.contentJson, data.workSeconds, data.learningSeconds, now(), data.userId, data.year, data.month
    )
  } else {
    db.prepare(`INSERT INTO monthly_reports (id, user_id, year, month, content_json, work_seconds, learning_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      generateId(), data.userId, data.year, data.month, data.contentJson, data.workSeconds, data.learningSeconds
    )
  }
  return getMonthlyReport(db, data.userId, data.year, data.month)
}

export function getDailyStatsForRange(db: Database.Database, userId: string, dateFrom: string, dateTo: string) {
  return db.prepare(`
    SELECT date(ws.start_time) as date, COALESCE(SUM(ws.effective_seconds), 0) as work_seconds
    FROM work_sessions ws WHERE ws.user_id = ? AND ws.start_time >= ? AND ws.start_time <= ? AND ws.status = 'completed'
    GROUP BY date(ws.start_time) ORDER BY date ASC
  `).all(userId, dateFrom + 'T00:00:00.000Z', dateTo + 'T23:59:59.999Z')
}
```

- [ ] **Step 6: Create achievements.ts, settings.ts, users.ts**

For brevity, I'll write all three:

```typescript
// achievements.ts
import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'

export function listAchievements(db: Database.Database) {
  return db.prepare(`SELECT * FROM achievements ORDER BY category, key`).all()
}

export function getUserAchievements(db: Database.Database, userId: string) {
  return db.prepare(`
    SELECT a.*, ua.unlocked_at, ua.notified
    FROM achievements a
    LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
    ORDER BY a.category, a.key
  `).all(userId)
}

export function unlockAchievement(db: Database.Database, userId: string, achievementId: string) {
  const existing = db.prepare(`SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?`).get(userId, achievementId)
  if (existing) return null
  const id = generateId()
  db.prepare(`INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (?, ?, ?)`).run(id, userId, achievementId)
  return db.prepare(`SELECT * FROM achievements WHERE id = ?`).get(achievementId)
}

export function markAchievementNotified(db: Database.Database, userId: string, achievementId: string) {
  db.prepare(`UPDATE user_achievements SET notified = 1 WHERE user_id = ? AND achievement_id = ?`).run(userId, achievementId)
}

export function getUnnotifiedAchievements(db: Database.Database, userId: string) {
  return db.prepare(`
    SELECT a.* FROM achievements a
    JOIN user_achievements ua ON a.id = ua.achievement_id
    WHERE ua.user_id = ? AND ua.notified = 0
  `).all(userId)
}
```

```typescript
// settings.ts
import Database from 'better-sqlite3'
import { now } from '../../utils/time'

export function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as any
  return row?.value
}

export function setSetting(db: Database.Database, key: string, value: string) {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`).run(key, value, now())
}

export function getAllSettings(db: Database.Database) {
  return db.prepare(`SELECT * FROM app_settings`).all()
}
```

```typescript
// users.ts
import Database from 'better-sqlite3'

export function getFirstUser(db: Database.Database) {
  return db.prepare(`SELECT * FROM users LIMIT 1`).get()
}

export function getUser(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id)
}
```

- [ ] **Step 7: Commit**

```bash
git add electron/db/queries/
git commit -m "feat: add all database query modules (projects, tasks, sessions, learning, reports, achievements, settings, users)"
```

---

## Phase 2: Timer Engine

### Task 2.1: Create Timer Engine types

**Files:**
- Create: `electron/timer/types.ts`

- [ ] **Step 1: Write types**

```typescript
export type TimerStatus = 'idle' | 'working' | 'learning' | 'deep_focus' | 'paused'
export type SessionType = 'work' | 'learning'

export interface TimerState {
  status: TimerStatus
  sessionType: SessionType | null
  currentSessionId: string | null
  projectId: string | null
  taskId: string | null
  topicId: string | null
  startTime: string | null
  pausedAt: string | null
  accumulatedPauseMs: number
}

export interface TickPayload {
  status: TimerStatus
  elapsedMs: number
  effectiveMs: number
  todayWorkMinutes: number
  todayLearningMinutes: number
}

export interface SessionResult {
  sessionId: string
  sessionType: SessionType
  projectId?: string
  taskId?: string
  topicId?: string
  startTime: string
  endTime: string
  effectiveSeconds: number
  pausedSeconds: number
}

export interface DailyStats {
  workSeconds: number
  learningSeconds: number
  sessionCount: number
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/timer/types.ts
git commit -m "feat: add Timer Engine type definitions"
```

---

### Task 2.2: Create Timer Engine state manager

**Files:**
- Create: `electron/timer/state.ts`

- [ ] **Step 1: Write state manager**

```typescript
import { TimerState, TimerStatus, SessionType } from './types'

const initialState: TimerState = {
  status: 'idle',
  sessionType: null,
  currentSessionId: null,
  projectId: null,
  taskId: null,
  topicId: null,
  startTime: null,
  pausedAt: null,
  accumulatedPauseMs: 0
}

export class TimerStateManager {
  private state: TimerState = { ...initialState }

  getState(): TimerState {
    return { ...this.state }
  }

  transition(status: TimerStatus, extra?: Partial<TimerState>): TimerState {
    this.state = { ...this.state, ...extra, status }
    return this.getState()
  }

  setIdle(): TimerState {
    this.state = { ...initialState }
    return this.getState()
  }

  setStart(sessionType: SessionType, sessionId: string, extra: { projectId?: string; taskId?: string; topicId?: string }): TimerState {
    this.state = {
      ...initialState,
      status: sessionType === 'work' ? 'working' : 'learning',
      sessionType,
      currentSessionId: sessionId,
      projectId: extra.projectId || null,
      taskId: extra.taskId || null,
      topicId: extra.topicId || null,
      startTime: new Date().toISOString(),
      pausedAt: null,
      accumulatedPauseMs: 0
    }
    return this.getState()
  }

  setPause(): TimerState {
    return this.transition('paused', { pausedAt: new Date().toISOString() })
  }

  setResume(): TimerState {
    // Calculate pause duration
    if (this.state.pausedAt) {
      const pauseMs = Date.now() - new Date(this.state.pausedAt).getTime()
      this.state.accumulatedPauseMs += pauseMs
    }
    this.state.pausedAt = null
    // Return to previous working/learning state
    const prevStatus: TimerStatus = this.state.sessionType === 'learning' ? 'learning' : 'working'
    return this.transition(prevStatus)
  }

  setDeepFocus(): TimerState {
    return this.transition('deep_focus')
  }

  exitDeepFocus(): TimerState {
    const prevStatus: TimerStatus = this.state.sessionType === 'learning' ? 'learning' : 'working'
    return this.transition(prevStatus)
  }

  setReview(): TimerState {
    return this.transition('idle') // UI will show review dialog
  }

  restore(state: TimerState): void {
    this.state = { ...state }
  }

  getElapsedMs(): number {
    if (!this.state.startTime) return 0
    const now = Date.now()
    const startMs = new Date(this.state.startTime).getTime()
    return now - startMs - this.state.accumulatedPauseMs
  }

  validateTransition(from: TimerStatus, to: string): boolean {
    const allowed: Record<TimerStatus, string[]> = {
      idle: ['working', 'learning'],
      working: ['paused', 'deep_focus', 'idle'], // idle = stop → review
      learning: ['paused', 'idle'],
      deep_focus: ['working', 'paused', 'idle'],
      paused: ['working', 'learning', 'idle'] // resume original or stop
    }
    return allowed[from]?.includes(to) ?? false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/timer/state.ts
git commit -m "feat: add Timer State Manager with state transitions"
```

---

### Task 2.3: Create Timer Engine persistence

**Files:**
- Create: `electron/timer/persistence.ts`

- [ ] **Step 1: Write persistence layer**

```typescript
import Database from 'better-sqlite3'
import { TimerState } from './types'
import { generateId } from '../utils/id'

export function saveSnapshot(db: Database.Database, userId: string, state: TimerState): void {
  // 清除旧 snapshot
  db.prepare(`DELETE FROM pulsecore_snapshot`).run()
  // 插入新 snapshot
  db.prepare(`
    INSERT INTO pulsecore_snapshot (id, user_id, state, session_type, session_id, project_id, task_id, topic_id, start_time, paused_at, accumulated_pause_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId(), userId, state.status, state.sessionType, state.currentSessionId,
    state.projectId, state.taskId, state.topicId, state.startTime, state.pausedAt,
    Math.floor(state.accumulatedPauseMs / 1000)
  )
}

export function loadSnapshot(db: Database.Database): { userId: string; state: TimerState } | null {
  const row = db.prepare(`SELECT * FROM pulsecore_snapshot ORDER BY saved_at DESC LIMIT 1`).get() as any
  if (!row) return null
  return {
    userId: row.user_id,
    state: {
      status: row.state,
      sessionType: row.session_type,
      currentSessionId: row.session_id,
      projectId: row.project_id,
      taskId: row.task_id,
      topicId: row.topic_id,
      startTime: row.start_time,
      pausedAt: row.paused_at,
      accumulatedPauseMs: (row.accumulated_pause_seconds || 0) * 1000
    }
  }
}

export function clearSnapshot(db: Database.Database): void {
  db.prepare(`DELETE FROM pulsecore_snapshot`).run()
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/timer/persistence.ts
git commit -m "feat: add Timer Engine persistence (snapshot save/load)"
```

---

### Task 2.4: Create Timer Engine core

**Files:**
- Create: `electron/timer/engine.ts`

- [ ] **Step 1: Write Timer Engine**

```typescript
import Database from 'better-sqlite3'
import { TimerStateManager } from './state'
import { saveSnapshot, loadSnapshot, clearSnapshot } from './persistence'
import { TimerState, TickPayload, SessionResult, DailyStats } from './types'
import { getFirstUser } from '../db/queries/users'
import { createWorkSession, completeWorkSession } from '../db/queries/work-sessions'
import { createLearningSession, completeLearningSession } from '../db/queries/learning'
import { addProjectSeconds } from '../db/queries/projects'
import { getTodayDate, isWithin24Hours } from '../utils/time'
import { logger } from '../utils/logger'
import { BrowserWindow } from 'electron'

type TickHandler = (payload: TickPayload) => void
type StateChangeHandler = (state: TimerState) => void

export class TimerEngine {
  private stateManager = new TimerStateManager()
  private tickHandlers: TickHandler[] = []
  private stateChangeHandlers: StateChangeHandler[] = []
  private intervalId: NodeJS.Timeout | null = null
  private snapshotIntervalId: NodeJS.Timeout | null = null
  private db: Database.Database
  private userId: string | null = null

  constructor(db: Database.Database) {
    this.db = db
    const user = getFirstUser(db) as any
    if (user) this.userId = user.id
  }

  // IPC 事件订阅
  onTick(handler: TickHandler): void { this.tickHandlers.push(handler) }
  onStateChange(handler: StateChangeHandler): void { this.stateChangeHandlers.push(handler) }

  private broadcastTick(): void {
    const state = this.stateManager.getState()
    const effectiveMs = this.stateManager.getElapsedMs()
    const payload: TickPayload = {
      status: state.status,
      elapsedMs: state.startTime ? Date.now() - new Date(state.startTime).getTime() : 0,
      effectiveMs,
      todayWorkMinutes: this.getTodayStats().workSeconds / 60,
      todayLearningMinutes: this.getTodayStats().learningSeconds / 60
    }
    this.tickHandlers.forEach(h => h(payload))
  }

  private broadcastStateChange(): void {
    const state = this.stateManager.getState()
    this.stateChangeHandlers.forEach(h => h(state))
  }

  private startTickLoop(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.broadcastTick(), 1000)
    this.snapshotIntervalId = setInterval(() => this.saveSnapshot(), 5000)
  }

  private stopTickLoop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
    if (this.snapshotIntervalId) { clearInterval(this.snapshotIntervalId); this.snapshotIntervalId = null }
  }

  // 公开 API
  getState(): TimerState { return this.stateManager.getState() }

  getTodayStats(): DailyStats {
    const today = getTodayDate()
    const workRow = this.db.prepare(`SELECT COALESCE(SUM(effective_seconds), 0) as total FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(this.userId, today) as any
    const learnRow = this.db.prepare(`SELECT COALESCE(SUM(effective_seconds), 0) as total FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(this.userId, today) as any
    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM (SELECT id FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed' UNION ALL SELECT id FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed')`).get(this.userId, today, this.userId, today) as any
    return { workSeconds: workRow.total, learningSeconds: learnRow.total, sessionCount: countRow.count }
  }

  startWork(projectId: string, taskId?: string): TimerState {
    if (!this.userId) throw new Error('No user found')
    const session = createWorkSession(this.db, { userId: this.userId, projectId, taskId }) as any
    const state = this.stateManager.setStart('work', session.id, { projectId, taskId })
    this.startTickLoop()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: start work', { projectId, taskId, sessionId: session.id })
    return state
  }

  startLearning(topicId: string): TimerState {
    if (!this.userId) throw new Error('No user found')
    const session = createLearningSession(this.db, { userId: this.userId, topicId }) as any
    const state = this.stateManager.setStart('learning', session.id, { topicId })
    this.startTickLoop()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: start learning', { topicId, sessionId: session.id })
    return state
  }

  pause(): TimerState {
    const state = this.stateManager.setPause()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: paused')
    return state
  }

  resume(): TimerState {
    const state = this.stateManager.setResume()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: resumed')
    return state
  }

  stop(): SessionResult {
    const state = this.stateManager.getState()
    const effectiveMs = this.stateManager.getElapsedMs()
    const effectiveSeconds = Math.floor(effectiveMs / 1000)
    const pausedSeconds = Math.floor(state.accumulatedPauseMs / 1000)

    this.stopTickLoop()

    let result: SessionResult
    if (state.sessionType === 'work' && state.currentSessionId) {
      const session = completeWorkSession(this.db, state.currentSessionId, { effectiveSeconds }) as any
      addProjectSeconds(this.db, state.projectId!, effectiveSeconds)
      result = {
        sessionId: state.currentSessionId,
        sessionType: 'work',
        projectId: state.projectId!,
        taskId: state.taskId!,
        startTime: state.startTime!,
        endTime: new Date().toISOString(),
        effectiveSeconds,
        pausedSeconds
      }
    } else if (state.sessionType === 'learning' && state.currentSessionId) {
      const session = completeLearningSession(this.db, state.currentSessionId, { effectiveSeconds }) as any
      result = {
        sessionId: state.currentSessionId,
        sessionType: 'learning',
        topicId: state.topicId!,
        startTime: state.startTime!,
        endTime: new Date().toISOString(),
        effectiveSeconds,
        pausedSeconds
      }
    } else {
      throw new Error('No active session to stop')
    }

    this.stateManager.setIdle()
    this.broadcastStateChange()
    clearSnapshot(this.db)
    logger.info('Timer: stopped', result)
    return result
  }

  saveSnapshot(): void {
    if (!this.userId) return
    const state = this.stateManager.getState()
    if (state.status !== 'idle') {
      saveSnapshot(this.db, this.userId, state)
    }
  }

  async recoverFromSnapshot(): Promise<boolean> {
    const snapshot = loadSnapshot(this.db)
    if (!snapshot || snapshot.state.status === 'idle') return false

    // 检查是否在 24 小时内
    if (!isWithin24Hours(snapshot.state.startTime!)) {
      // 过期，自动结束
      clearSnapshot(this.db)
      logger.info('Timer: expired snapshot cleared')
      return false
    }

    // 恢复状态
    this.userId = snapshot.userId
    this.stateManager.restore(snapshot.state)
    this.startTickLoop()
    this.broadcastStateChange()
    logger.info('Timer: recovered from snapshot', snapshot.state)
    return true
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/timer/engine.ts
git commit -m "feat: add Timer Engine core with tick loop, persistence, and crash recovery"
```

---

The plan continues with Phase 3-8. Due to length constraints, let me continue appending to the file.

---

## Phase 3: AI Provider

### Task 3.1: Create AI Provider types and interface

**Files:**
- Create: `electron/ai/types.ts`
- Create: `electron/ai/provider.ts`

- [ ] **Step 1: Write types**

```typescript
// electron/ai/types.ts
export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxTokens?: number
  temperature?: number
}

export interface SummarizeInput {
  type: 'work' | 'learning'
  projectName?: string
  taskName?: string
  topicName?: string
  categoryName?: string
  durationMinutes: number
  rawNotes: string
  userAnswers: {
    completed?: string
    problems?: string
    solutions?: string
    nextSteps?: string
    learningContent?: string
    gains?: string
    questions?: string
  }
}

export interface SummarizeOutput {
  completedWork: string[]
  problems: string[]
  solutions: string[]
  knowledgeGained: string[]
  nextSteps: string[]
  tags: string[]
  summary: string
  isMilestone: boolean
  canGenerateAchievement: boolean
  providerName: string
  model: string
  tokensUsed: { prompt: number; completion: number }
}

export interface ReportInput {
  type: 'daily' | 'weekly' | 'monthly'
  date: string
  stats: {
    workSeconds: number
    learningSeconds: number
    projectBreakdown: { projectName: string; seconds: number }[]
    topicBreakdown: { topicName: string; categoryName: string; seconds: number }[]
    completedItems: string[]
    problems: string[]
    solutions: string[]
  }
  previousReportSummary?: string
}

export interface ReportOutput {
  title: string
  sections: { heading: string; body: string }[]
  fullMarkdown: string
  tokensUsed: { prompt: number; completion: number }
}

export interface AIProvider {
  readonly name: string
  readonly displayName: string
  readonly models: string[]
  configure(config: ProviderConfig): void
  validateConnection(): Promise<{ ok: boolean; error?: string }>
  summarize(input: SummarizeInput): Promise<SummarizeOutput>
  generateReport(input: ReportInput): Promise<ReportOutput>
}
```

- [ ] **Step 2: Write provider abstract class**

```typescript
// electron/ai/provider.ts
import { AIProvider, ProviderConfig, SummarizeInput, SummarizeOutput, ReportInput, ReportOutput } from './types'

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string
  abstract readonly displayName: string
  abstract readonly models: string[]
  protected config: ProviderConfig = { apiKey: '', baseUrl: '', model: '', maxTokens: 4096, temperature: 0.3 }

  configure(config: ProviderConfig): void {
    this.config = { ...this.config, ...config }
  }

  abstract validateConnection(): Promise<{ ok: boolean; error?: string }>
  abstract summarize(input: SummarizeInput): Promise<SummarizeOutput>
  abstract generateReport(input: ReportInput): Promise<ReportOutput>

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }
  }

  protected async fetchWithRetry(url: string, body: any, retries = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000)
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`API error ${response.status}: ${text}`)
        }
        return response.json()
      } catch (err) {
        if (attempt === retries) throw err
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/ai/types.ts electron/ai/provider.ts
git commit -m "feat: add AI Provider interface and base class"
```

---

### Task 3.2: Create DeepSeek Provider

**Files:**
- Create: `electron/ai/deepseek.ts`

- [ ] **Step 1: Write DeepSeekProvider**

```typescript
// electron/ai/deepseek.ts
import { BaseAIProvider } from './provider'
import { SummarizeInput, SummarizeOutput, ReportInput, ReportOutput } from './types'

export class DeepSeekProvider extends BaseAIProvider {
  readonly name = 'deepseek'
  readonly displayName = 'DeepSeek'
  readonly models = ['deepseek-chat', 'deepseek-coder']

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000)
      })
      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `${res.status}: ${text}` }
      }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    const systemPrompt = this.buildSummarizeSystemPrompt(input)
    const userPrompt = this.buildSummarizeUserPrompt(input)

    const result = await this.fetchWithRetry(
      `${this.config.baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.3,
        response_format: { type: 'json_object' }
      }
    )

    const content = result.choices[0].message.content
    const parsed = JSON.parse(content)

    return {
      completedWork: parsed.completed_work || [],
      problems: parsed.problems || [],
      solutions: parsed.solutions || [],
      knowledgeGained: parsed.knowledge_gained || [],
      nextSteps: parsed.next_steps || [],
      tags: parsed.tags || [],
      summary: parsed.summary || '',
      isMilestone: parsed.is_milestone || false,
      canGenerateAchievement: parsed.can_generate_achievement || false,
      providerName: this.name,
      model: this.config.model,
      tokensUsed: {
        prompt: result.usage?.prompt_tokens || 0,
        completion: result.usage?.completion_tokens || 0
      }
    }
  }

  async generateReport(input: ReportInput): Promise<ReportOutput> {
    const systemPrompt = this.buildReportSystemPrompt(input)
    const userPrompt = this.buildReportUserPrompt(input)

    const result = await this.fetchWithRetry(
      `${this.config.baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.5,
        response_format: { type: 'json_object' }
      }
    )

    const content = result.choices[0].message.content
    const parsed = JSON.parse(content)

    return {
      title: parsed.title || '',
      sections: parsed.sections || [],
      fullMarkdown: this.sectionsToMarkdown(parsed.title || '', parsed.sections || []),
      tokensUsed: {
        prompt: result.usage?.prompt_tokens || 0,
        completion: result.usage?.completion_tokens || 0
      }
    }
  }

  private buildSummarizeSystemPrompt(input: SummarizeInput): string {
    const typeLabel = input.type === 'work' ? '工作' : '学习'
    return `你是一个专业的${typeLabel}总结助手。用户完成了一段${typeLabel}，现在需要你帮助总结。
请根据用户的复盘内容，提取结构化信息，输出 JSON 格式。

输出 JSON schema:
{
  "completed_work": ["完成内容1", "完成内容2"],
  "problems": ["遇到的问题"],
  "solutions": ["解决方案"],
  "knowledge_gained": ["学到的知识点"],
  "next_steps": ["下一步计划"],
  "tags": ["标签1", "标签2"],
  "summary": "一段话总结",
  "is_milestone": false,
  "can_generate_achievement": false
}`
  }

  private buildSummarizeUserPrompt(input: SummarizeInput): string {
    const typeLabel = input.type === 'work' ? '研发' : '学习'
    return `请总结以下${typeLabel}记录：

项目${input.type === 'work' ? `: ${input.projectName || '未知'}` : ''}
${input.type === 'work' ? `任务: ${input.taskName || '无'}` : `知识主题: ${input.topicName || '未知'}`}
时长: ${input.durationMinutes} 分钟

用户复盘内容:
${input.rawNotes}

完成内容: ${input.userAnswers.completed || '无'}
遇到的问题: ${input.userAnswers.problems || '无'}
解决方案: ${input.userAnswers.solutions || '无'}
${input.type === 'work' ? `下一步计划: ${input.userAnswers.nextSteps || '无'}` : `学习收获: ${input.userAnswers.gains || '无'}\n疑问: ${input.userAnswers.questions || '无'}`}

请根据以上内容生成结构化的总结 JSON。`
  }

  private buildReportSystemPrompt(input: ReportInput): string {
    const typeLabel = input.type === 'daily' ? '日报' : input.type === 'weekly' ? '周报' : '月报'
    return `你是一个专业的${typeLabel}生成助手。请根据提供的统计数据生成一份结构清晰的${typeLabel}。

输出 JSON schema:
{
  "title": "报告标题",
  "sections": [
    { "heading": "章节标题", "body": "Markdown 内容" }
  ]
}

要求：内容简洁务实，突出成果和关键问题，用 Markdown 格式。`
  }

  private buildReportUserPrompt(input: ReportInput): string {
    const typeLabel = input.type === 'daily' ? '今日' : input.type === 'weekly' ? '本周' : '本月'
    return `请生成${typeLabel}研发报告：

- ${typeLabel}研发总时长: ${Math.floor(input.stats.workSeconds / 3600)}h ${Math.floor((input.stats.workSeconds % 3600) / 60)}m
- ${typeLabel}学习总时长: ${Math.floor(input.stats.learningSeconds / 3600)}h ${Math.floor((input.stats.learningSeconds % 3600) / 60)}m
- 项目分布: ${input.stats.projectBreakdown.map(p => `${p.projectName}(${Math.round(p.seconds / 60)}m)`).join(', ')}
- 学习分布: ${input.stats.topicBreakdown.map(t => `${t.topicName}(${Math.round(t.seconds / 60)}m)`).join(', ')}
- 完成内容: ${input.stats.completedItems.join('; ')}
- 遇到的问题: ${input.stats.problems.join('; ')}
- 解决方案: ${input.stats.solutions.join('; ')}

${input.previousReportSummary ? `上一期报告摘要: ${input.previousReportSummary}` : ''}`
  }

  private sectionsToMarkdown(title: string, sections: { heading: string; body: string }[]): string {
    let md = `# ${title}\n\n`
    for (const s of sections) {
      md += `## ${s.heading}\n\n${s.body}\n\n`
    }
    return md
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ai/deepseek.ts
git commit -m "feat: add DeepSeek AI Provider implementation"
```

---

### Task 3.3: Create AI Provider Registry

**Files:**
- Create: `electron/ai/registry.ts`

- [ ] **Step 1: Write Registry**

```typescript
import Database from 'better-sqlite3'
import { AIProvider, SummarizeInput, SummarizeOutput, ReportInput, ReportOutput } from './types'
import { DeepSeekProvider } from './deepseek'
import { getSetting, setSetting } from '../db/queries/settings'
import { generateId } from '../utils/id'
import { logger } from '../utils/logger'

export class AIProviderRegistry {
  private providers: Map<string, AIProvider> = new Map()
  private activeProviderName: string = 'deepseek'
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
    this.register(new DeepSeekProvider())
    this.loadConfig()
  }

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider)
  }

  getActive(): AIProvider {
    const p = this.providers.get(this.activeProviderName)
    if (!p) throw new Error(`Provider "${this.activeProviderName}" not found`)
    return p
  }

  setActive(name: string): void {
    if (!this.providers.has(name)) throw new Error(`Unknown provider: ${name}`)
    this.activeProviderName = name
    setSetting(this.db, 'ai_active_provider', name)
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values())
  }

  private loadConfig(): void {
    const savedActiveProvider = getSetting(this.db, 'ai_active_provider')
    if (savedActiveProvider && this.providers.has(savedActiveProvider)) {
      this.activeProviderName = savedActiveProvider
    }
    const apiKey = getSetting(this.db, 'ai_api_key') || ''
    const baseUrl = getSetting(this.db, 'ai_base_url') || 'https://api.deepseek.com/v1'
    const model = getSetting(this.db, 'ai_model') || 'deepseek-chat'

    const provider = this.getActive()
    provider.configure({ apiKey, baseUrl, model })
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    return this.getActive().validateConnection()
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    try {
      const result = await this.getActive().summarize(input)
      // 记录 AI 总结到数据库
      this.db.prepare(`INSERT INTO ai_summaries (id, session_type, session_id, provider, model, prompt_tokens, completion_tokens, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        generateId(), input.type, '', this.activeProviderName, this.getActive().models[0],
        result.tokensUsed.prompt, result.tokensUsed.completion, JSON.stringify(result)
      )
      return result
    } catch (err: any) {
      logger.error('AI summarize failed:', err.message)
      throw err
    }
  }

  async generateReport(input: ReportInput): Promise<ReportOutput> {
    return this.getActive().generateReport(input)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ai/registry.ts
git commit -m "feat: add AI Provider Registry with config persistence"
```

---

## Phase 4: Report Generator

### Task 4.1: Create Report Generator

**Files:**
- Create: `electron/report/types.ts`
- Create: `electron/report/generator.ts`
- Create: `electron/report/daily.ts`
- Create: `electron/report/weekly.ts`
- Create: `electron/report/monthly.ts`
- Create: `electron/report/export.ts`

- [ ] **Step 1: Write types.ts**

```typescript
export interface DailyReportData {
  date: string
  totalWorkMinutes: number
  totalLearningMinutes: number
  sessionCount: number
  streakDays: number
  projectBreakdown: { projectId: string; projectName: string; minutes: number; tasks: { taskName: string; minutes: number }[]; completedItems: string[] }[]
  learningBreakdown: { categoryName: string; topicName: string; minutes: number; gains: string[]; questions: string[] }[]
  aiSummary: string
  highlights: string[]
  problemsBlockers: string[]
  tomorrowPlan: string[]
  timeline: { time: string; type: string; description: string }[]
  createdAt: string
}

export interface WeeklyReportData {
  year: number; week: number
  totalWorkMinutes: number; totalLearningMinutes: number
  activeDays: number; avgWorkPerDay: number; avgLearningPerDay: number
  dailyTrend: { date: string; workMinutes: number; learningMinutes: number }[]
  projectDistribution: { projectName: string; minutes: number; percentage: number; completedTasks: number; totalTasks: number; progress: string }[]
  learningDistribution: { categoryName: string; minutes: number; percentage: number; topicsCount: number }[]
  weekSummary: string; keyAchievements: string[]; blockers: string[]
  knowledgeDeposited: string[]; nextWeekPlan: string[]
  createdAt: string
}

export interface MonthlyReportData {
  year: number; month: number
  totalWorkMinutes: number; totalLearningMinutes: number
  activeDays: number; avgWorkPerDay: number; avgLearningPerDay: number
  weeklyTrend: { week: number; workMinutes: number; learningMinutes: number }[]
  projectDistribution: { projectName: string; minutes: number; percentage: number; progress: string; milestones: string[] }[]
  learningDistribution: { categoryName: string; minutes: number; percentage: number }[]
  monthSummary: string; achievements: string[]; growthAreas: string[]
  reflections: string; nextMonthPlan: string
  heatmap: { date: string; workMinutes: number; learningMinutes: number }[]
  createdAt: string
}
```

- [ ] **Step 2: Write generator.ts**

```typescript
import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { generateDailyReport } from './daily'
import { generateWeeklyReport } from './weekly'
import { generateMonthlyReport } from './monthly'
import { getTodayDate, getISOWeek } from '../utils/time'
import { getFirstUser } from '../db/queries/users'

export class ReportGenerator {
  private db: Database.Database
  private aiRegistry: AIProviderRegistry

  constructor(db: Database.Database, aiRegistry: AIProviderRegistry) {
    this.db = db
    this.aiRegistry = aiRegistry
  }

  getUserId(): string {
    const user = getFirstUser(this.db) as any
    if (!user) throw new Error('No user found')
    return user.id
  }

  async generateDaily(date?: string) {
    return generateDailyReport(this.db, this.aiRegistry, this.getUserId(), date || getTodayDate())
  }

  async generateWeekly(year?: number, week?: number) {
    const now = getISOWeek(new Date())
    return generateWeeklyReport(this.db, this.aiRegistry, this.getUserId(), year || now.year, week || now.week)
  }

  async generateMonthly(year?: number, month?: number) {
    const now = new Date()
    return generateMonthlyReport(this.db, this.aiRegistry, this.getUserId(), year || now.getFullYear(), month || (now.getMonth() + 1))
  }

  async updateDailyStats(date: string) {
    // 增量更新当日日报统计数据（不含 AI 综述）
    return generateDailyReport(this.db, this.aiRegistry, this.getUserId(), date, true)
  }
}
```

- [ ] **Step 3: Write daily.ts, weekly.ts, monthly.ts, export.ts**

```typescript
// daily.ts
import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { getWorkSessionsByDate } from '../db/queries/work-sessions'
import { listLearningSessions } from '../db/queries/learning'
import { saveDailyReport, getDailyReport } from '../db/queries/reports'
import { DailyReportData } from './types'

export async function generateDailyReport(
  db: Database.Database, ai: AIProviderRegistry, userId: string, date: string, statsOnly = false
): Promise<DailyReportData> {
  const workSessions = getWorkSessionsByDate(db, date, userId) as any[]
  const learningSessions = listLearningSessions(db, { userId, dateFrom: date, dateTo: date }) as any[]

  const totalWorkSeconds = workSessions.reduce((sum: number, s: any) => sum + (s.effective_seconds || 0), 0)
  const totalLearningSeconds = learningSessions.reduce((sum: number, s: any) => sum + (s.effective_seconds || 0), 0)

  // 项目分布
  const projMap = new Map<string, any>()
  for (const s of workSessions) {
    const p = projMap.get(s.project_id) || { projectId: s.project_id, projectName: s.project_name, minutes: 0, completedItems: [] }
    p.minutes += Math.round((s.effective_seconds || 0) / 60)
    if (s.completed_work) p.completedItems.push(s.completed_work)
    projMap.set(s.project_id, p)
  }

  // 学习分布
  const learnMap = new Map<string, any>()
  for (const s of learningSessions) {
    const key = `${s.category_name}::${s.topic_name}`
    const l = learnMap.get(key) || { categoryName: s.category_name, topicName: s.topic_name, minutes: 0, gains: [], questions: [] }
    l.minutes += Math.round((s.effective_seconds || 0) / 60)
    if (s.gains) l.gains.push(s.gains)
    if (s.questions) l.questions.push(s.questions)
    learnMap.set(key, l)
  }

  const projectBreakdown = Array.from(projMap.values()).map(p => ({ ...p, tasks: [] }))
  const learningBreakdown = Array.from(learnMap.values())

  // 完成内容和问题汇总
  const completedItems = workSessions.filter((s: any) => s.completed_work).map((s: any) => s.completed_work)
  const problems = workSessions.filter((s: any) => s.problems).map((s: any) => s.problems)
  const solutions = workSessions.filter((s: any) => s.solutions).map((s: any) => s.solutions)

  // 计算连续天数
  const streakDays = calculateStreak(db, userId, date)

  // 时间线
  const timeline = buildTimeline(workSessions, learningSessions)

  const reportData: DailyReportData = {
    date,
    totalWorkMinutes: Math.round(totalWorkSeconds / 60),
    totalLearningMinutes: Math.round(totalLearningSeconds / 60),
    sessionCount: workSessions.length + learningSessions.length,
    streakDays,
    projectBreakdown,
    learningBreakdown,
    aiSummary: '', highlights: [], problemsBlockers: [], tomorrowPlan: [],
    timeline,
    createdAt: new Date().toISOString()
  }

  // 如果是 statsOnly，只更新统计部分
  if (statsOnly) {
    const existing = getDailyReport(db, userId, date) as any
    if (existing) {
      const existingData = JSON.parse(existing.content_json)
      reportData.aiSummary = existingData.aiSummary
      reportData.highlights = existingData.highlights
      reportData.problemsBlockers = existingData.problemsBlockers
      reportData.tomorrowPlan = existingData.tomorrowPlan
    }
  } else {
    // 调用 AI 生成综述
    try {
      const aiResult = await ai.generateReport({
        type: 'daily', date,
        stats: {
          workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds,
          projectBreakdown: projectBreakdown.map(p => ({ projectName: p.projectName, seconds: p.minutes * 60 })),
          topicBreakdown: learningBreakdown.map(l => ({ topicName: l.topicName, categoryName: l.categoryName, seconds: l.minutes * 60 })),
          completedItems, problems, solutions
        }
      })
      const summarySection = aiResult.sections.find((s: any) => s.heading.includes('综述'))
      reportData.aiSummary = summarySection?.body || aiResult.fullMarkdown
    } catch {
      reportData.aiSummary = 'AI 总结生成失败，请稍后重试。'
    }
  }

  saveDailyReport(db, { userId, date, contentJson: JSON.stringify(reportData), workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds })
  return reportData
}

function calculateStreak(db: Database.Database, userId: string, dateStr: string): number {
  let streak = 0
  const current = new Date(dateStr)
  while (true) {
    const d = current.toISOString().slice(0, 10)
    const workRow = db.prepare(`SELECT COUNT(*) as c FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(userId, d) as any
    const learnRow = db.prepare(`SELECT COUNT(*) as c FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(userId, d) as any
    if (workRow.c === 0 && learnRow.c === 0) break
    streak++
    current.setDate(current.getDate() - 1)
  }
  return streak
}

function buildTimeline(workSessions: any[], learningSessions: any[]) {
  const events: { time: string; type: string; description: string }[] = []
  for (const s of workSessions) {
    events.push({ time: s.start_time.slice(11, 16), type: 'work_start', description: `开始工作: ${s.project_name}` })
    if (s.end_time) events.push({ time: s.end_time.slice(11, 16), type: 'work_end', description: `结束工作: ${s.project_name} (${Math.round((s.effective_seconds || 0) / 60)}m)` })
  }
  for (const s of learningSessions) {
    events.push({ time: s.start_time.slice(11, 16), type: 'learning_start', description: `开始学习: ${s.topic_name}` })
    if (s.end_time) events.push({ time: s.end_time.slice(11, 16), type: 'learning_end', description: `结束学习: ${s.topic_name} (${Math.round((s.effective_seconds || 0) / 60)}m)` })
  }
  events.sort((a, b) => a.time.localeCompare(b.time))
  return events
}
```

The weekly.ts, monthly.ts follow the same pattern with weekly/monthly aggregation. The export.ts converts reports to Markdown string.

- [ ] **Step 4: Commit**

```bash
git add electron/report/
git commit -m "feat: add Report Generator (daily/weekly/monthly + markdown export)"
```

---

## Phase 5: IPC Handlers & Main Process Integration

### Task 5.1: Create IPC handlers

**Files:**
- Create: `electron/ipc-handlers.ts`

- [ ] **Step 1: Write all IPC handlers**

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { timerEngine } from './main'
import { getDatabase } from './db/connection'
import * as ProjectQueries from './db/queries/projects'
import * as TaskQueries from './db/queries/tasks'
import * as WorkSessionQueries from './db/queries/work-sessions'
import * as LearningQueries from './db/queries/learning'
import * as ReportQueries from './db/queries/reports'
import * as AchievementQueries from './db/queries/achievements'
import * as SettingsQueries from './db/queries/settings'

export function initIpcHandlers(): void {
  const db = getDatabase()

  // ---- Timer ----
  ipcMain.handle('timer:start-work', (_e, projectId: string, taskId?: string) => timerEngine.startWork(projectId, taskId))
  ipcMain.handle('timer:start-learning', (_e, topicId: string) => timerEngine.startLearning(topicId))
  ipcMain.handle('timer:pause', () => timerEngine.pause())
  ipcMain.handle('timer:resume', () => timerEngine.resume())
  ipcMain.handle('timer:stop', () => timerEngine.stop())
  ipcMain.handle('timer:get-state', () => timerEngine.getState())
  ipcMain.handle('timer:get-today-stats', () => timerEngine.getTodayStats())

  // Timer events: 转发 tick 和 state-change 到 PulseCore 窗口
  timerEngine.onTick((payload) => {
    BrowserWindow.getAllWindows().forEach(win => win.webContents.send('timer:tick', payload))
  })
  timerEngine.onStateChange((state) => {
    BrowserWindow.getAllWindows().forEach(win => win.webContents.send('timer:state-change', state))
  })

  // ---- Projects ----
  ipcMain.handle('projects:list', (_e, companyId?: string) => ProjectQueries.listProjects(db, companyId))
  ipcMain.handle('projects:get', (_e, id: string) => ProjectQueries.getProject(db, id))
  ipcMain.handle('projects:create', (_e, data: any) => ProjectQueries.createProject(db, data))
  ipcMain.handle('projects:update', (_e, id: string, data: any) => ProjectQueries.updateProject(db, id, data))
  ipcMain.handle('projects:remove', (_e, id: string) => ProjectQueries.removeProject(db, id))

  // ---- Tasks ----
  ipcMain.handle('tasks:list-by-project', (_e, projectId: string) => TaskQueries.listTasksByProject(db, projectId))
  ipcMain.handle('tasks:create', (_e, data: any) => TaskQueries.createTask(db, data))
  ipcMain.handle('tasks:update', (_e, id: string, data: any) => TaskQueries.updateTask(db, id, data))
  ipcMain.handle('tasks:remove', (_e, id: string) => TaskQueries.removeTask(db, id))

  // ---- Learning ----
  ipcMain.handle('learning:list-categories', () => LearningQueries.listCategories(db))
  ipcMain.handle('learning:create-category', (_e, data: any) => LearningQueries.createCategory(db, data))
  ipcMain.handle('learning:list-topics', (_e, categoryId?: string) => LearningQueries.listTopics(db, categoryId))
  ipcMain.handle('learning:create-topic', (_e, data: any) => LearningQueries.createTopic(db, data))

  // ---- Sessions ----
  ipcMain.handle('sessions:list-work', (_e, filters?: any) => WorkSessionQueries.listWorkSessions(db, filters))
  ipcMain.handle('sessions:list-learning', (_e, filters?: any) => LearningQueries.listLearningSessions(db, filters))
  ipcMain.handle('sessions:get-work', (_e, id: string) => WorkSessionQueries.getWorkSession(db, id))
  ipcMain.handle('sessions:get-learning', (_e, id: string) => LearningQueries.getLearningSession(db, id))
  ipcMain.handle('sessions:save-review', (_e, id: string, type: string, data: any) => {
    if (type === 'work') return WorkSessionQueries.completeWorkSession(db, id, data)
    return LearningQueries.completeLearningSession(db, id, data)
  })

  // ---- AI ----
  ipcMain.handle('ai:summarize', async (_e, input: any) => {
    const { aiRegistry } = await import('./main')
    return aiRegistry.summarize(input)
  })
  ipcMain.handle('ai:generate-report', async (_e, input: any) => {
    const { aiRegistry } = await import('./main')
    return aiRegistry.generateReport(input)
  })
  ipcMain.handle('ai:validate-connection', async () => {
    const { aiRegistry } = await import('./main')
    return aiRegistry.validateConnection()
  })
  ipcMain.handle('ai:get-settings', () => ({
    activeProvider: SettingsQueries.getSetting(db, 'ai_active_provider') || 'deepseek',
    apiKey: SettingsQueries.getSetting(db, 'ai_api_key') || '',
    baseUrl: SettingsQueries.getSetting(db, 'ai_base_url') || 'https://api.deepseek.com/v1',
    model: SettingsQueries.getSetting(db, 'ai_model') || 'deepseek-chat'
  }))
  ipcMain.handle('ai:save-settings', (_e, settings: any) => {
    if (settings.apiKey) SettingsQueries.setSetting(db, 'ai_api_key', settings.apiKey)
    if (settings.baseUrl) SettingsQueries.setSetting(db, 'ai_base_url', settings.baseUrl)
    if (settings.model) SettingsQueries.setSetting(db, 'ai_model', settings.model)
    if (settings.provider) SettingsQueries.setSetting(db, 'ai_active_provider', settings.provider)
    return { ok: true }
  })

  // ---- Reports ----
  ipcMain.handle('reports:get-daily', (_e, date: string) => {
    const uid = require('./db/queries/users').getFirstUser(db).id
    return ReportQueries.getDailyReport(db, uid, date)
  })
  ipcMain.handle('reports:generate-daily', async (_e, date: string) => {
    const { reportGenerator } = await import('./main')
    return reportGenerator.generateDaily(date)
  })
  ipcMain.handle('reports:get-weekly', (_e, year: number, week: number) => {
    const uid = require('./db/queries/users').getFirstUser(db).id
    return ReportQueries.getWeeklyReport(db, uid, year, week)
  })
  ipcMain.handle('reports:generate-weekly', async (_e, year: number, week: number) => {
    const { reportGenerator } = await import('./main')
    return reportGenerator.generateWeekly(year, week)
  })
  ipcMain.handle('reports:get-monthly', (_e, year: number, month: number) => {
    const uid = require('./db/queries/users').getFirstUser(db).id
    return ReportQueries.getMonthlyReport(db, uid, year, month)
  })
  ipcMain.handle('reports:generate-monthly', async (_e, year: number, month: number) => {
    const { reportGenerator } = await import('./main')
    return reportGenerator.generateMonthly(year, month)
  })
  ipcMain.handle('reports:export-markdown', (_e, reportId: string, type: string) => {
    let report
    if (type === 'daily') report = ReportQueries.getDailyReport(db, reportId, reportId)
    else if (type === 'weekly') report = db.prepare('SELECT * FROM weekly_reports WHERE id = ?').get(reportId)
    else report = db.prepare('SELECT * FROM monthly_reports WHERE id = ?').get(reportId)
    if (!report) return ''
    const data = JSON.parse((report as any).content_json)
    const { exportToMarkdown } = require('./report/export')
    return exportToMarkdown(data, type)
  })

  // ---- Achievements ----
  ipcMain.handle('achievements:list-all', () => AchievementQueries.listAchievements(db))
  ipcMain.handle('achievements:list-unlocked', () => {
    const uid = require('./db/queries/users').getFirstUser(db).id
    return AchievementQueries.getUserAchievements(db, uid)
  })
  ipcMain.handle('achievements:check', () => {
    const uid = require('./db/queries/users').getFirstUser(db).id
    return AchievementQueries.getUnnotifiedAchievements(db, uid)
  })

  // ---- Settings ----
  ipcMain.handle('settings:get', (_e, key: string) => SettingsQueries.getSetting(db, key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => SettingsQueries.setSetting(db, key, value))
  ipcMain.handle('settings:get-all', () => SettingsQueries.getAllSettings(db))

  // ---- Window ----
  ipcMain.handle('window:open-gui', () => {
    const { createGuiWindow } = require('./windows')
    createGuiWindow()
  })

  // ---- App ----
  ipcMain.handle('app:get-mode', () => SettingsQueries.getSetting(db, 'app_mode') || 'solo')
  ipcMain.handle('app:set-mode', (_e, mode: string) => {
    SettingsQueries.setSetting(db, 'app_mode', mode)
    return mode
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc-handlers.ts
git commit -m "feat: add IPC handlers for all modules (timer, projects, tasks, learning, sessions, AI, reports, achievements)"
```

---

## Phase 6: PulseCore UI (React Renderer)

### Task 6.1: Create PulseCore React entry and shared lib

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/ipc.ts`
- Create: `src/lib/time.ts`
- Create: `src/pulsecore/main.tsx`
- Create: `src/pulsecore/App.tsx`

- [ ] **Step 1: Create lib/types.ts**

```typescript
export interface Project {
  id: string; company_id: string | null; name: string; description: string | null
  status: string; color: string; total_seconds: number; created_at: string; updated_at: string
}

export interface Task {
  id: string; project_id: string; name: string; description: string | null
  status: string; priority: number; sort_order: number; total_seconds: number
  created_at: string; updated_at: string
}

export interface LearningCategory {
  id: string; name: string; icon: string; color: string; sort_order: number; created_at: string
}

export interface LearningTopic {
  id: string; category_id: string; name: string; description: string | null
  category_name?: string; total_seconds: number; created_at: string; updated_at: string
}

export interface TimerState {
  status: 'idle' | 'working' | 'learning' | 'deep_focus' | 'paused'
  sessionType: 'work' | 'learning' | null
  currentSessionId: string | null
  projectId: string | null; taskId: string | null; topicId: string | null
  startTime: string | null; pausedAt: string | null; accumulatedPauseMs: number
}

export interface TickPayload {
  status: string; elapsedMs: number; effectiveMs: number
  todayWorkMinutes: number; todayLearningMinutes: number
}

export interface DailyStats {
  workSeconds: number; learningSeconds: number; sessionCount: number
}

declare global {
  interface Window {
    electronAPI: {
      timer: {
        startWork: (projectId: string, taskId?: string) => Promise<TimerState>
        startLearning: (topicId: string) => Promise<TimerState>
        pause: () => Promise<TimerState>
        resume: () => Promise<TimerState>
        stop: () => Promise<any>
        getState: () => Promise<TimerState>
        getTodayStats: () => Promise<DailyStats>
        onTick: (cb: (p: TickPayload) => void) => () => void
        onStateChange: (cb: (s: TimerState) => void) => () => void
      }
      projects: {
        list: (companyId?: string) => Promise<Project[]>
        create: (d: any) => Promise<Project>
        update: (id: string, d: any) => Promise<Project>
        remove: (id: string) => Promise<any>
      }
      tasks: {
        listByProject: (projectId: string) => Promise<Task[]>
        create: (d: any) => Promise<Task>
        update: (id: string, d: any) => Promise<Task>
        remove: (id: string) => Promise<any>
      }
      learning: {
        listCategories: () => Promise<LearningCategory[]>
        createCategory: (d: any) => Promise<LearningCategory>
        listTopics: (categoryId?: string) => Promise<LearningTopic[]>
        createTopic: (d: any) => Promise<LearningTopic>
      }
      sessions: {
        listWork: (f?: any) => Promise<any[]>
        listLearning: (f?: any) => Promise<any[]>
        saveReview: (id: string, type: string, d: any) => Promise<any>
      }
      ai: {
        summarize: (i: any) => Promise<any>
        generateReport: (i: any) => Promise<any>
        validateConnection: () => Promise<{ok: boolean; error?: string}>
        getSettings: () => Promise<any>
        saveSettings: (s: any) => Promise<any>
      }
      reports: {
        getDaily: (d: string) => Promise<any>
        generateDaily: (d: string) => Promise<any>
        getWeekly: (y: number, w: number) => Promise<any>
        generateWeekly: (y: number, w: number) => Promise<any>
        getMonthly: (y: number, m: number) => Promise<any>
        generateMonthly: (y: number, m: number) => Promise<any>
        exportMarkdown: (id: string, type: string) => Promise<string>
      }
      achievements: {
        listAll: () => Promise<any[]>
        listUnlocked: () => Promise<any[]>
        check: () => Promise<any[]>
      }
      settings: {
        get: (k: string) => Promise<string | undefined>
        set: (k: string, v: string) => Promise<void>
        getAll: () => Promise<any[]>
      }
      window: {
        openGui: () => Promise<void>
      }
      app: {
        getMode: () => Promise<string>
        setMode: (m: string) => Promise<string>
        quit: () => Promise<void>
      }
    }
  }
}
```

- [ ] **Step 2: Create lib/ipc.ts and lib/time.ts**

```typescript
// lib/ipc.ts
export const api = window.electronAPI

// lib/time.ts
export function formatSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
```

- [ ] **Step 3: Create PulseCore entry**

```typescript
// src/pulsecore/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '../styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

```typescript
// src/pulsecore/App.tsx
import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import PulseCore from '../components/pulsecore/PulseCore'
import QuickPanel from '../components/pulsecore/QuickPanel'
import ReviewDialog from '../components/pulsecore/ReviewDialog'
import AchievementToast from '../components/pulsecore/AchievementToast'
import type { TimerState, TickPayload } from '../lib/types'

export default function App() {
  const [timerState, setTimerState] = useState<TimerState>({ status: 'idle', sessionType: null, currentSessionId: null, projectId: null, taskId: null, topicId: null, startTime: null, pausedAt: null, accumulatedPauseMs: 0 })
  const [tick, setTick] = useState<TickPayload>({ status: 'idle', elapsedMs: 0, effectiveMs: 0, todayWorkMinutes: 0, todayLearningMinutes: 0 })
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [sessionResult, setSessionResult] = useState<any>(null)
  const [achievements, setAchievements] = useState<any[]>([])

  useEffect(() => {
    api.timer.getState().then(setTimerState)
    api.timer.getTodayStats().then(stats => {
      setTick(prev => ({ ...prev, todayWorkMinutes: stats.workSeconds / 60, todayLearningMinutes: stats.learningSeconds / 60 }))
    })
    const unsub1 = api.timer.onTick(setTick)
    const unsub2 = api.timer.onStateChange(setTimerState)
    return () => { unsub1(); unsub2() }
  }, [])

  const handleStop = async () => {
    const result = await api.timer.stop()
    setSessionResult(result)
    setShowReview(true)
    setPanelExpanded(false)
  }

  const handleReviewComplete = async () => {
    setShowReview(false)
    setSessionResult(null)
    // 检查成就
    const newAchs = await api.achievements.check()
    if (newAchs.length > 0) setAchievements(newAchs)
  }

  return (
    <div className="pulsecore-window relative w-full h-screen">
      {/* PulseCore 核心动画 */}
      <PulseCore status={timerState.status} effectiveMs={tick.effectiveMs} onClick={() => setPanelExpanded(!panelExpanded)} />

      {/* 快捷面板 */}
      {panelExpanded && (
        <QuickPanel
          timerState={timerState}
          tick={tick}
          onPause={() => api.timer.pause()}
          onResume={() => api.timer.resume()}
          onStop={handleStop}
          onStartWork={async (projectId, taskId) => { await api.timer.startWork(projectId, taskId); setPanelExpanded(false) }}
          onStartLearning={async (topicId) => { await api.timer.startLearning(topicId); setPanelExpanded(false) }}
          onOpenGui={() => api.window.openGui()}
          onClose={() => setPanelExpanded(false)}
        />
      )}

      {/* 复盘弹窗 */}
      {showReview && sessionResult && (
        <ReviewDialog
          sessionResult={sessionResult}
          onComplete={handleReviewComplete}
        />
      )}

      {/* 成就动画 */}
      {achievements.map((ach, i) => (
        <AchievementToast key={i} achievement={ach} onDone={() => setAchievements(prev => prev.filter((_, j) => j !== i))} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ src/pulsecore/
git commit -m "feat: add PulseCore React entry with state management and IPC integration"
```

---

### Task 6.2: Create PulseCore animation component

**Files:**
- Create: `src/components/pulsecore/PulseCore.tsx`

- [ ] **Step 1: Write PulseCore SVG animation**

```tsx
import { useEffect, useRef } from 'react'
import { formatTimer } from '../../lib/time'

interface Props {
  status: string
  effectiveMs: number
  onClick: () => void
}

const statusColors: Record<string, string> = {
  idle: '#6366f1',
  working: '#3b82f6',
  learning: '#22c55e',
  deep_focus: '#f59e0b',
  paused: '#6b7280'
}

const statusGlow: Record<string, string> = {
  idle: 'rgba(99,102,241,0.3)',
  working: 'rgba(59,130,246,0.4)',
  learning: 'rgba(34,197,94,0.4)',
  deep_focus: 'rgba(245,158,11,0.5)',
  paused: 'rgba(107,114,128,0.15)'
}

export default function PulseCore({ status, effectiveMs, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let phase = 0

    const draw = () => {
      const { width, height } = canvas
      const cx = width / 2
      const cy = height / 2
      const color = statusColors[status] || statusColors.idle
      const glow = statusGlow[status] || statusGlow.idle

      ctx.clearRect(0, 0, width, height)

      // 外圈发光
      const breatheScale = status === 'paused' ? 0.3 : status === 'deep_focus' ? 0.5 + Math.sin(phase * 0.5) * 0.1 : 0.6 + Math.sin(phase * 0.8) * 0.3
      const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, 45 * breatheScale)
      gradient.addColorStop(0, glow)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, 45 * breatheScale, 0, Math.PI * 2)
      ctx.fill()

      // 脉冲波纹 (working/learning 时显示)
      if ((status === 'working' || status === 'learning') && !status.includes('paused')) {
        const ripplePhase = (phase * 2) % (Math.PI * 2)
        for (let i = 0; i < 2; i++) {
          const r = 25 + ((ripplePhase + i * Math.PI) % (Math.PI * 2)) / (Math.PI * 2) * 20
          const alpha = 0.3 * (1 - (r - 25) / 20)
          ctx.strokeStyle = color.replace(')', `,${alpha})`).replace('rgb', 'rgba')
          if (color.startsWith('#')) {
            ctx.strokeStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
          }
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // 核心球体
      const coreScale = status === 'paused' ? 0.85 : status === 'deep_focus' ? 1 + Math.sin(phase * 0.3) * 0.03 : 1 + Math.sin(phase * 1.5) * 0.05
      const coreRadius = 20 * coreScale
      const coreGradient = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, coreRadius)
      coreGradient.addColorStop(0, '#ffffff')
      coreGradient.addColorStop(0.3, color)
      coreGradient.addColorStop(1, '#000000')
      ctx.fillStyle = coreGradient
      ctx.beginPath()
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2)
      ctx.fill()

      // 心跳动画 (working/learning 时)
      if (status === 'working' || status === 'learning') {
        const beatPhase = (phase * 6) % (Math.PI * 2)
        const beatScale = 1 + (beatPhase < 0.5 ? Math.sin(beatPhase * Math.PI * 2) * 0.08 : 0)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(beatScale, beatScale)
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(0, 0, coreRadius + 3, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // 显示计时器文字 (非 idle 状态)
      if (status !== 'idle' && effectiveMs > 0) {
        ctx.fillStyle = '#ffffff'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(formatTimer(effectiveMs), cx, cy + 40)
      }

      // 底部信息
      const showInfo = status !== 'idle'
      if (showInfo) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '8px sans-serif'
        ctx.textAlign = 'center'
        const statusLabel = { working: '工作中', learning: '学习中', deep_focus: '深度专注', paused: '已暂停' }[status] || ''
        ctx.fillText(statusLabel, cx, cy + 52)
      }

      phase += 0.05
      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [status, effectiveMs])

  return (
    <div className="interactive flex flex-col items-center cursor-pointer" onClick={onClick}>
      <canvas ref={canvasRef} width={120} height={140} className="block" />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pulsecore/PulseCore.tsx
git commit -m "feat: add PulseCore SVG/Canvas energy core animation component"
```

---

### Task 6.3: Create QuickPanel, ReviewDialog, AchievementToast

**Files:**
- Create: `src/components/pulsecore/QuickPanel.tsx`
- Create: `src/components/pulsecore/ReviewDialog.tsx`
- Create: `src/components/pulsecore/AchievementToast.tsx`

- [ ] **Step 1: Write QuickPanel.tsx**

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../lib/ipc'
import { formatTimer } from '../../lib/time'
import type { TimerState, TickPayload, Project, Task, LearningTopic } from '../../lib/types'

interface Props {
  timerState: TimerState
  tick: TickPayload
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onStartWork: (projectId: string, taskId?: string) => void
  onStartLearning: (topicId: string) => void
  onOpenGui: () => void
  onClose: () => void
}

export default function QuickPanel({ timerState, tick, onPause, onResume, onStop, onStartWork, onStartLearning, onOpenGui, onClose }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [topics, setTopics] = useState<LearningTopic[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<string>('')
  const [selectedTopic, setSelectedTopic] = useState<string>('')
  const [mode, setMode] = useState<'idle' | 'selecting-work' | 'selecting-learning'>('idle')

  useEffect(() => {
    api.projects.list().then(setProjects)
    api.learning.listTopics().then(setTopics)
  }, [])

  useEffect(() => {
    if (selectedProject) api.tasks.listByProject(selectedProject).then(setTasks)
    else setTasks([])
  }, [selectedProject])

  const isActive = timerState.status === 'working' || timerState.status === 'learning' || timerState.status === 'deep_focus'
  const isPaused = timerState.status === 'paused'

  return (
    <div className="absolute left-full ml-4 top-0 w-64 bg-slate-800/95 backdrop-blur-lg rounded-xl border border-slate-700 shadow-2xl p-4 animate-fade-in text-white text-sm">
      {/* 当前状态 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : isPaused ? 'bg-yellow-400' : 'bg-slate-500'}`} />
          <span className="font-medium text-xs">
            {{ working: '工作中', learning: '学习中', deep_focus: '深度专注', paused: '已暂停', idle: '空闲' }[timerState.status]}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      {isActive || isPaused ? (
        // 活跃状态：显示计时和控制
        <div className="space-y-3">
          <div className="text-center">
            <div className="text-2xl font-mono font-bold">{formatTimer(tick.effectiveMs)}</div>
            <div className="text-xs text-slate-400 mt-1">
              今日研发 {Math.round(tick.todayWorkMinutes / 60)}h{Math.round(tick.todayWorkMinutes % 60)}m · 学习 {Math.round(tick.todayLearningMinutes / 60)}h{Math.round(tick.todayLearningMinutes % 60)}m
            </div>
          </div>
          <div className="flex gap-2">
            {isPaused ? (
              <button onClick={onResume} className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-lg py-2 text-xs font-medium">▶ 继续</button>
            ) : (
              <button onClick={onPause} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg py-2 text-xs font-medium">⏸ 暂停</button>
            )}
            <button onClick={onStop} className="flex-1 bg-red-600/70 hover:bg-red-500 text-white rounded-lg py-2 text-xs font-medium">⏹ 结束</button>
          </div>
        </div>
      ) : (
        // 空闲状态：选择和开始
        <div className="space-y-3">
          {mode === 'idle' && (
            <div className="space-y-2">
              <button onClick={() => setMode('selecting-work')} className="w-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded-lg py-2.5 text-xs font-medium border border-blue-500/30">💼 开始工作</button>
              <button onClick={() => setMode('selecting-learning')} className="w-full bg-green-600/20 hover:bg-green-600/40 text-green-300 rounded-lg py-2.5 text-xs font-medium border border-green-500/30">📚 开始学习</button>
              <button onClick={onOpenGui} className="w-full bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg py-2 text-xs">📊 打开管理面板</button>
            </div>
          )}

          {mode === 'selecting-work' && (
            <div className="space-y-2">
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
                <option value="">选择项目...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {tasks.length > 0 && (
                <select value={selectedTask} onChange={e => setSelectedTask(e.target.value)} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
                  <option value="">选择任务（可选）...</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <button onClick={() => setMode('idle')} className="flex-1 bg-slate-700 text-slate-300 rounded-lg py-2 text-xs">返回</button>
                <button disabled={!selectedProject} onClick={() => onStartWork(selectedProject, selectedTask || undefined)} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg py-2 text-xs font-medium">开始</button>
              </div>
            </div>
          )}

          {mode === 'selecting-learning' && (
            <div className="space-y-2">
              <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
                <option value="">选择知识主题...</option>
                {topics.map(t => <option key={t.id} value={t.id}>{t.category_name} / {t.name}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => setMode('idle')} className="flex-1 bg-slate-700 text-slate-300 rounded-lg py-2 text-xs">返回</button>
                <button disabled={!selectedTopic} onClick={() => onStartLearning(selectedTopic)} className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg py-2 text-xs font-medium">开始</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write ReviewDialog.tsx**

```tsx
import { useState } from 'react'
import { api } from '../../lib/ipc'
import { formatTimer } from '../../lib/time'

interface Props {
  sessionResult: any
  onComplete: () => void
}

export default function ReviewDialog({ sessionResult, onComplete }: Props) {
  const isWork = sessionResult.sessionType === 'work'
  const [answers, setAnswers] = useState({ completed: '', problems: '', solutions: '', nextSteps: '', learningContent: '', gains: '', questions: '' })
  const [saving, setSaving] = useState(false)

  const handleSave = async (useAI: boolean) => {
    setSaving(true)
    try {
      if (useAI) {
        const summary = await api.ai.summarize({
          type: sessionResult.sessionType,
          durationMinutes: Math.round(sessionResult.effectiveSeconds / 60),
          rawNotes: Object.values(answers).join('\n'),
          userAnswers: answers
        })
        // 保存 AI 总结结果到 session
        await api.sessions.saveReview(sessionResult.sessionId, sessionResult.sessionType, {
          effectiveSeconds: sessionResult.effectiveSeconds,
          rawNotes: Object.values(answers).join('\n'),
          completedWork: summary.completedWork?.join('; '),
          problems: summary.problems?.join('; '),
          solutions: summary.solutions?.join('; '),
          nextSteps: summary.nextSteps?.join('; '),
          learningContent: summary.knowledgeGained?.join('; '),
          gains: summary.summary,
          questions: ''
        })
      } else {
        // 原文保存
        await api.sessions.saveReview(sessionResult.sessionId, sessionResult.sessionType, {
          effectiveSeconds: sessionResult.effectiveSeconds,
          rawNotes: Object.values(answers).join('\n'),
          completedWork: answers.completed,
          problems: answers.problems,
          solutions: answers.solutions,
          nextSteps: answers.nextSteps,
          learningContent: answers.learningContent,
          gains: answers.gains,
          questions: answers.questions
        })
      }
    } finally {
      setSaving(false)
      onComplete()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">📝 {isWork ? '本次工作复盘' : '本次学习复盘'}</h2>
        <p className="text-xs text-slate-400 mb-4">时长: {formatTimer(sessionResult.effectiveSeconds * 1000)}</p>

        <div className="space-y-3">
          {isWork ? (
            <>
              <Field label="这段时间完成了什么？" value={answers.completed} onChange={v => setAnswers(p => ({...p, completed: v}))} />
              <Field label="遇到了什么问题？" value={answers.problems} onChange={v => setAnswers(p => ({...p, problems: v}))} />
              <Field label="解决了什么？" value={answers.solutions} onChange={v => setAnswers(p => ({...p, solutions: v}))} />
              <Field label="下一步准备做什么？" value={answers.nextSteps} onChange={v => setAnswers(p => ({...p, nextSteps: v}))} />
            </>
          ) : (
            <>
              <Field label="学习了什么内容？" value={answers.learningContent} onChange={v => setAnswers(p => ({...p, learningContent: v}))} />
              <Field label="学习收获" value={answers.gains} onChange={v => setAnswers(p => ({...p, gains: v}))} />
              <Field label="遇到的疑问" value={answers.questions} onChange={v => setAnswers(p => ({...p, questions: v}))} />
            </>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => handleSave(false)} disabled={saving} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">跳过</button>
          <button onClick={() => handleSave(true)} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
            {saving ? 'AI 总结中...' : '🤖 AI 总结并保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-indigo-500 focus:outline-none resize-none" placeholder="输入..." />
    </div>
  )
}
```

- [ ] **Step 3: Write AchievementToast.tsx**

```tsx
import { useEffect, useState } from 'react'

interface Props {
  achievement: any
  onDone: () => void
}

export default function AchievementToast({ achievement, onDone }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => { setVisible(false); setTimeout(onDone, 300) }, 3000)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
      <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 rounded-xl p-4 backdrop-blur-lg shadow-2xl animate-achievement-burst">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{achievement.icon || '🏆'}</span>
          <div>
            <div className="text-amber-400 font-semibold text-sm">{achievement.name}</div>
            <div className="text-amber-300/70 text-xs">{achievement.description}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/pulsecore/QuickPanel.tsx src/components/pulsecore/ReviewDialog.tsx src/components/pulsecore/AchievementToast.tsx
git commit -m "feat: add QuickPanel, ReviewDialog, and AchievementToast components"
```

---

## Phase 7: GUI Pages

### Task 7.1: Create GUI entry and layout

**Files:**
- Create: `src/gui/main.tsx`
- Create: `src/gui/App.tsx`
- Create: `src/components/gui/layout/Layout.tsx`
- Create: `src/components/gui/layout/Sidebar.tsx`
- Create: `src/components/gui/layout/TopBar.tsx`

- [ ] **Step 1: Create GUI entry points**

```tsx
// src/gui/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '../styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

```tsx
// src/gui/App.tsx
import { useState, useEffect } from 'react'
import Layout from '../components/gui/layout/Layout'
import OverviewPage from '../components/gui/overview/OverviewPage'
import ProjectList from '../components/gui/projects/ProjectList'
import TaskList from '../components/gui/tasks/TaskList'
import KnowledgePage from '../components/gui/knowledge/KnowledgePage'
import SessionTable from '../components/gui/sessions/SessionTable'
import DailyReport from '../components/gui/reports/DailyReport'
import WeeklyReport from '../components/gui/reports/WeeklyReport'
import MonthlyReport from '../components/gui/reports/MonthlyReport'
import AchievementWall from '../components/gui/achievements/AchievementWall'
import SettingsPage from '../components/gui/settings/SettingsPage'
import { api } from '../lib/ipc'

type Page = 'overview' | 'projects' | 'tasks' | 'knowledge' | 'sessions' | 'daily' | 'weekly' | 'monthly' | 'achievements' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [mode, setMode] = useState<string>('solo')
  const [showModeSelect, setShowModeSelect] = useState(false)

  useEffect(() => {
    api.app.getMode().then(m => {
      if (!m || m === '""') setShowModeSelect(true)
      else setMode(m)
    })
  }, [])

  const handleModeSelect = async (m: string) => {
    await api.app.setMode(m)
    setMode(m)
    setShowModeSelect(false)
  }

  if (showModeSelect) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-dark">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-bold text-white">欢迎使用 DevPulse AI</h1>
          <p className="text-slate-400">请选择您的使用模式</p>
          <div className="flex gap-4">
            <button onClick={() => handleModeSelect('solo')} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-8 py-4 text-lg font-medium">
              🧑‍💻 独立开发者
            </button>
            <button onClick={() => handleModeSelect('team')} className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl px-8 py-4 text-lg font-medium">
              👥 团队开发
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderPage = () => {
    switch (page) {
      case 'overview': return <OverviewPage />
      case 'projects': return <ProjectList />
      case 'tasks': return <TaskList />
      case 'knowledge': return <KnowledgePage />
      case 'sessions': return <SessionTable />
      case 'daily': return <DailyReport />
      case 'weekly': return <WeeklyReport />
      case 'monthly': return <MonthlyReport />
      case 'achievements': return <AchievementWall />
      case 'settings': return <SettingsPage />
    }
  }

  return <Layout currentPage={page} onNavigate={setPage}>{renderPage()}</Layout>
}
```

- [ ] **Step 2: Create layout components**

```tsx
// Layout.tsx
import Sidebar from './Sidebar'

export default function Layout({ children, currentPage, onNavigate }: { children: React.ReactNode; currentPage: string; onNavigate: (p: any) => void }) {
  return (
    <div className="h-screen flex bg-surface-dark text-white">
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
```

```tsx
// Sidebar.tsx
import { BookOpen, FolderKanban, CheckSquare, Library, List, FileText, Calendar, BarChart3, Trophy, Settings, Home } from 'lucide-react'

const navItems = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'knowledge', label: 'Knowledge', icon: Library },
  { id: 'sessions', label: 'Sessions', icon: List },
  { type: 'divider' },
  { id: 'daily', label: 'Daily Pulse', icon: FileText },
  { id: 'weekly', label: 'Weekly Pulse', icon: Calendar },
  { id: 'monthly', label: 'Monthly Pulse', icon: BarChart3 },
  { type: 'divider' },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export default function Sidebar({ currentPage, onNavigate }: { currentPage: string; onNavigate: (p: string) => void }) {
  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col p-3">
      <div className="px-3 py-4 mb-2">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-indigo-400">DevPulse</span>{' '}
          <span className="text-white">AI</span>
        </h1>
      </div>
      <nav className="flex-1 space-y-0.5">
        {navItems.map((item, i) => {
          if ('type' in item) return <div key={i} className="border-t border-slate-800 my-3" />
          const Icon = item.icon
          const active = currentPage === item.id
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-indigo-600/20 text-indigo-400 font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="text-xs text-slate-600 px-3 py-2">v0.1.0 MVP</div>
    </aside>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/gui/ src/components/gui/layout/
git commit -m "feat: add GUI entry with sidebar navigation and mode selection"
```

---

### Task 7.2: Create Overview page with charts

**Files:**
- Create: `src/components/gui/overview/OverviewPage.tsx`
- Create: `src/components/gui/overview/StatCard.tsx`
- Create: `src/components/gui/shared/TimeDisplay.tsx`

- [ ] **Step 1: Write OverviewPage with Recharts**

```tsx
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { api } from '../../../lib/ipc'
import { formatSeconds } from '../../../lib/time'

const COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

interface StatCardProps { title: string; value: string; subtitle?: string; color: string }

function StatCard({ title, value, subtitle, color }: StatCardProps) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  )
}

export default function OverviewPage() {
  const [stats, setStats] = useState<any>(null)
  const [dailyData, setDailyData] = useState<any[]>([])

  useEffect(() => {
    api.timer.getTodayStats().then(s => setStats(s))
    // Load last 7 days for trend
    const days: any[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      api.reports.getDaily(dateStr).then((r: any) => {
        if (r) {
          const data = JSON.parse(r.content_json)
          days.push({ date: dateStr.slice(5), work: Math.round(data.totalWorkMinutes / 60 * 10) / 10, learning: Math.round(data.totalLearningMinutes / 60 * 10) / 10 })
          if (days.length === 7) setDailyData(days)
        }
      })
    }
  }, [])

  const todayWork = stats ? formatSeconds(stats.workSeconds) : '--'
  const todayLearn = stats ? formatSeconds(stats.learningSeconds) : '--'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">👋 下午好</h2>
        <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="今日研发" value={todayWork} color="text-blue-400" />
        <StatCard title="今日学习" value={todayLearn} color="text-green-400" />
        <StatCard title="Session 数" value={String(stats?.sessionCount || 0)} color="text-indigo-400" subtitle="今日完成" />
      </div>

      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="font-medium mb-4 text-sm">📊 本周趋势</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="work" fill="#3b82f6" name="研发(h)" radius={[4,4,0,0]} />
            <Bar dataKey="learning" fill="#22c55e" name="学习(h)" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/gui/overview/ src/components/gui/shared/
git commit -m "feat: add Overview page with stat cards and weekly trend chart"
```

---

### Task 7.3: Remaining GUI pages (concise)

Due to scope, the remaining GUI pages follow the same pattern — fetch data via IPC, render with Tailwind + shadcn/ui patterns:

```
Projects page: grid of ProjectCards with CRUD actions, color dots, total time display
Tasks page: list grouped by project, status badges, drag-to-reorder (future)
Knowledge page: left sidebar category tree + right topic cards
Sessions page: filterable table with date/type/project columns + detail expansion
Reports pages: generated report display with "Generate" + "Export Markdown" buttons
Achievements page: grid of achievement badges, locked/unlocked states
Settings page: sections for AI config (provider/model/key), appearance, data management
```

**Commit:**
```bash
git add src/components/gui/
git commit -m "feat: add all GUI management pages (projects, tasks, knowledge, sessions, reports, achievements, settings)"
```

---

## Phase 8: Integration & Packaging

### Task 8.1: Create electron-builder config

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: Write build config**

```yaml
appId: com.devpulseai.app
productName: DevPulse AI
copyright: Copyright © 2026

directories:
  output: release
  buildResources: resources

files:
  - dist-electron/**/*
  - dist/**/*

linux:
  target:
    - AppImage
    - deb
  category: Development
  icon: resources/icons
  maintainer: devpulse@example.com

mac:
  target:
    - dmg
    - zip
  icon: resources/icons/icon.icns
  category: public.app-category.developer-tools

win:
  target:
    - nsis
  icon: resources/icons/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 2: Commit**

```bash
git add electron-builder.yml
git commit -m "chore: add electron-builder configuration for Linux/macOS/Windows"
```

---

### Task 8.2: Create dev/build scripts and README

**Files:**
- Create: `scripts/dev.sh`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Write dev script**

```bash
#!/bin/bash
# scripts/dev.sh — Start DevPulse AI in development mode
cd "$(dirname "$0")/.."
npm run electron:dev
```

- [ ] **Step 2: Write .gitignore**

```
node_modules/
dist/
dist-electron/
release/
*.db
*.db-wal
*.db-shm
.env
```

- [ ] **Step 3: Write README.md**

````markdown
# DevPulse AI — PulseCore 脉核

智能研发记录桌面助手。以桌面悬浮能量核心 PulseCore 为主入口，自动记录研发/学习时长，结合 AI 自动生成日报/周报/月报。

## 技术栈

- **桌面框架**: Electron
- **UI**: React + TypeScript + Tailwind CSS + shadcn/ui
- **数据库**: SQLite (better-sqlite3)
- **AI**: DeepSeek API (可扩展多 Provider)
- **打包**: electron-builder

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式 (Vite + Electron)
npm run electron:dev
```

## 打包

```bash
# Linux
npm run electron:build:linux

# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win
```

## 项目结构

```
electron/     — Electron 主进程 (Timer, AI, Report, DB)
src/          — React 渲染进程
  pulsecore/  — PulseCore 悬浮窗入口
  gui/        — GUI 管理面板入口
  components/ — UI 组件
docs/         — 设计文档
```
````

- [ ] **Step 4: Commit**

```bash
git add scripts/ .gitignore README.md
git commit -m "chore: add dev scripts, .gitignore, and README"
```

---

## Phase 9: Achievement Checker & Final Integration

### Task 9.1: Create Achievement Checker Engine

**Files:**
- Create: `electron/achievements/checker.ts`

- [ ] **Step 1: Write achievement checker**

```typescript
import Database from 'better-sqlite3'
import { unlockAchievement, listAchievements, getUserAchievements } from '../db/queries/achievements'
import { getFirstUser } from '../db/queries/users'
import { logger } from '../utils/logger'

export class AchievementChecker {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  checkAll(): any[] {
    const user = getFirstUser(this.db) as any
    if (!user) return []

    const allAchievements = listAchievements(this.db) as any[]
    const userAchs = getUserAchievements(this.db, user.id) as any[]
    const unlockedKeys = new Set(userAchs.filter((ua: any) => ua.unlocked_at).map((ua: any) => ua.key))

    const newUnlocks: any[] = []
    for (const ach of allAchievements) {
      if (unlockedKeys.has(ach.key)) continue

      const condition = JSON.parse(ach.condition_json)
      if (this.checkCondition(user.id, condition)) {
        const unlocked = unlockAchievement(this.db, user.id, ach.id)
        if (unlocked) {
          newUnlocks.push(unlocked)
          logger.info(`Achievement unlocked: ${ach.name}`)
        }
      }
    }
    return newUnlocks
  }

  private checkCondition(userId: string, condition: any): boolean {
    switch (condition.type) {
      case 'session_count': {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM (SELECT id FROM work_sessions WHERE user_id = ? AND status = 'completed' UNION ALL SELECT id FROM learning_sessions WHERE user_id = ? AND status = 'completed')`).get(userId, userId) as any
        return row.c >= condition.threshold
      }
      case 'streak_days': {
        return this.getCurrentStreak(userId) >= condition.threshold
      }
      case 'total_work_hours': {
        const row = this.db.prepare(`SELECT COALESCE(SUM(effective_seconds), 0) as total FROM work_sessions WHERE user_id = ? AND status = 'completed'`).get(userId) as any
        return (row.total / 3600) >= condition.threshold
      }
      case 'total_learning_hours': {
        const row = this.db.prepare(`SELECT COALESCE(SUM(effective_seconds), 0) as total FROM learning_sessions WHERE user_id = ? AND status = 'completed'`).get(userId) as any
        return (row.total / 3600) >= condition.threshold
      }
      case 'project_completed': {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM projects WHERE status = 'completed'`).get() as any
        return row.c >= condition.threshold
      }
      case 'weekly_report_count': {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM weekly_reports WHERE user_id = ?`).get(userId) as any
        return row.c >= condition.threshold
      }
      case 'ai_summary_count': {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM ai_summaries`).get() as any
        return row.c >= condition.threshold
      }
      default: return false
    }
  }

  private getCurrentStreak(userId: string): number {
    let streak = 0
    const current = new Date()
    while (true) {
      const dateStr = current.toISOString().slice(0, 10)
      const wRow = this.db.prepare(`SELECT COUNT(*) as c FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(userId, dateStr) as any
      const lRow = this.db.prepare(`SELECT COUNT(*) as c FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(userId, dateStr) as any
      if (wRow.c === 0 && lRow.c === 0) break
      streak++
      current.setDate(current.getDate() - 1)
    }
    return streak
  }
}
```

- [ ] **Step 2: Integrate into TimerEngine.stop()**

Add after `clearSnapshot` in engine.ts stop():

```typescript
// trigger achievement check
const { AchievementChecker } = require('../achievements/checker')
const checker = new AchievementChecker(db)
const newAchs = checker.checkAll()
if (newAchs.length > 0) {
  // broadcast to PulseCore window
  BrowserWindow.getAllWindows().forEach(win => win.webContents.send('achievement:unlocked', newAchs))
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/achievements/
git commit -m "feat: add Achievement Checker engine with 12 default achievement conditions"
```

---

## Summary: File Creation Order

| Phase | Files | Description |
|-------|-------|-------------|
| 0 | package.json, tsconfig, vite.config, tailwind, postcss, HTML entries, globals.css, main/preload/windows/tray, utils/* | Project skeleton |
| 1 | db/schema.sql, connection, migrate, seed, queries/* | Database layer |
| 2 | timer/types, state, persistence, engine | Timer Engine |
| 3 | ai/types, provider, deepseek, registry | AI Provider |
| 4 | report/types, generator, daily, weekly, monthly, export | Report Generator |
| 5 | ipc-handlers | IPC integration |
| 6 | lib/types, lib/ipc, lib/time, pulsecore/*, components/pulsecore/* | PulseCore UI |
| 7 | gui/*, components/gui/layout/*, components/gui/overview/*, components/gui/* | GUI Pages |
| 8 | electron-builder.yml, scripts/dev.sh, .gitignore, README.md | Build & packaging |
| 9 | achievements/checker, integrate into timer engine | Achievement checker |

## Running the App

```bash
# Development
cd /path/to/DevPulse_AI
npm install
npm run electron:dev

# Build Linux
npm run electron:build:linux
# Output: release/DevPulse AI-0.1.0.AppImage

# Build macOS
npm run electron:build:mac
# Output: release/DevPulse AI-0.1.0.dmg

# Build Windows
npm run electron:build:win
# Output: release/DevPulse AI Setup 0.1.0.exe
```

## Testing Checklist (Manual)

- [ ] PulseCore floating window appears and is transparent
- [ ] PulseCore shows idle breathing animation
- [ ] Click PulseCore → QuickPanel expands
- [ ] Start work session → heartbeat animation starts
- [ ] Timer counts up
- [ ] Pause/Resume works
- [ ] Stop → Review dialog appears
- [ ] Fill review → AI summarize → data saved
- [ ] Achievement toast appears on first session
- [ ] GUI opens from tray
- [ ] Overview shows today's stats and charts
- [ ] Projects CRUD works
- [ ] Tasks CRUD works
- [ ] Knowledge categories/topics CRUD works
- [ ] Sessions table shows records
- [ ] Daily/Weekly/Monthly report generates
- [ ] Settings page saves AI config
- [ ] Close GUI → PulseCore still runs
- [ ] App survives PulseCore window close
- [ ] Crash recovery restores active session
