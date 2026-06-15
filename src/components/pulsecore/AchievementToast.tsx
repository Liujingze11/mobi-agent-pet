import { useEffect, useState } from 'react'

interface Props {
  achievement: any
  onDone: () => void
}

export default function AchievementToast({ achievement, onDone }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDone, 300)
    }, 3000)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
      visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
    }`}>
      <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 rounded-xl p-4 backdrop-blur-lg shadow-2xl animate-achievement-burst">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{achievement.icon || '🏆'}</span>
          <div>
            <div className="text-amber-400 font-semibold text-sm">{achievement.name}</div>
            <div className="text-amber-300/70 text-xs">{achievement.description}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
