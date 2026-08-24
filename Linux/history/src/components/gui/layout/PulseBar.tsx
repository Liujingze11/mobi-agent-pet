import { useState, useEffect } from 'react'
import { Play, Pause, Square, Briefcase, BookOpen } from 'lucide-react'
import { api } from '../../../lib/ipc'
import type { TimerState, TickPayload } from '../../../lib/types'
import { useI18n } from '../../../lib/i18n'

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function fmtMin(m: number) { return m >= 60 ? `${Math.round(m / 60)}h${Math.round(m % 60)}m` : `${Math.round(m)}m` }

export default function PulseBar() {
  const { t } = useI18n()
  const [state, setState] = useState<TimerState>({
    status: 'idle', sessionType: null, currentSessionId: null,
    projectId: null, taskId: null, topicId: null,
    startTime: null, pausedAt: null, accumulatedPauseMs: 0
  })
  const [tick, setTick] = useState<TickPayload>({
    status: 'idle', elapsedMs: 0, effectiveMs: 0,
    todayWorkMinutes: 0, todayLearningMinutes: 0
  })
  const [projects, setProjects] = useState<any[]>([])
  const [topics, setTopics] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [selProject, setSelProject] = useState('')
  const [selTask, setSelTask] = useState('')
  const [selTopic, setSelTopic] = useState('')
  const [showPicker, setShowPicker] = useState<'work' | 'learning' | null>(null)

  useEffect(() => {
    api.timer.getState().then(setState)
    const u1 = api.timer.onTick(setTick)
    const u2 = api.timer.onStateChange(setState)
    api.projects.list().then(setProjects)
    api.learning.listTopics().then(setTopics)
    return () => { u1(); u2() }
  }, [])

  useEffect(() => {
    if (selProject) api.tasks.listByProject(selProject).then(setTasks)
    else setTasks([])
  }, [selProject])

  const isActive = state.status === 'working' || state.status === 'learning' || state.status === 'deep_focus'
  const isPaused = state.status === 'paused'
  const isIdle = state.status === 'idle'

  const statusLabel: Record<string, string> = {
    idle: t('gui.pulseBar.idle'), working: t('gui.pulseBar.working'),
    learning: t('gui.pulseBar.learning'), deepFocus: t('gui.pulseBar.deepFocus'),
    paused: t('gui.pulseBar.paused')
  }
  const statusColor: Record<string, string> = {
    idle: 'bg-slate-500', working: 'bg-blue-500', learning: 'bg-green-500',
    deepFocus: 'bg-amber-500', paused: 'bg-yellow-500'
  }

  const handleStartWork = async () => {
    if (!selProject) return
    await api.timer.startWork(selProject, selTask || undefined)
    setShowPicker(null)
  }
  const handleStartLearning = async () => {
    if (!selTopic) return
    await api.timer.startLearning(selTopic)
    setShowPicker(null)
  }

  return (
    <div className="bg-slate-800/80 border-b border-slate-700 px-6 py-2.5 flex items-center gap-4">
      <div className="flex items-center gap-2 min-w-[100px]">
        <span className={`w-2.5 h-2.5 rounded-full ${statusColor[state.status]} ${isActive ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-medium text-white">{statusLabel[state.status]}</span>
      </div>

      {!isIdle && (
        <div className="font-mono text-lg font-bold text-white min-w-[80px]">{fmt(tick.effectiveMs)}</div>
      )}

      <div className="text-xs text-slate-400 flex gap-3 min-w-[160px]">
        <span>{t('gui.pulseBar.workLabel')} {fmtMin(tick.todayWorkMinutes)}</span>
        <span>{t('gui.pulseBar.learningLabel')} {fmtMin(tick.todayLearningMinutes)}</span>
      </div>

      <div className="flex-1" />

      {isIdle && (
        <div className="flex gap-2">
          <button onClick={() => setShowPicker(showPicker === 'work' ? null : 'work')}
            className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded-lg px-3 py-1.5 text-xs font-medium border border-blue-500/30">
            <Briefcase size={14} /> {t('gui.pulseBar.startWork')}
          </button>
          <button onClick={() => setShowPicker(showPicker === 'learning' ? null : 'learning')}
            className="flex items-center gap-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-300 rounded-lg px-3 py-1.5 text-xs font-medium border border-green-500/30">
            <BookOpen size={14} /> {t('gui.pulseBar.startLearning')}
          </button>
        </div>
      )}

      {(isActive || isPaused) && (
        <div className="flex gap-2">
          {isPaused ? (
            <button onClick={() => api.timer.resume()}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
              <Play size={14} /> {t('gui.pulseBar.resume')}
            </button>
          ) : (
            <button onClick={() => api.timer.pause()}
              className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
              <Pause size={14} /> {t('gui.pulseBar.pause')}
            </button>
          )}
          <button onClick={() => api.timer.stop()}
            className="flex items-center gap-1.5 bg-red-600/70 hover:bg-red-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
            <Square size={14} /> {t('gui.pulseBar.stop')}
          </button>
        </div>
      )}

      {showPicker === 'work' && (
        <div className="absolute top-full right-6 mt-2 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-56 space-y-2">
          <select value={selProject} onChange={e => setSelProject(e.target.value)}
            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
            <option value="">{t('gui.pulseBar.selectProject')}</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {tasks.length > 0 && (
            <select value={selTask} onChange={e => setSelTask(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
              <option value="">{t('gui.pulseBar.selectTask')}</option>
              {tasks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button onClick={handleStartWork} disabled={!selProject}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg py-2 text-xs font-medium">
            {t('gui.pulseBar.start')}
          </button>
        </div>
      )}

      {showPicker === 'learning' && (
        <div className="absolute top-full right-6 mt-2 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-56 space-y-2">
          <select value={selTopic} onChange={e => setSelTopic(e.target.value)}
            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
            <option value="">{t('gui.pulseBar.selectTopic')}</option>
            {topics.map((t: any) => <option key={t.id} value={t.id}>{t.category_name} / {t.name}</option>)}
          </select>
          <button onClick={handleStartLearning} disabled={!selTopic}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white rounded-lg py-2 text-xs font-medium">
            {t('gui.pulseBar.start')}
          </button>
        </div>
      )}
    </div>
  )
}
