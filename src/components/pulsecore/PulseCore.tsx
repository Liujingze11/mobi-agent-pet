import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../../lib/ipc'

export type PetForm = 'energyCore' | 'pulseRing' | 'hexCrystal' | 'dataStream'

interface Props {
  form: PetForm
  status: string
  effectiveMs: number
  onMouseUp: (e: React.MouseEvent) => void
}

// ============================================================
//  配色
// ============================================================
const palette: Record<string, { main: string; glow: string; accent: string; dark: string }> = {
  idle:        { main: '#818cf8', glow: 'rgba(99,102,241,0.4)',  accent: '#6366f1', dark: '#312e81' },
  working:     { main: '#60a5fa', glow: 'rgba(59,130,246,0.5)',  accent: '#3b82f6', dark: '#1e3a5f' },
  learning:    { main: '#4ade80', glow: 'rgba(34,197,94,0.5)',   accent: '#22c55e', dark: '#14532d' },
  deep_focus:  { main: '#fbbf24', glow: 'rgba(245,158,11,0.55)', accent: '#f59e0b', dark: '#78350f' },
  paused:      { main: '#6b7280', glow: 'rgba(107,114,128,0.2)', accent: '#9ca3af', dark: '#1f2937' },
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function hexa(hex: string, a: number) { return hex + Math.round(a * 255).toString(16).padStart(2, '0') }

// ============================================================
//  Sci-fi 粒子 / 特效工具
// ============================================================
interface Particle { x: number; y: number; vx: number; vy: number; life: number; size: number }

function spawnParticles(cx: number, cy: number, count: number, spread: number, speed: number): Particle[] {
  const arr: Particle[] = []
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * spread
    arr.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed, life: Math.random(), size: 0.8 + Math.random() * 2.5 })
  }
  return arr
}

function updateParticles(p: Particle[], cx: number, cy: number, dt: number, pull: number) {
  for (const o of p) {
    o.x += o.vx * dt; o.y += o.vy * dt
    o.vx += (cx - o.x) * pull * dt; o.vy += (cy - o.y) * pull * dt
    o.life -= dt * 0.15
    if (o.life <= 0) { o.life = 1; const a = Math.random() * Math.PI * 2; const r = 18 + Math.random() * 28; o.x = cx + Math.cos(a) * r; o.y = cy + Math.sin(a) * r }
  }
}

// ============================================================
//  4 形态的绘制
// ============================================================

type ColorSet = { main: string; glow: string; accent: string; dark: string }

function drawEnergyCore(ctx: CanvasRenderingContext2D, cx: number, cy: number, c: ColorSet, phase: number, status: string, particles: Particle[]) {
  const intensity = status === 'paused' ? 0.25 : status === 'deep_focus' ? 0.7 + Math.sin(phase * 0.4) * 0.1 : 0.8 + Math.sin(phase * 0.7) * 0.2

  // 外层光环
  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 52 * intensity)
  grad.addColorStop(0, c.glow); grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(cx, cy, 52 * intensity, 0, Math.PI * 2); ctx.fill()

  // 能量弧线
  for (let i = 0; i < 3; i++) {
    const arcR = 26 + i * 8
    const arcA = phase * (1.2 + i * 0.3)
    ctx.strokeStyle = hexa(c.main, 0.15 + i * 0.08)
    ctx.lineWidth = 1 + i * 0.5
    ctx.beginPath(); ctx.arc(cx, cy, arcR, arcA, arcA + Math.PI * 1.3); ctx.stroke()
  }

  // 脉冲波纹 (working/learning)
  if (status === 'working' || status === 'learning') {
    const rp = (phase * 2.5) % (Math.PI * 2)
    for (let i = 0; i < 3; i++) {
      const r = 20 + ((rp + i * Math.PI * 0.67) % (Math.PI * 2)) / (Math.PI * 2) * 30
      ctx.strokeStyle = hexa(c.accent, 0.35 * (1 - (r - 20) / 30))
      ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    }
  }

  // 粒子
  for (const p of particles) {
    const d = Math.hypot(p.x - cx, p.y - cy) / 35
    ctx.fillStyle = hexa(c.main, 0.3 + d * 0.5)
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
  }

  // 核心
  const cs = status === 'paused' ? 0.75 : 1 + Math.sin(phase * 1.8) * 0.04
  const cr = 18 * cs
  const cg = ctx.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, cr)
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.25, c.main); cg.addColorStop(1, c.dark)
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill()

  // 高光闪烁
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  const flx = cx - cr * 0.25 + Math.sin(phase * 3) * 2
  const fly = cy - cr * 0.3 + Math.cos(phase * 3) * 2
  ctx.beginPath(); ctx.arc(flx, fly, cr * 0.22, 0, Math.PI * 2); ctx.fill()
}

function drawPulseRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, c: ColorSet, phase: number, status: string, particles: Particle[]) {
  const intensity = status === 'paused' ? 0.2 : 0.9
  // 三层旋转环，不同速度方向
  for (let ring = 0; ring < 3; ring++) {
    const dir = ring % 2 === 0 ? 1 : -1
    const rot = phase * (1 + ring * 0.4) * dir
    const r = 16 + ring * 10
    const segs = 10 + ring * 4
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2 + rot
      const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r
      const alpha = intensity * (0.35 + 0.65 * Math.abs(Math.sin(i / segs * Math.PI + phase)))
      ctx.fillStyle = hexa(c.main, alpha)
      ctx.beginPath(); ctx.arc(sx, sy, 2.5 + ring * 0.8, 0, Math.PI * 2); ctx.fill()
    }
  }
  // 连接线
  ctx.strokeStyle = hexa(c.accent, intensity * 0.15)
  ctx.lineWidth = 0.5; ctx.setLineDash([2, 4]); ctx.lineDashOffset = phase * 15
  ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])

  // 核心
  ctx.fillStyle = c.main; ctx.shadowColor = c.accent; ctx.shadowBlur = 10 * intensity
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
}

function drawHexCrystal(ctx: CanvasRenderingContext2D, cx: number, cy: number, c: ColorSet, phase: number, status: string, _particles: Particle[]) {
  const rot = phase * 0.4, sz = 24, intensity = status === 'paused' ? 0.3 : 1

  // 发光
  ctx.fillStyle = c.glow
  ctx.beginPath(); ctx.arc(cx, cy, 38 * intensity, 0, Math.PI * 2); ctx.fill()

  // 外层六边形
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot)
  ctx.strokeStyle = hexa(c.main, 0.8 * intensity); ctx.lineWidth = 2.5
  ctx.beginPath()
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * sz, y = Math.sin(a) * sz; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
  ctx.closePath(); ctx.stroke()

  // 内层六边形 + 连线
  ctx.strokeStyle = hexa(c.accent, 0.4 * intensity); ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 - Math.PI / 2 + Math.PI / 6
    const ix = Math.cos(a) * sz * 0.5, iy = Math.sin(a) * sz * 0.5
    i === 0 ? ctx.moveTo(ix, iy) : ctx.lineTo(ix, iy)
  }
  ctx.closePath(); ctx.stroke()

  // 顶点能量点
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 - Math.PI / 2
    ctx.fillStyle = hexa(c.main, intensity)
    ctx.beginPath(); ctx.arc(Math.cos(a) * sz, Math.sin(a) * sz, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  // 中心
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8)
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.6, c.main); cg.addColorStop(1, c.dark)
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = hexa(c.accent, 0.6 * intensity); ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke()
}

function drawDataStream(ctx: CanvasRenderingContext2D, cx: number, cy: number, c: ColorSet, phase: number, status: string, _particles: Particle[]) {
  const count = 30, intensity = status === 'paused' ? 0.12 : 0.7
  // 数据粒子流
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + phase * 1.1
    const r = 8 + Math.sin(i * 2.3 + phase * 2.5) * 26
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r
    const sz = 1.2 + Math.abs(Math.cos(i + phase * 1.7)) * 3
    ctx.fillStyle = hexa(c.main, intensity * (0.3 + (r / 34) * 0.6))
    ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill()
  }
  // 扫描线
  const scanY = cy - 28 + ((phase * 12) % 56)
  const sg = ctx.createLinearGradient(cx - 30, scanY - 6, cx + 30, scanY + 6)
  sg.addColorStop(0, 'transparent'); sg.addColorStop(0.5, hexa(c.main, 0.25)); sg.addColorStop(1, 'transparent')
  ctx.fillStyle = sg; ctx.fillRect(cx - 30, scanY - 2, 60, 4)
  // 中心
  ctx.fillStyle = c.main; ctx.shadowColor = c.accent; ctx.shadowBlur = 8 * intensity
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
}

// ============================================================
//  组件
// ============================================================
const drawFns = { energyCore: drawEnergyCore, pulseRing: drawPulseRing, hexCrystal: drawHexCrystal, dataStream: drawDataStream }
export const formNames: Record<string, string> = { energyCore: '能量核心', pulseRing: '脉冲光环', hexCrystal: '六棱晶核', dataStream: '数据流' }

export default function PulseCore({ form, status, effectiveMs, onMouseUp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const [scale, setScale] = useState(1)

  // 加载缩放
  useEffect(() => { api.settings.get('pet_scale').then(v => { if (v) setScale(Number(v) || 1) }) }, [])

  // 滚轮缩放
  const handleWheel = useCallback(async (e: React.WheelEvent) => {
    e.preventDefault()
    const newScale = Math.max(0.6, Math.min(2, scale - e.deltaY * 0.001))
    setScale(newScale)
    api.settings.set('pet_scale', String(newScale))
    await api.window.resize(newScale)
  }, [scale])

  useEffect(() => {
    particlesRef.current = spawnParticles(60, 75, 25, 35, 0.4)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return

    let animId: number, phase = 0
    const col = palette[status] || palette.idle
    const drawFn = drawFns[form] || drawEnergyCore

    const draw = () => {
      const { width, height } = canvas; const cx = width / 2, cy = height / 2
      ctx.clearRect(0, 0, width, height)

      // 更新粒子
      if (status !== 'paused') updateParticles(particlesRef.current, cx, cy, 0.05, 0.15)

      drawFn(ctx, cx, cy, col, phase, status, particlesRef.current)

      // UI 文字
      if (status !== 'idle' && effectiveMs > 0) {
        ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.round(12 * scale)}px monospace`; ctx.textAlign = 'center'
        ctx.fillText(fmt(effectiveMs), cx, cy + 44 * scale)
      }
      if (status !== 'idle') {
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.font = `${Math.round(9 * scale)}px sans-serif`; ctx.textAlign = 'center'
        const labels: Record<string, string> = { working: '● 工作中', learning: '● 学习中', deep_focus: '◉ 深度专注', paused: '◌ 已暂停' }
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
