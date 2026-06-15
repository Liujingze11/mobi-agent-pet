import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import PulseCore from '../components/pulsecore/PulseCore'
import QuickPanel from '../components/pulsecore/QuickPanel'
import ReviewDialog from '../components/pulsecore/ReviewDialog'
import AchievementToast from '../components/pulsecore/AchievementToast'
import type { TimerState, TickPayload } from '../lib/types'

export type PetForm = 'energyCore' | 'pulseRing' | 'hexCrystal' | 'dataStream'

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

  // 加载保存的形态
  useEffect(() => {
    api.settings.get('pet_form').then(v => {
      if (v && JSON.parse(v)) setPetForm(JSON.parse(v) as PetForm)
    })
  }, [])

  // Timer 状态同步
  useEffect(() => {
    api.timer.getState().then(setTimerState)
    api.timer.getTodayStats().then((stats: any) => {
      setTick(prev => ({
        ...prev,
        todayWorkMinutes: stats.workSeconds / 60,
        todayLearningMinutes: stats.learningSeconds / 60
      }))
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
    const newAchs = await api.achievements.check()
    if (newAchs.length > 0) setAchievements(newAchs)
  }

  const handleFormChange = async (form: PetForm) => {
    setPetForm(form)
    await api.settings.set('pet_form', JSON.stringify(form))
  }

  return (
    <div className="pulsecore-window w-full h-screen flex items-center justify-center">
      <PulseCore
        form={petForm}
        status={timerState.status}
        effectiveMs={tick.effectiveMs}
        onClick={() => setPanelExpanded(!panelExpanded)}
      />
      {panelExpanded && (
        <QuickPanel
          timerState={timerState}
          tick={tick}
          petForm={petForm}
          onPause={() => api.timer.pause()}
          onResume={() => api.timer.resume()}
          onStop={handleStop}
          onStartWork={async (projectId, taskId) => {
            await api.timer.startWork(projectId, taskId)
            setPanelExpanded(false)
          }}
          onStartLearning={async (topicId) => {
            await api.timer.startLearning(topicId)
            setPanelExpanded(false)
          }}
          onOpenGui={() => api.window.openGui()}
          onChangeForm={handleFormChange}
          onClose={() => setPanelExpanded(false)}
        />
      )}
      {showReview && sessionResult && (
        <ReviewDialog sessionResult={sessionResult} onComplete={handleReviewComplete} />
      )}
      {achievements.map((ach, i) => (
        <AchievementToast key={i} achievement={ach} onDone={() => setAchievements(prev => prev.filter((_, j) => j !== i))} />
      ))}
    </div>
  )
}
