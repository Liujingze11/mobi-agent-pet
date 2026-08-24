import { useState, useEffect } from 'react'
import { api } from '../../lib/ipc'

type Mode = 'work' | 'learning'

interface Props {
  mode: Mode
  onStart: () => void  // 通知父组件：已开始，关闭弹窗
  onCancel: () => void
}

export default function WorkDialog({ mode, onStart, onCancel }: Props) {
  // ---- 工作态 ----
  const [projects, setProjects] = useState<any[]>([])
  const [selProject, setSelProject] = useState('')
  const [taskName, setTaskName] = useState('')
  const [workTopicId, setWorkTopicId] = useState('')
  // ---- 学习态 ----
  const [topics, setTopics] = useState<any[]>([])
  const [selTopic, setSelTopic] = useState('')
  const [learnContent, setLearnContent] = useState('')
  // ---- 新建项目 ----
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const isWork = mode === 'work'

  useEffect(() => {
    api.projects.list().then(setProjects)
    api.learning.listTopics().then(setTopics)
  }, [])

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    const p = await api.projects.create({ name: newProjectName.trim() })
    setProjects(prev => [...prev, p])
    setSelProject(p.id)
    setNewProjectName('')
    setShowNewProject(false)
  }

  const handleSubmit = async () => {
    if (isWork) {
      if (!selProject || !taskName.trim()) return
      // 创建主任务 → 开始计时
      const task = await api.tasks.create({ projectId: selProject, name: taskName.trim() })
      await api.timer.startWork(selProject, task.id)
    } else {
      if (!selTopic) return
      await api.timer.startLearning(selTopic)
    }
    onStart()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-[400px] shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">
          {isWork ? '💼 开始工作' : '📚 开始学习'}
        </h2>

        <div className="space-y-4">
          {isWork ? (
            <>
              {/* 项目 */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">项目 *</label>
                {showNewProject ? (
                  <div className="flex gap-2">
                    <input autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                      placeholder="项目名称" className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
                    <button onClick={handleCreateProject} disabled={!newProjectName.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-3 py-2 text-sm">创建</button>
                    <button onClick={() => setShowNewProject(false)} className="text-slate-400 hover:text-white px-2">✕</button>
                  </div>
                ) : (
                  <select value={selProject} onChange={e => { if (e.target.value === '__new__') setShowNewProject(true); else setSelProject(e.target.value) }}
                    className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
                    <option value="">选择项目...</option>
                    {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__new__">＋ 新建项目...</option>
                  </select>
                )}
              </div>

              {/* 任务名 */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">任务名称 *</label>
                <input value={taskName} onChange={e => setTaskName(e.target.value)}
                  placeholder="本次要做什么？" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
              </div>

              {/* 关联知识 */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">关联知识（可选）</label>
                <select value={workTopicId} onChange={e => setWorkTopicId(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
                  <option value="">不关联</option>
                  {topics.map((t: any) => <option key={t.id} value={t.id}>{t.category_name} / {t.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              {/* 学习主题 */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">知识主题 *</label>
                <select value={selTopic} onChange={e => setSelTopic(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
                  <option value="">选择知识主题...</option>
                  {topics.map((t: any) => <option key={t.id} value={t.id}>{t.category_name} / {t.name}</option>)}
                </select>
              </div>

              {/* 学习内容 */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">学习内容</label>
                <input value={learnContent} onChange={e => setLearnContent(e.target.value)}
                  placeholder="学什么？" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 text-sm">
            取消
          </button>
          <button onClick={handleSubmit}
            disabled={isWork ? (!selProject || !taskName.trim()) : !selTopic}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium text-white disabled:bg-slate-700 disabled:text-slate-500 ${
              isWork ? 'bg-blue-600 hover:bg-blue-500' : 'bg-green-600 hover:bg-green-500'
            }`}>
            ▶ 开始计时
          </button>
        </div>
      </div>
    </div>
  )
}
