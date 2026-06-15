import { useEffect, useRef } from 'react'

interface Props {
  status: string
  effectiveMs: number
  onClick: () => void
}

const statusColors: Record<string, string> = {
  idle: '#6366f1',
  working: '#3b82f6',
  learning: '#22c55e',
  deep_focus: '#f59e0b',
  paused: '#6b7280'
}

const statusGlow: Record<string, string> = {
  idle: 'rgba(99,102,241,0.3)',
  working: 'rgba(59,130,246,0.4)',
  learning: 'rgba(34,197,94,0.4)',
  deep_focus: 'rgba(245,158,11,0.5)',
  paused: 'rgba(107,114,128,0.15)'
}

function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function PulseCore({ status, effectiveMs, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let phase = 0

    const draw = () => {
      const { width, height } = canvas
      const cx = width / 2
      const cy = height / 2
      const color = statusColors[status] || statusColors.idle
      const glow = statusGlow[status] || statusGlow.idle

      ctx.clearRect(0, 0, width, height)

      // 外圈呼吸发光
      const breatheScale = status === 'paused' ? 0.3
        : status === 'deep_focus' ? 0.5 + Math.sin(phase * 0.5) * 0.1
        : 0.6 + Math.sin(phase * 0.8) * 0.3
      const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, 45 * breatheScale)
      gradient.addColorStop(0, glow)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, 45 * breatheScale, 0, Math.PI * 2)
      ctx.fill()

      // 脉冲波纹
      if ((status === 'working' || status === 'learning')) {
        const ripplePhase = (phase * 2) % (Math.PI * 2)
        for (let i = 0; i < 2; i++) {
          const r = 25 + ((ripplePhase + i * Math.PI) % (Math.PI * 2)) / (Math.PI * 2) * 20
          const alpha = 0.3 * (1 - (r - 25) / 20)
          ctx.strokeStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // 核心球体
      const coreScale = status === 'paused' ? 0.85
        : status === 'deep_focus' ? 1 + Math.sin(phase * 0.3) * 0.03
        : 1 + Math.sin(phase * 1.5) * 0.05
      const coreRadius = 20 * coreScale
      const coreGradient = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, coreRadius)
      coreGradient.addColorStop(0, '#ffffff')
      coreGradient.addColorStop(0.3, color)
      coreGradient.addColorStop(1, '#000000')
      ctx.fillStyle = coreGradient
      ctx.beginPath()
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2)
      ctx.fill()

      // 心跳动画
      if (status === 'working' || status === 'learning') {
        const beatPhase = (phase * 6) % (Math.PI * 2)
        const beatScale = 1 + (beatPhase < 0.5 ? Math.sin(beatPhase * Math.PI * 2) * 0.08 : 0)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(beatScale, beatScale)
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(0, 0, coreRadius + 3, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // 计时显示
      if (status !== 'idle' && effectiveMs > 0) {
        ctx.fillStyle = '#ffffff'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(formatTimer(effectiveMs), cx, cy + 40)
      }

      // 状态文字
      if (status !== 'idle') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '8px sans-serif'
        ctx.textAlign = 'center'
        const labels: Record<string, string> = {
          working: '工作中', learning: '学习中',
          deep_focus: '深度专注', paused: '已暂停'
        }
        ctx.fillText(labels[status] || '', cx, cy + 52)
      }

      phase += 0.05
      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [status, effectiveMs])

  return (
    <div className="pulsecore-core inline-flex flex-col items-center cursor-pointer" onClick={onClick}>
      <canvas ref={canvasRef} width={120} height={140} className="block" />
    </div>
  )
}
