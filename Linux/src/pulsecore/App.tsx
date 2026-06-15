import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/ipc'
import PulseCore from '../components/pulsecore/PulseCore'
import QuickPanel from '../components/pulsecore/QuickPanel'
import ReviewDialog from '../components/pulsecore/ReviewDialog'
import AchievementToast from '../components/pulsecore/AchievementToast'
import type { TimerState, TickPayload } from '../lib/types'

export type PetForm = 'energyCore' | 'pulseRing' | 'hexCrystal' | 'dataStream'
const forms: PetForm[] = ['energyCore', 'pulseRing', 'hexCrystal', 'dataStream']

const DRAG_THRESHOLD = 5 // px，小于此距离视为点击

export default function App() {
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
  const [showReview, setShowReview] = useState(false)
  const [sessionResult, setSessionResult] = useState<any>(null)
  const [achievements, setAchievements] = useState<any[]>([])
  const [petForm, setPetForm] = useState<PetForm>('energyCore')

  // ---- 拖动：全窗口可拖，距离 < 5px 视为点击 ----
  const dragRef = useRef({
    active: false,
    startX: 0, startY: 0,
    moved: false,
    sx: 0, sy: 0
  })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 表单控件不触发拖动
    const t = e.target as HTMLElement
    if (t.closest('button') || t.closest('input') || t.closest('select') || t.closest('textarea')) return
    dragRef.current = {
      active: true,
      startX: e.screenX, startY: e.screenY,
      moved: false,
      sx: e.screenX, sy: e.screenY
    }
  }, [])

  useEffect(() => {
    const onMove = async (e: MouseEvent) => {
      if (!dragRef.current.active) return
      const dx = e.screenX - dragRef.current.sx
      const dy = e.screenY - dragRef.current.sy
      const totalDx = e.screenX - dragRef.current.startX
      const totalDy = e.screenY - dragRef.current.startY
      if (Math.abs(totalDx) >= DRAG_THRESHOLD || Math.abs(totalDy) >= DRAG_THRESHOLD) {
        dragRef.current.moved = true
      }
      dragRef.current.sx = e.screenX
      dragRef.current.sy = e.screenY
      if (dragRef.current.moved && (dx !== 0 || dy !== 0)) {
        await api.window.drag(dx, dy)
      }
    }
    const onUp = () => {
      dragRef.current.active = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ---- 核心点击（由 mousedown → mouseup 距离决定）----
  const handleCoreMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.moved) return // 是拖动，忽略
    const now = Date.now()
    if (now - lastClickRef.current < 350) {
      // 双击 → 切换形态
      const idx = forms.indexOf(petForm)
      const next = forms[(idx + 1) % forms.length]
      setPetForm(next)
      api.settings.set('pet_form', JSON.stringify(next))
      lastClickRef.current = 0
    } else {
      lastClickRef.current = now
      setPanelExpanded(v => !v)
    }
  }, [petForm])

  // ---- 双击计时 ----
  const lastClickRef = useRef(0)

  // ---- 加载形态 ----
  useEffect(() => {
    api.settings.get('pet_form').then(v => {
      if (v) { try { const f = JSON.parse(v); if (forms.includes(f)) setPetForm(f) } catch {} }
    })
  }, [])

  // ---- Timer ----
  useEffect(() => {
    api.timer.getState().then(setTimerState)
    api.timer.getTodayStats().then((stats: any) => {
      setTick(prev => ({ ...prev, todayWorkMinutes: stats.workSeconds / 60, todayLearningMinutes: stats.learningSeconds / 60 }))
    })
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
  const handleFormChange = async (f: PetForm) => { setPetForm(f); await api.settings.set('pet_form', JSON.stringify(f)) }

  return (
    <div
      className="pulsecore-window w-full h-screen flex items-center justify-center"
      style={{ background: 'rgba(1,1,1,0.015)' as any }}
      onMouseDown={handleMouseDown}
    >
      <PulseCore
        form={petForm}
        status={timerState.status}
        effectiveMs={tick.effectiveMs}
        onMouseUp={handleCoreMouseUp}
      />
      {panelExpanded && (
        <QuickPanel
          timerState={timerState} tick={tick} petForm={petForm}
          onPause={() => api.timer.pause()} onResume={() => api.timer.resume()} onStop={handleStop}
          onStartWork={async (pid, tid) => { await api.timer.startWork(pid, tid); setPanelExpanded(false) }}
          onStartLearning={async (tid) => { await api.timer.startLearning(tid); setPanelExpanded(false) }}
          onOpenGui={() => api.window.openGui()} onChangeForm={handleFormChange}
          onClose={() => setPanelExpanded(false)}
        />
      )}
      {showReview && sessionResult && <ReviewDialog sessionResult={sessionResult} onComplete={handleReviewDone} />}
      {achievements.map((ach, i) => (
        <AchievementToast key={i} achievement={ach} onDone={() => setAchievements(p => p.filter((_, j) => j !== i))} />
      ))}
    </div>
  )
}
