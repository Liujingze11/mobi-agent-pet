import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'

export default function AchievementWall() {
  const [achievements, setAchievements] = useState<any[]>([])

  useEffect(() => {
    api.achievements.listUnlocked().then(setAchievements)
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">🏆 成就墙</h2>
      <div className="grid grid-cols-3 gap-3">
        {achievements.map((a: any) => {
          const unlocked = !!a.unlocked_at
          return (
            <div key={a.key} className={`rounded-xl p-4 border ${unlocked ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 border-slate-800 opacity-50'}`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{unlocked ? a.icon : '🔒'}</span>
                <div>
                  <div className={`font-semibold text-sm ${unlocked ? 'text-white' : 'text-slate-500'}`}>{a.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{a.description}</div>
                  {unlocked && (
                    <div className="text-xs text-amber-400 mt-1">
                      🎉 {new Date(a.unlocked_at).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
