import { useEffect, useRef } from 'react'
import { useI18n } from '../../../lib/i18n'
import type { PetFormId } from '../../pulsecore/PulseCore'
import { petRegistry, getPet, spawnParticles, updateParticles } from '../../pulsecore/pets'

interface Props {
  current: PetFormId
  onChange: (id: PetFormId) => void
}

export default function PetSelector({ current, onChange }: Props) {
  const { t } = useI18n()

  return (
    <div>
      <label className="text-xs text-slate-400 mb-2 block">桌面宠物</label>
      <div className="grid grid-cols-3 gap-3">
        {petRegistry.map(pet => (
          <button
            key={pet.id}
            onClick={() => onChange(pet.id)}
            className={`relative rounded-xl p-2 border-2 transition-all ${
              current === pet.id
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-slate-700 bg-slate-800 hover:border-slate-600'
            }`}
          >
            <PetPreview petId={pet.id} />
            <div className="text-xs text-slate-300 mt-2">{t(`pulsecore.forms.${pet.id}`) || pet.displayName}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function PetPreview({ petId }: { petId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pet = getPet(petId); if (!pet) return
    const w = canvas.width, h = canvas.height
    const cx = w / 2, cy = h / 2 - 2
    const particles = spawnParticles(cx, cy, pet.particleCount, 30, 0.3)

    let animId: number, phase = 0
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      updateParticles(particles, cx, cy, 0.04, 0.12, 'idle')
      pet.draw(ctx, cx, cy, phase, 'idle', particles, 0.7)
      phase += 0.04
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [petId])

  return <canvas ref={canvasRef} width={100} height={100} className="mx-auto" />
}
