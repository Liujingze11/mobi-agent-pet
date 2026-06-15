import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'
import { formatSeconds } from '../../../lib/ipc'

export default function ProjectList() {
  const [projects, setProjects] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#6366f1' })

  const load = () => api.projects.list().then(setProjects)

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    await api.projects.create(form)
    setForm({ name: '', description: '', color: '#6366f1' })
    setShowForm(false)
    load()
  }

  const handleArchive = async (id: string) => {
    await api.projects.remove(id)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">📁 项目管理</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium">
          + 新建项目
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="项目名称" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="项目描述" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm">创建</button>
            <button onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {projects.map((p: any) => (
          <div key={p.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              <div>
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-slate-400">{p.description || '无描述'} · {formatSeconds(p.total_seconds)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/20 text-slate-400'}`}>
                {p.status === 'active' ? '活跃' : p.status === 'completed' ? '已完成' : '已归档'}
              </span>
              {p.status !== 'archived' && (
                <button onClick={() => handleArchive(p.id)} className="text-slate-500 hover:text-red-400 text-xs">归档</button>
              )}
            </div>
          </div>
        ))}
        {projects.length === 0 && <p className="text-slate-500 text-sm text-center py-8">暂无项目，点击上方按钮创建</p>}
      </div>
    </div>
  )
}
