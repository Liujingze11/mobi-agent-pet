import { useState, useEffect } from 'react'
import { FolderOpen, Sparkles, Loader2, Folder } from 'lucide-react'
import { api } from '../../../lib/ipc'
import { formatSeconds } from '../../../lib/ipc'

export default function ProjectList() {
  const [projects, setProjects] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#6366f1', sourceFolder: '' })
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState('')

  const load = () => api.projects.list().then(setProjects)
  useEffect(() => { load() }, [])

  const handlePickFolder = async () => {
    const folder = await api.dialog.openFolder()
    if (!folder) return
    setForm(p => ({ ...p, sourceFolder: folder }))
  }

  const handleAIScan = async () => {
    if (!form.sourceFolder) return
    setScanning(true)
    setScanStatus('正在读取文件夹...')
    try {
      setScanStatus('🤖 AI 正在分析项目结构...')
      const result = await api.projectTools.scanFolder(form.sourceFolder)
      setForm(p => ({
        ...p,
        name: result.name || p.name,
        description: result.description || p.description,
        color: result.color || p.color
      }))
      setScanStatus(`✅ AI 解析完成！技术栈: ${result.techStack || '自动检测'}`)
      setTimeout(() => setScanStatus(''), 4000)
    } catch {
      setScanStatus('❌ AI 解析失败，请手动填写')
      setTimeout(() => setScanStatus(''), 3000)
    } finally {
      setScanning(false)
    }
  }

  const handleCreate = async () => {
    await api.projects.create({
      name: form.name,
      description: form.description,
      color: form.color,
      sourceFolder: form.sourceFolder || undefined
    })
    setForm({ name: '', description: '', color: '#6366f1', sourceFolder: '' })
    setShowForm(false)
    setScanStatus('')
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
        <button onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium">
          + 新建项目
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-3">
          {/* 文件夹选择 */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">导入项目文件夹</label>
            <div className="flex gap-2">
              <button onClick={handlePickFolder}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600">
                <FolderOpen size={15} /> 选择文件夹
              </button>
              {form.sourceFolder && (
                <button onClick={handleAIScan} disabled={scanning}
                  className="flex items-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 rounded-lg px-3 py-2 text-sm border border-amber-500/30 disabled:opacity-50">
                  {scanning ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {scanning ? 'AI 解析中...' : 'AI 自动填写'}
                </button>
              )}
            </div>
            {form.sourceFolder && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
                <Folder size={12} /> {form.sourceFolder}
              </div>
            )}
            {scanStatus && (
              <div className={`text-xs mt-1.5 ${scanStatus.startsWith('✅') ? 'text-green-400' : scanStatus.startsWith('❌') ? 'text-red-400' : 'text-amber-300'}`}>
                {scanning && <Loader2 size={12} className="inline animate-spin mr-1" />}
                {scanStatus}
              </div>
            )}
          </div>

          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="项目名称" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2}
            placeholder="项目描述" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 resize-none" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm">创建</button>
            <button onClick={() => { setShowForm(false); setScanStatus('') }}
              className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm">取消</button>
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
                <div className="text-xs text-slate-400">
                  {p.description || '无描述'} · {formatSeconds(p.total_seconds)}
                  {p.source_folder && <span className="ml-2 text-slate-600">📂 {p.source_folder.split('/').slice(-2).join('/')}</span>}
                </div>
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
