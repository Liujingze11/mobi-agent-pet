import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/ipc'
import PulseCore from '../components/pulsecore/PulseCore'
import QuickPanel from '../components/pulsecore/QuickPanel'
import WorkDialog from '../components/pulsecore/WorkDialog'
import ReviewDialog from '../components/pulsecore/ReviewDialog'
import AchievementToast from '../components/pulsecore/AchievementToast'
import type { TimerState, TickPayload } from '../lib/types'
import { I18nProvider } from '../lib/i18n'
import type { Language } from '../lib/i18n'

export type PetForm = 'energyCore' | 'pulseRing' | 'hexCrystal' | 'dataStream'
const forms: PetForm[] = ['energyCore', 'pulseRing', 'hexCrystal', 'dataStream']
const DRAG_THRESHOLD = 5

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function App() {
  const [language, setLanguage] = useState<Language>('zh-CN')
  const [timerState, setTimerState] = useState<TimerState>({
    status: 'idle', sessionType: null, currentSessionId: null,
    projectId: null, taskId: null, topicId: null,
    startTime: null, pausedAt: null, accumulatedPauseMs: 0
  })
  const [tick, setTick] = useState<TickPayload>({
    status: 'idle', elapsedMs: 0, effectiveMs: 0,
    todayWorkMinutes: 0, todayLearningMinutes: 0
  })
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [showDialog, setShowDialog] = useState<'work' | 'learning' | null>(null)
  const [showReview, setShowReview] = useState(false)
  const [sessionResult, setSessionResult] = useState<any>(null)
  const [achievements, setAchievements] = useState<any[]>([])
  const [petForm, setPetForm] = useState<PetForm>('energyCore')

  const isActive = timerState.status === 'working' || timerState.status === 'learning' || timerState.status === 'deep_focus'
  const isPaused = timerState.status === 'paused'
  const lastClickRef = useRef(0)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, moved: false, sx: 0, sy: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('button') || t.closest('input') || t.closest('select') || t.closest('textarea')) return
    dragRef.current = { active: true, startX: e.screenX, startY: e.screenY, moved: false, sx: e.screenX, sy: e.screenY }
  }, [])

  useEffect(() => {
    const onMove = async (e: MouseEvent) => {
      if (!dragRef.current.active) return
      const dx = e.screenX - dragRef.current.sx, dy = e.screenY - dragRef.current.sy
      const totalDx = e.screenX - dragRef.current.startX, totalDy = e.screenY - dragRef.current.startY
      if (Math.abs(totalDx) >= DRAG_THRESHOLD || Math.abs(totalDy) >= DRAG_THRESHOLD) dragRef.current.moved = true
      dragRef.current.sx = e.screenX; dragRef.current.sy = e.screenY
      if (dragRef.current.moved && (dx !== 0 || dy !== 0)) await api.window.drag(dx, dy)
    }
    const onUp = () => { dragRef.current.active = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const handleCoreMouseUp = useCallback((_e: React.MouseEvent) => {
    if (dragRef.current.moved) return
    const now = Date.now()
    if (now - lastClickRef.current < 350) {
      const idx = forms.indexOf(petForm)
      setPetForm(forms[(idx + 1) % forms.length])
      lastClickRef.current = 0
    } else {
      lastClickRef.current = now
      setPanelExpanded(v => !v)
    }
  }, [petForm])

  // 加载语言 & 形态
  useEffect(() => {
    api.settings.get('language').then(v => { if (v === 'zh-CN' || v === 'en-US') setLanguage(v as Language) })
    api.settings.get('pet_form').then(v => { if (v) { try { const f = JSON.parse(v); if (forms.includes(f)) setPetForm(f) } catch {} } })
  }, [])

  // Timer 订阅
  useEffect(() => {
    api.timer.getState().then(setTimerState)
    api.timer.getTodayStats().then((s: any) => setTick(p => ({ ...p, todayWorkMinutes: s.workSeconds / 60, todayLearningMinutes: s.learningSeconds / 60 })))
    const u1 = api.timer.onTick(setTick)
    const u2 = api.timer.onStateChange(setTimerState)
    return () => { u1(); u2() }
  }, [])

  const handleStop = async () => {
    const r = await api.timer.stop(); setSessionResult(r); setShowReview(true); setPanelExpanded(false)
  }
  const handleReviewDone = async () => {
    setShowReview(false); setSessionResult(null)
    const a = await api.achievements.check(); if (a.length > 0) setAchievements(a)
  }
  const handleFormChange = async (f: string) => {
    setPetForm(f as PetForm); await api.settings.set('pet_form', JSON.stringify(f))
  }

  // 工作/学习弹窗回调
  const handleDialogStart = () => { setShowDialog(null); setPanelExpanded(false) }
  const handleDialogCancel = () => { setShowDialog(null) }

  return (
    <I18nProvider language={language}>
      <div className="pulsecore-window w-full h-screen flex items-center justify-center"
        style={{ background: 'rgba(1,1,1,0.015)' as any }} onMouseDown={handleMouseDown}>
        <PulseCore form={petForm} status={timerState.status} effectiveMs={tick.effectiveMs} onMouseUp={handleCoreMouseUp} />

        {panelExpanded && !isActive && !isPaused && (
          <QuickPanel
            onStartWork={() => { setShowDialog('work'); setPanelExpanded(false) }}
            onStartLearning={() => { setShowDialog('learning'); setPanelExpanded(false) }}
            onOpenGui={() => api.window.openGui()}
            onChangeForm={handleFormChange}
            onClose={() => setPanelExpanded(false)}
          />
        )}

        {/* 计时中：显示简单控制面板 */}
        {panelExpanded && (isActive || isPaused) && (
          <div className="absolute left-full ml-4 top-0 w-48 bg-slate-800/95 backdrop-blur-lg rounded-xl border border-slate-700 shadow-2xl p-4 animate-fade-in text-white text-center">
            <div className="text-2xl font-mono font-bold mb-3">{fmt(tick.effectiveMs)}</div>
            <div className="flex gap-2">
              {isPaused ? (
                <button onClick={() => api.timer.resume()} className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-lg py-2 text-xs font-medium">▶ 继续</button>
              ) : (
                <button onClick={() => api.timer.pause()} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg py-2 text-xs font-medium">⏸ 暂停</button>
              )}
              <button onClick={handleStop} className="flex-1 bg-red-600/70 hover:bg-red-500 text-white rounded-lg py-2 text-xs font-medium">⏹ 结束</button>
            </div>
          </div>
        )}

        {showDialog && <WorkDialog mode={showDialog} onStart={handleDialogStart} onCancel={handleDialogCancel} />}
        {showReview && sessionResult && <ReviewDialog sessionResult={sessionResult} onComplete={handleReviewDone} />}
        {achievements.map((ach, i) => (
          <AchievementToast key={i} achievement={ach} onDone={() => setAchievements(p => p.filter((_, j) => j !== i))} />
        ))}
      </div>
    </I18nProvider>
  )
}
