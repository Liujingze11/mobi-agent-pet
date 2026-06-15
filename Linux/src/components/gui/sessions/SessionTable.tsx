import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'
import { formatSeconds } from '../../../lib/ipc'

export default function SessionTable() {
  const [workSessions, setWorkSessions] = useState<any[]>([])
  const [learningSessions, setLearningSessions] = useState<any[]>([])
  const [tab, setTab] = useState<'work' | 'learning'>('work')

  useEffect(() => {
    api.sessions.listWork({ limit: 50 }).then(setWorkSessions)
    api.sessions.listLearning({ limit: 50 }).then(setLearningSessions)
  }, [])

  const sessions = tab === 'work' ? workSessions : learningSessions

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">📝 记录查看</h2>

      <div className="flex gap-2">
        <button onClick={() => setTab('work')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'work' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
          工作记录
        </button>
        <button onClick={() => setTab('learning')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'learning' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
          学习记录
        </button>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs">
              <th className="text-left px-4 py-3">日期</th>
              <th className="text-left px-4 py-3">{tab === 'work' ? '项目' : '主题'}</th>
              <th className="text-left px-4 py-3">开始</th>
              <th className="text-left px-4 py-3">结束</th>
              <th className="text-left px-4 py-3">时长</th>
              <th className="text-left px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s: any) => (
              <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-750">
                <td className="px-4 py-3 text-xs">{s.start_time?.slice(0, 10)}</td>
                <td className="px-4 py-3">{s.project_name || s.topic_name || '-'}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{s.start_time?.slice(11, 16)}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{s.end_time?.slice(11, 16) || '-'}</td>
                <td className="px-4 py-3">{formatSeconds(s.effective_seconds || 0)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    s.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {s.status === 'completed' ? '已完成' : s.status === 'paused' ? '已暂停' : '进行中'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.length === 0 && <p className="text-slate-500 text-sm text-center py-8">暂无记录</p>}
      </div>
    </div>
  )
}
