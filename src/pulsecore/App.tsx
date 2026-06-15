import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import PulseCore from '../components/pulsecore/PulseCore'
import QuickPanel from '../components/pulsecore/QuickPanel'
import ReviewDialog from '../components/pulsecore/ReviewDialog'
import AchievementToast from '../components/pulsecore/AchievementToast'
import type { TimerState, TickPayload } from '../lib/types'

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

  return (
    <div className="pulsecore-window relative w-full h-screen">
      <PulseCore
        status={timerState.status}
        effectiveMs={tick.effectiveMs}
        onClick={() => setPanelExpanded(!panelExpanded)}
      />
      {panelExpanded && (
        <QuickPanel
          timerState={timerState}
          tick={tick}
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
