import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'
import { formatSeconds } from '../../../lib/ipc'
import { useI18n } from '../../../lib/i18n'

export default function TaskList() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [tasks, setTasks] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  useEffect(() => { api.projects.list().then(setProjects) }, [])
  useEffect(() => {
    if (selectedProject) api.tasks.listByProject(selectedProject).then(setTasks)
    else setTasks([])
  }, [selectedProject])

  const handleCreate = async () => {
    if (!selectedProject) return
    await api.tasks.create({ projectId: selectedProject, ...form })
    setForm({ name: '', description: '' }); setShowForm(false)
    api.tasks.listByProject(selectedProject).then(setTasks)
  }
  const handleUpdateStatus = async (id: string, status: string) => {
    await api.tasks.update(id, { status })
    api.tasks.listByProject(selectedProject).then(setTasks)
  }

  const statusLabels: Record<string, string> = { todo: '待开始', in_progress: '进行中', done: '已完成', paused: '已暂停' }
  const statusColors: Record<string, string> = { todo: 'bg-slate-600', in_progress: 'bg-blue-500', done: 'bg-green-500', paused: 'bg-yellow-500' }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t('gui.tasks.title')}</h2>
      <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
        className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700">
        <option value="">{t('gui.pulseBar.selectProject')}</option>
        {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {selectedProject && (
        <>
          <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm">
            {t('gui.tasks.newTask')}
          </button>
          {showForm && (
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={t('gui.tasks.taskName')} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={!form.name}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm">{t('gui.projects.create')}</button>
                <button onClick={() => setShowForm(false)} className="bg-slate-700 text-white rounded-lg px-4 py-2 text-sm">{t('gui.projects.cancel')}</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {tasks.map((t: any) => (
              <div key={t.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-slate-400">{t.description || ''} · {formatSeconds(t.total_seconds)}</div>
                </div>
                <select value={t.status} onChange={e => handleUpdateStatus(t.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded-full text-white ${statusColors[t.status]}`}>
                  {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
