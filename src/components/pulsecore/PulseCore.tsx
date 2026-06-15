import { useEffect, useRef } from 'react'

export type PetForm = 'energyCore' | 'pulseRing' | 'hexCrystal' | 'dataStream'

interface Props {
  form: PetForm
  status: string
  effectiveMs: number
  onMouseUp: (e: React.MouseEvent) => void
}

const statusColors: Record<string, string> = {
  idle: '#6366f1', working: '#3b82f6', learning: '#22c55e',
  deep_focus: '#f59e0b', paused: '#6b7280'
}
const statusGlow: Record<string, string> = {
  idle: 'rgba(99,102,241,0.35)', working: 'rgba(59,130,246,0.45)',
  learning: 'rgba(34,197,94,0.45)', deep_focus: 'rgba(245,158,11,0.5)',
  paused: 'rgba(107,114,128,0.2)'
}

function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ============================================================
//  绘制函数 — 4 种形态
// ============================================================

function drawEnergyCore(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, glow: string, phase: number, status: string) {
  const breatheScale = status === 'paused' ? 0.3 : status === 'deep_focus' ? 0.5 + Math.sin(phase * 0.5) * 0.1 : 0.6 + Math.sin(phase * 0.8) * 0.3
  const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 45 * breatheScale)
  grad.addColorStop(0, glow)
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(cx, cy, 45 * breatheScale, 0, Math.PI * 2); ctx.fill()

  // 波纹
  if (status === 'working' || status === 'learning') {
    const rp = (phase * 2) % (Math.PI * 2)
    for (let i = 0; i < 2; i++) {
      const r = 25 + ((rp + i * Math.PI) % (Math.PI * 2)) / (Math.PI * 2) * 20
      const a = 0.3 * (1 - (r - 25) / 20)
      ctx.strokeStyle = `${color}${Math.round(a * 255).toString(16).padStart(2, '0')}`
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    }
  }

  // 核心球
  const cs = status === 'paused' ? 0.85 : status === 'deep_focus' ? 1 + Math.sin(phase * 0.3) * 0.03 : 1 + Math.sin(phase * 1.5) * 0.05
  const cr = 20 * cs
  const cg = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, cr)
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.3, color); cg.addColorStop(1, '#000000')
  ctx.fillStyle = cg
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill()

  // 心跳
  if (status === 'working' || status === 'learning') {
    const bp = (phase * 6) % (Math.PI * 2)
    const bs = 1 + (bp < 0.5 ? Math.sin(bp * Math.PI * 2) * 0.08 : 0)
    ctx.save(); ctx.translate(cx, cy); ctx.scale(bs, bs)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(0, 0, cr + 3, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
}

function drawPulseRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, _glow: string, phase: number, status: string) {
  // 双层旋转光环
  const speed = status === 'paused' ? 0.3 : 1
  const alpha = status === 'paused' ? 0.2 : 0.7

  for (let ring = 0; ring < 2; ring++) {
    const dir = ring === 0 ? 1 : -1
    const rot = phase * speed * dir
    const segments = 12
    for (let i = 0; i < segments; i++) {
      const ang = (i / segments) * Math.PI * 2 + rot
      const r = 22 + ring * 12
      const x = cx + Math.cos(ang) * r
      const y = cy + Math.sin(ang) * r
      const segAlpha = alpha * (0.4 + 0.6 * Math.abs(Math.sin(i / segments * Math.PI)))
      ctx.fillStyle = `${color}${Math.round(segAlpha * 255).toString(16).padStart(2, '0')}`
      ctx.beginPath(); ctx.arc(x, y, 3 + ring * 1.5, 0, Math.PI * 2); ctx.fill()
    }
  }
  // 中心小核
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10)
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, color); cg.addColorStop(1, 'transparent')
  ctx.fillStyle = cg
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill()
}

function drawHexCrystal(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, glow: string, phase: number, status: string) {
  const rotation = phase * 0.3
  const size = 22
  const breathe = status === 'paused' ? 0.9 : 1 + Math.sin(phase * 0.7) * 0.06

  // 发光
  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 38)
  grad.addColorStop(0, glow); grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.fill()

  // 六边形
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation); ctx.scale(breathe, breathe)
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(a) * size; const y = Math.sin(a) * size
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.stroke()

  // 内六边形
  ctx.globalAlpha = 0.4; ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + Math.PI / 6
    const x = Math.cos(a) * size * 0.55; const y = Math.sin(a) * size * 0.55
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.stroke()
  ctx.restore()

  // 中心点
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill()
}

function drawDataStream(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, _glow: string, phase: number, status: string) {
  const count = 20
  const alpha = status === 'paused' ? 0.15 : 0.6
  // 粒子流
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + phase * 0.8
    const r = 10 + Math.sin(i * 1.7 + phase * 2) * 22
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    const size = 1.5 + Math.abs(Math.cos(i + phase)) * 2.5
    const pa = alpha * (0.3 + 0.7 * (r / 32))
    ctx.fillStyle = `${color}${Math.round(pa * 255).toString(16).padStart(2, '0')}`
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
  }
  // 中心
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8)
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, color)
  ctx.fillStyle = cg
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill()
}

// ============================================================
//  Component
// ============================================================

const drawFns: Record<PetForm, typeof drawEnergyCore> = {
  energyCore: drawEnergyCore,
  pulseRing: drawPulseRing,
  hexCrystal: drawHexCrystal,
  dataStream: drawDataStream,
}

const formNames: Record<PetForm, string> = {
  energyCore: '能量核心',
  pulseRing: '脉冲光环',
  hexCrystal: '六棱晶核',
  dataStream: '数据流',
}

export { formNames }

export default function PulseCore({ form, status, effectiveMs, onMouseUp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let phase = 0
    const color = statusColors[status] || statusColors.idle
    const glow = statusGlow[status] || statusGlow.idle
    const drawFn = drawFns[form] || drawEnergyCore

    const draw = () => {
      const { width, height } = canvas
      const cx = width / 2
      const cy = height / 2
      ctx.clearRect(0, 0, width, height)

      drawFn(ctx, cx, cy, color, glow, phase, status)

      // 计时
      if (status !== 'idle' && effectiveMs > 0) {
        ctx.fillStyle = '#ffffff'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(formatTimer(effectiveMs), cx, cy + 42)
      }
      if (status !== 'idle') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'
        const labels: Record<string, string> = { working: '工作中', learning: '学习中', deep_focus: '深度专注', paused: '已暂停' }
        ctx.fillText(labels[status] || '', cx, cy + 54)
      }

      phase += 0.05
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [form, status, effectiveMs])

  return (
    <div
      className="pulsecore-core"
      style={{ width: 120, height: 150 }}
      onMouseUp={onMouseUp}
    >
      <canvas ref={canvasRef} width={120} height={150} className="block" />
    </div>
  )
}
