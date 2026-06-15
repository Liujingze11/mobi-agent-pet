import { useState, useEffect } from 'react'
import { api } from '../../lib/ipc'

interface Props {
  timerState: any
  tick: any
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onStartWork: (projectId: string, taskId?: string) => void
  onStartLearning: (topicId: string) => void
  onOpenGui: () => void
  onClose: () => void
}

function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function QuickPanel({
  timerState, tick, onPause, onResume, onStop,
  onStartWork, onStartLearning, onOpenGui, onClose
}: Props) {
  const [projects, setProjects] = useState<any[]>([])
  const [topics, setTopics] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [selectedTopic, setSelectedTopic] = useState('')
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

  const statusLabels: Record<string, string> = {
    working: '工作中', learning: '学习中', deep_focus: '深度专注', paused: '已暂停', idle: '空闲'
  }

  return (
    <div className="absolute left-full ml-4 top-0 w-64 bg-slate-800/95 backdrop-blur-lg rounded-xl border border-slate-700 shadow-2xl p-4 animate-fade-in text-white text-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : isPaused ? 'bg-yellow-400' : 'bg-slate-500'}`} />
          <span className="font-medium text-xs">{statusLabels[timerState.status]}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      {isActive || isPaused ? (
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
        <div className="space-y-3">
          {mode === 'idle' && (
            <div className="space-y-2">
              <button onClick={() => setMode('selecting-work')} className="w-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded-lg py-2.5 text-xs font-medium border border-blue-500/30">
                💼 开始工作
              </button>
              <button onClick={() => setMode('selecting-learning')} className="w-full bg-green-600/20 hover:bg-green-600/40 text-green-300 rounded-lg py-2.5 text-xs font-medium border border-green-500/30">
                📚 开始学习
              </button>
              <button onClick={onOpenGui} className="w-full bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg py-2 text-xs">
                📊 打开管理面板
              </button>
            </div>
          )}

          {mode === 'selecting-work' && (
            <div className="space-y-2">
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
                <option value="">选择项目...</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {tasks.length > 0 && (
                <select value={selectedTask} onChange={e => setSelectedTask(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
                  <option value="">选择任务（可选）...</option>
                  {tasks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <button onClick={() => setMode('idle')} className="flex-1 bg-slate-700 text-slate-300 rounded-lg py-2 text-xs">返回</button>
                <button disabled={!selectedProject} onClick={() => onStartWork(selectedProject, selectedTask || undefined)}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg py-2 text-xs font-medium">
                  开始
                </button>
              </div>
            </div>
          )}

          {mode === 'selecting-learning' && (
            <div className="space-y-2">
              <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-xs border border-slate-600">
                <option value="">选择知识主题...</option>
                {topics.map((t: any) => <option key={t.id} value={t.id}>{t.category_name} / {t.name}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => setMode('idle')} className="flex-1 bg-slate-700 text-slate-300 rounded-lg py-2 text-xs">返回</button>
                <button disabled={!selectedTopic} onClick={() => onStartLearning(selectedTopic)}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg py-2 text-xs font-medium">
                  开始
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
