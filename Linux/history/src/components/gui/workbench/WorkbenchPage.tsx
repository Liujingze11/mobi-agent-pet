import { useState, useEffect } from 'react'
import { Play, Pause, Square, Plus, Check, RefreshCw, Loader2 } from 'lucide-react'
import { api } from '../../../lib/ipc'
import { useI18n } from '../../../lib/i18n'
import type { TimerState, TickPayload } from '../../../lib/types'

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function WorkbenchPage() {
  const { t } = useI18n()
  const [state, setState] = useState<TimerState>({
    status: 'idle', sessionType: null, currentSessionId: null,
    projectId: null, taskId: null, topicId: null, startTime: null, pausedAt: null, accumulatedPauseMs: 0
  })
  const [tick, setTick] = useState<TickPayload>({ status: 'idle', elapsedMs: 0, effectiveMs: 0, todayWorkMinutes: 0, todayLearningMinutes: 0 })
  const [currentProject, setCurrentProject] = useState<any>(null)
  const [currentTask, setCurrentTask] = useState<any>(null)
  const [currentTopic, setCurrentTopic] = useState<any>(null)
  const [subtasks, setSubtasks] = useState<any[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const isActive = state.status === 'working' || state.status === 'learning'
  const isPaused = state.status === 'paused'
  const isWork = state.sessionType === 'work'

  useEffect(() => {
    api.timer.getState().then(setState)
    const u1 = api.timer.onTick(setTick)
    const u2 = api.timer.onStateChange((s: TimerState) => {
      setState(s)
      // 加载当前会话关联的信息
      if (s.projectId && s.sessionType === 'work') {
        api.projects.list().then(ps => setCurrentProject(ps.find((p: any) => p.id === s.projectId) || null))
        if (s.taskId) {
          api.tasks.listByProject(s.projectId).then(ts => {
            const task = ts.find((t: any) => t.id === s.taskId)
            setCurrentTask(task || null)
            if (task) api.tasks.listSubtasks(task.id).then(setSubtasks)
          })
        }
      } else if (s.sessionType === 'learning') {
        // 学习会话：加载主题信息
        api.learning.listTopics().then(ts => setCurrentTopic(ts.find((t: any) => t.id === s.topicId) || null))
      }
      if (s.status === 'idle') {
        setCurrentProject(null); setCurrentTask(null); setCurrentTopic(null); setSubtasks([])
      }
    })
    return () => { u1(); u2() }
  }, [])

  const handleAddSubtask = async () => {
    if (!newSubtask.trim() || !currentTask?.id) return
    await api.tasks.createSubtask({ parentId: currentTask.id, name: newSubtask.trim() })
    setNewSubtask('')
    api.tasks.listSubtasks(currentTask.id).then(setSubtasks)
  }

  const handleToggleSubtask = async (id: string) => {
    await api.tasks.toggleSubtask(id)
    if (currentTask?.id) api.tasks.listSubtasks(currentTask.id).then(setSubtasks)
  }

  const handleRefreshReports = async () => {
    setRefreshing(true)
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date()
    const w = (() => { const s = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); const d = s.getUTCDay() || 7; s.setUTCDate(s.getUTCDate() + 4 - d); const ys = new Date(Date.UTC(s.getUTCFullYear(), 0, 1)); return { y: s.getUTCFullYear(), w: Math.ceil((((s.getTime() - ys.getTime()) / 86400000) + 1) / 7) } })()
    try {
      await api.reports.refreshDaily(today)
      await api.reports.refreshWeekly(w.y, w.w)
      await api.reports.refreshMonthly(now.getFullYear(), now.getMonth() + 1)
    } catch { /* ignore */ }
    setRefreshing(false)
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">⚡ {t('gui.sidebar.workbench')}</h2>

      {/* 计时器 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : isPaused ? 'bg-yellow-400' : 'bg-slate-500'}`} />
          <span className="text-sm text-slate-400">
            {isActive ? (isWork ? t('gui.pulseBar.working') : t('gui.pulseBar.learning'))
              : isPaused ? t('gui.pulseBar.paused') : t('gui.pulseBar.idle')}
          </span>
        </div>

        <div className="text-5xl font-mono font-bold mb-3">{fmt(tick.effectiveMs)}</div>

        <div className="text-sm text-slate-400 mb-1">
          {t('gui.pulseBar.workLabel')} {Math.round(tick.todayWorkMinutes / 60)}h{Math.round(tick.todayWorkMinutes % 60)}m · {t('gui.pulseBar.learningLabel')} {Math.round(tick.todayLearningMinutes / 60)}h{Math.round(tick.todayLearningMinutes % 60)}m
        </div>

        {(isActive || isPaused) && (
          <div className="flex gap-2 justify-center mt-4">
            {isPaused ? (
              <button onClick={() => api.timer.resume()} className="bg-green-600 hover:bg-green-500 text-white rounded-lg px-6 py-2 text-sm font-medium flex items-center gap-1.5"><Play size={16} />{t('gui.pulseBar.resume')}</button>
            ) : (
              <button onClick={() => api.timer.pause()} className="bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg px-6 py-2 text-sm font-medium flex items-center gap-1.5"><Pause size={16} />{t('gui.pulseBar.pause')}</button>
            )}
            <button onClick={() => api.timer.stop()} className="bg-red-600/70 hover:bg-red-500 text-white rounded-lg px-6 py-2 text-sm font-medium flex items-center gap-1.5"><Square size={16} />{t('gui.pulseBar.stop')}</button>
          </div>
        )}
      </div>

      {/* 会话信息（只读） */}
      {(currentProject || currentTopic) && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="font-medium text-sm mb-3">📋 {isWork ? '工作信息' : '学习信息'}</h3>
          {isWork && currentProject && (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="text-slate-500 w-16">项目:</span><span className="text-white">{currentProject.name}</span></div>
              {currentTask && <div className="flex gap-2"><span className="text-slate-500 w-16">任务:</span><span className="text-white">{currentTask.name}</span></div>}
            </div>
          )}
          {!isWork && currentTopic && (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="text-slate-500 w-16">分类:</span><span className="text-white">{currentTopic.category_name}</span></div>
              <div className="flex gap-2"><span className="text-slate-500 w-16">主题:</span><span className="text-white">{currentTopic.name}</span></div>
            </div>
          )}
        </div>
      )}

      {/* 子任务（仅工作模式） */}
      {isWork && currentTask && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="font-medium text-sm mb-3">☑ 子任务</h3>
          <div className="space-y-1 mb-3">
            {subtasks.map((st: any) => (
              <button key={st.id} onClick={() => handleToggleSubtask(st.id)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${st.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-300 hover:bg-slate-700/50'}`}>
                <span className={st.status === 'done' ? 'text-green-400' : 'text-slate-600'}>
                  {st.status === 'done' ? <Check size={16} /> : <div className="w-4 h-4 rounded border border-slate-600" />}
                </span>
                {st.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
              placeholder="添加子任务..." className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600" />
            <button onClick={handleAddSubtask} disabled={!newSubtask.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-3 py-2 text-xs flex items-center gap-1"><Plus size={14} /></button>
          </div>
        </div>
      )}

      {/* 报表刷新 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">📊 报表</h3>
            <p className="text-xs text-slate-500 mt-1">基于当前所有记录重新生成日报、周报、月报</p>
          </div>
          <button onClick={handleRefreshReports} disabled={refreshing}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-1.5 whitespace-nowrap">
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {refreshing ? '更新中...' : '🔄 更新报表'}
          </button>
        </div>
      </div>
    </div>
  )
}
