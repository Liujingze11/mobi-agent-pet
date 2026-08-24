import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'
import { useI18n } from '../../../lib/i18n'

export default function AchievementWall() {
  const { t, language } = useI18n()
  const [achievements, setAchievements] = useState<any[]>([])

  useEffect(() => { api.achievements.listUnlocked().then(setAchievements) }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t('gui.achievements.title')}</h2>
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
                      🎉 {new Date(a.unlocked_at).toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {achievements.length === 0 && <p className="text-slate-500 text-sm text-center py-8">{t('gui.achievements.noData')}</p>}
    </div>
  )
}
