import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../../lib/ipc'
import { useI18n } from '../../lib/i18n'
import { PetForm, getPet, petRegistry, spawnParticles, updateParticles } from './pets'
import type { Particle } from './pets'

export type PetFormId = string

interface Props {
  form: PetFormId
  status: string
  effectiveMs: number
  onMouseUp: (e: React.MouseEvent) => void
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export { petRegistry }
export type { PetForm }

export default function PulseCore({ form, status, effectiveMs, onMouseUp }: Props) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const [scale, setScale] = useState(1)

  useEffect(() => { api.settings.get('pet_scale').then(v => { if (v) setScale(Number(v) || 1) }) }, [])

  const handleWheel = useCallback(async (e: React.WheelEvent) => {
    e.preventDefault()
    const newScale = Math.max(0.6, Math.min(2, scale - e.deltaY * 0.001))
    setScale(newScale)
    api.settings.set('pet_scale', String(newScale))
    await api.window.resize(newScale)
  }, [scale])

  // 初始化粒子
  useEffect(() => {
    const pet = getPet(form)
    const count = pet?.particleCount || 25
    particlesRef.current = spawnParticles(60, 75, count, 35, 0.4)
  }, [form])

  // 动画循环
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return

    let animId: number, phase = 0
    const pet = getPet(form)

    const draw = () => {
      const { width, height } = canvas; const cx = width / 2, cy = height / 2
      ctx.clearRect(0, 0, width, height)

      updateParticles(particlesRef.current, cx, cy, 0.05, 0.15, status)

      if (pet) {
        pet.draw(ctx, cx, cy, phase, status, particlesRef.current, scale)
      }

      // 计时器文字
      if (status !== 'idle' && effectiveMs > 0) {
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.round(12 * scale)}px monospace`; ctx.textAlign = 'center'
        ctx.fillText(fmt(effectiveMs), cx, cy + 44 * scale)
      }
      if (status !== 'idle') {
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.font = `${Math.round(9 * scale)}px sans-serif`; ctx.textAlign = 'center'
        const labels: Record<string, string> = {
          working: t('pulsecore.status.working'), learning: t('pulsecore.status.learning'),
          deepFocus: t('pulsecore.status.deepFocus'), paused: t('pulsecore.status.paused')
        }
        ctx.fillText(labels[status] || '', cx, cy + 58 * scale)
      }
      phase += 0.05; animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [form, status, effectiveMs, scale])

  const size = Math.round(120 * scale)
  const h = Math.round(150 * scale)

  return (
    <div className="pulsecore-core" style={{ width: size, height: h }} onMouseUp={onMouseUp} onWheel={handleWheel}>
      <canvas ref={canvasRef} width={size} height={h} className="block" />
    </div>
  )
}
