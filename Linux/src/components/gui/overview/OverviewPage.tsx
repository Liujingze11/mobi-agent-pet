import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../../lib/ipc'
import { formatSeconds } from '../../../lib/ipc'

function StatCard({ title, value, subtitle, color }: { title: string; value: string; subtitle?: string; color: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  )
}

export default function OverviewPage() {
  const [stats, setStats] = useState<any>(null)
  const [dailyData, setDailyData] = useState<any[]>([])

  useEffect(() => {
    api.timer.getTodayStats().then(setStats)
    const days: any[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      api.reports.getDaily(dateStr).then((r: any) => {
        if (r) {
          const data = JSON.parse(r.content_json)
          days.push({
            date: dateStr.slice(5),
            work: Math.round(data.totalWorkMinutes / 60 * 10) / 10,
            learning: Math.round(data.totalLearningMinutes / 60 * 10) / 10
          })
          if (days.length === 7) setDailyData(days.sort((a, b) => a.date.localeCompare(b.date)))
        }
      })
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">👋 下午好</h2>
        <p className="text-slate-400 text-sm mt-1">
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="今日研发" value={stats ? formatSeconds(stats.workSeconds) : '--'} color="text-blue-400" />
        <StatCard title="今日学习" value={stats ? formatSeconds(stats.learningSeconds) : '--'} color="text-green-400" />
        <StatCard title="Session 数" value={String(stats?.sessionCount || 0)} color="text-indigo-400" subtitle="今日完成" />
      </div>

      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="font-medium mb-4 text-sm">📊 本周趋势</h3>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Bar dataKey="work" fill="#3b82f6" name="研发(h)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="learning" fill="#22c55e" name="学习(h)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-sm text-center py-8">暂无数据，开始记录后这里会显示趋势图</p>
        )}
      </div>
    </div>
  )
}
