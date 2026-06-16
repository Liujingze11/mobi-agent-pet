// ============================================================
//  PetForm 基类 + 各形态子类 (OOP)
// ============================================================

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; size: number }
export interface PetColors { main: string; glow: string; accent: string; dark: string }

function hexa(hex: string, a: number) { return hex + Math.round(a * 255).toString(16).padStart(2, '0') }

export function spawnParticles(cx: number, cy: number, count: number, spread: number, speed: number): Particle[] {
  const arr: Particle[] = []
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * spread
    arr.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed, life: Math.random(), size: 0.8 + Math.random() * 2.5 })
  }
  return arr
}

export function updateParticles(p: Particle[], cx: number, cy: number, dt: number, pull: number, status: string) {
  if (status === 'paused') return
  for (const o of p) {
    o.x += o.vx * dt; o.y += o.vy * dt
    o.vx += (cx - o.x) * pull * dt; o.vy += (cy - o.y) * pull * dt
    o.life -= dt * 0.15
    if (o.life <= 0) { o.life = 1; const a = Math.random() * Math.PI * 2; const r = 18 + Math.random() * 28; o.x = cx + Math.cos(a) * r; o.y = cy + Math.sin(a) * r }
  }
}

// ============================================================
//  基类
// ============================================================
export abstract class PetForm {
  abstract readonly id: string
  abstract readonly displayName: string
  abstract colors(status: string): PetColors
  abstract draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, particles: Particle[], scale?: number): void
  particleCount = 25
}

// ============================================================
//  Heart path helper
// ============================================================
function drawHeartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s)
  ctx.beginPath()
  ctx.moveTo(0, 18)
  ctx.bezierCurveTo(-34, -6, -56, -36, -14, -52)
  ctx.bezierCurveTo(12, -64, 0, -40, 0, -24)
  ctx.bezierCurveTo(0, -40, 16, -64, 38, -52)
  ctx.bezierCurveTo(80, -36, 58, -6, 0, 18)
  ctx.closePath()
  ctx.restore()
}

// ============================================================
//  1. 心脏 ❤️ — 心室血液充涌 + 收缩喷涌
// ============================================================
export class HeartbeatForm extends PetForm {
  readonly id = 'heartbeat'
  readonly displayName = '心跳'
  particleCount = 60

  colors(status: string): PetColors {
    const map: Record<string, PetColors> = {
      idle:       { main: '#dc2626', glow: 'rgba(220,38,38,0.30)',  accent: '#b91c1c', dark: '#2d0000' },
      working:    { main: '#ef4444', glow: 'rgba(239,68,68,0.50)',  accent: '#dc2626', dark: '#3b0000' },
      learning:   { main: '#ef4444', glow: 'rgba(239,68,68,0.50)',  accent: '#dc2626', dark: '#3b0000' },
      deep_focus: { main: '#f87171', glow: 'rgba(248,113,113,0.55)', accent: '#ef4444', dark: '#450000' },
      paused:     { main: '#9ca3af', glow: 'rgba(156,163,175,0.2)', accent: '#6b7280', dark: '#1f2937' },
    }
    return map[status] || map.idle
  }

  /** 血液充涌强度：在 0(空) ~ 1(满) 之间随心跳周期变化 */
  private fillLevel(phase: number, status: string): number {
    if (status === 'idle')   return 0.45 + Math.sin(phase * 0.8) * 0.10
    if (status === 'paused') return 0.35
    const t = (phase * 3.5) % (Math.PI * 2)
    // Systole 收缩期 — 血液快速充满
    if (t < 0.25)       return Math.sin(t / 0.25 * Math.PI * 0.5) * 0.7 + 0.3
    if (t < 0.4)        return 1.0 - Math.sin((t - 0.25) / 0.15 * Math.PI * 0.5) * 0.4
    // Diastole 舒张期 — 部分回流
    if (t < 0.6)        return 0.6 - Math.sin((t - 0.4) / 0.2 * Math.PI * 0.5) * 0.15
    // 第二次收缩 (dub)
    if (t < 0.85)       return 0.45 + Math.sin((t - 0.6) / 0.25 * Math.PI * 0.5) * 0.55
    // 缓缓回流
    return 0.45 - Math.sin((t - 0.85) / 0.15 * Math.PI * 0.5) * 0.15
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, particles: Particle[], scale = 1) {
    const c = this.colors(status)
    const fill = this.fillLevel(phase, status)
    const s = scale * 0.9
    const active = status !== 'idle' && status !== 'paused'

    // 心脏尺寸随充血微微膨胀
    const heartScale = (0.92 + fill * 0.10) * s

    // ======== 1. 外层血雾光晕 ========
    const glowR = (25 + fill * 30) * s
    const go = ctx.createRadialGradient(cx, cy, 6 * s, cx, cy, glowR)
    go.addColorStop(0, `rgba(220,30,30,${0.25 + fill * 0.3})`)
    go.addColorStop(0.6, `rgba(120,10,10,${0.12 + fill * 0.1})`)
    go.addColorStop(1, 'transparent')
    ctx.fillStyle = go; ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill()

    // ======== 2. 心脏外壳（暗红器官壁）========
    const outerGrad = ctx.createRadialGradient(cx, cy - 5 * s, 2 * s, cx, cy + 5 * s, 48 * heartScale)
    outerGrad.addColorStop(0, '#5c1010')
    outerGrad.addColorStop(0.6, c.dark)
    outerGrad.addColorStop(1, '#0d0000')
    ctx.fillStyle = outerGrad
    drawHeartPath(ctx, cx, cy - 3 * s, heartScale)
    ctx.fill()
    ctx.strokeStyle = hexa(c.accent, 0.5); ctx.lineWidth = 1.8 * s; ctx.stroke()

    // ======== 3. 血液充涌层（心室内部亮红血液上下起伏）========
    ctx.save()
    drawHeartPath(ctx, cx, cy - 3 * s, heartScale * 0.88)
    ctx.clip()

    // 血液液面：用线性渐变模拟血液从底部充上来
    const topY = cy + 20 * s - fill * 44 * s  // fill=1 时液面到顶部
    const bloodGrad = ctx.createLinearGradient(cx, topY, cx, cy + 22 * s)
    bloodGrad.addColorStop(0, `rgba(255,60,60,${0.85 * fill})`)     // 液面顶点 — 鲜红
    bloodGrad.addColorStop(0.15, `rgba(230,30,30,${0.8 * fill})`)
    bloodGrad.addColorStop(0.5, `rgba(180,15,15,${0.7 * fill})`)
    bloodGrad.addColorStop(1, `rgba(80,5,5,${0.3 * fill})`)         // 底部暗红
    ctx.fillStyle = bloodGrad
    ctx.fillRect(cx - 40 * s, topY, 80 * s, cy + 22 * s - topY)

    // 液面波动微调
    if (fill > 0.5) {
      ctx.fillStyle = `rgba(255,100,80,${0.3 * fill})`
      ctx.beginPath()
      ctx.ellipse(cx, topY, 22 * s, 3 * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // ======== 4. 主动脉喷涌粒子（心脏收缩时血液射出）========
    if (fill > 0.7 && active) {
      const burstCount = Math.floor((fill - 0.7) / 0.3 * 12)
      for (let i = 0; i < burstCount; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.6  // 向上喷射
        const dist = 30 * s + Math.random() * 20 * s * (fill - 0.7)
        const sx = cx + Math.cos(ang) * 12 * s, sy = cy - 30 * s + Math.sin(ang) * 8 * s
        ctx.fillStyle = hexa(c.main, 0.7 * fill)
        ctx.beginPath(); ctx.arc(sx + Math.cos(ang) * dist, sy + Math.sin(ang) * dist, 2 + Math.random() * 2.5 * s, 0, Math.PI * 2); ctx.fill()
      }
    }

    // ======== 5. 内部血液粒子（心室内的血细胞）========
    for (const p of particles) {
      const px = cx + (p.x - cx) * 0.5, py = cy + (p.y - cy) * 0.5  // 粒子限制在内圈
      const alpha = 0.25 + fill * 0.55
      ctx.fillStyle = hexa(fill > 0.5 ? '#ff4444' : '#cc2222', alpha)
      ctx.beginPath(); ctx.arc(px, py, p.size * s * (0.6 + fill * 0.5), 0, Math.PI * 2); ctx.fill()
    }

    // ======== 6. 中心高光反射 ========
    const hlx = cx - 3 * s, hly = cy - 20 * s
    const hlg = ctx.createRadialGradient(hlx, hly, 1 * s, hlx, hly, 10 * s)
    hlg.addColorStop(0, 'rgba(255,200,180,0.45)')
    hlg.addColorStop(1, 'transparent')
    ctx.fillStyle = hlg
    ctx.beginPath(); ctx.arc(hlx, hly, 10 * s, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,240,230,0.4)'
    ctx.beginPath(); ctx.arc(hlx - 1 * s, hly - 3 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill()
  }
}

// ============================================================
//  2. 能量核心
// ============================================================
export class EnergyCoreForm extends PetForm {
  readonly id = 'energyCore'
  readonly displayName = '能量核心'
  particleCount = 25

  colors(status: string): PetColors {
    const map: Record<string, PetColors> = {
      idle:       { main: '#818cf8', glow: 'rgba(99,102,241,0.4)',  accent: '#6366f1', dark: '#312e81' },
      working:    { main: '#60a5fa', glow: 'rgba(59,130,246,0.5)',  accent: '#3b82f6', dark: '#1e3a5f' },
      learning:   { main: '#4ade80', glow: 'rgba(34,197,94,0.5)',   accent: '#22c55e', dark: '#14532d' },
      deep_focus: { main: '#fbbf24', glow: 'rgba(245,158,11,0.55)', accent: '#f59e0b', dark: '#78350f' },
      paused:     { main: '#6b7280', glow: 'rgba(107,114,128,0.2)', accent: '#9ca3af', dark: '#1f2937' },
    }
    return map[status] || map.idle
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, particles: Particle[], scale = 1) {
    const c = this.colors(status)
    const intensity = status === 'paused' ? 0.25 : status === 'deep_focus' ? 0.7 + Math.sin(phase * 0.4) * 0.1 : 0.8 + Math.sin(phase * 0.7) * 0.2
    const s = scale

    const grad = ctx.createRadialGradient(cx, cy, 8 * s, cx, cy, 52 * intensity * s)
    grad.addColorStop(0, c.glow); grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, 52 * intensity * s, 0, Math.PI * 2); ctx.fill()

    for (let i = 0; i < 3; i++) {
      const arcR = (26 + i * 8) * s, arcA = phase * (1.2 + i * 0.3)
      ctx.strokeStyle = hexa(c.main, 0.15 + i * 0.08); ctx.lineWidth = (1 + i * 0.5) * s
      ctx.beginPath(); ctx.arc(cx, cy, arcR, arcA, arcA + Math.PI * 1.3); ctx.stroke()
    }

    if (status === 'working' || status === 'learning') {
      const rp = (phase * 2.5) % (Math.PI * 2)
      for (let i = 0; i < 3; i++) {
        const r = (20 + ((rp + i * Math.PI * 0.67) % (Math.PI * 2)) / (Math.PI * 2) * 30) * s
        ctx.strokeStyle = hexa(c.accent, 0.35 * (1 - (r / s - 20) / 30))
        ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      }
    }

    for (const p of particles) {
      const d = Math.hypot(p.x - cx, p.y - cy) / (35 * s)
      ctx.fillStyle = hexa(c.main, 0.3 + d * 0.5)
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * s, 0, Math.PI * 2); ctx.fill()
    }

    const cs = status === 'paused' ? 0.75 : 1 + Math.sin(phase * 1.8) * 0.04
    const cr = 18 * cs * s
    const cg = ctx.createRadialGradient(cx - 4 * s, cy - 4 * s, s, cx, cy, cr)
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.25, c.main); cg.addColorStop(1, c.dark)
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath(); ctx.arc(cx - cr * 0.25, cy - cr * 0.3, cr * 0.22, 0, Math.PI * 2); ctx.fill()
  }
}

// ============================================================
//  3. 脉冲光环
// ============================================================
export class PulseRingForm extends PetForm {
  readonly id = 'pulseRing'
  readonly displayName = '脉冲光环'
  particleCount = 25

  colors(status: string): PetColors { return new EnergyCoreForm().colors(status) }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, _particles: Particle[], scale = 1) {
    const c = this.colors(status)
    const intensity = status === 'paused' ? 0.2 : 0.9; const s = scale
    for (let ring = 0; ring < 3; ring++) {
      const dir = ring % 2 === 0 ? 1 : -1; const rot = phase * (1 + ring * 0.4) * dir
      const r = (16 + ring * 10) * s; const segs = 10 + ring * 4
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2 + rot
        const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r
        const alpha = intensity * (0.35 + 0.65 * Math.abs(Math.sin(i / segs * Math.PI + phase)))
        ctx.fillStyle = hexa(c.main, alpha)
        ctx.beginPath(); ctx.arc(sx, sy, (2.5 + ring * 0.8) * s, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.strokeStyle = hexa(c.accent, intensity * 0.15); ctx.lineWidth = 0.5 * s
    ctx.setLineDash([2 * s, 4 * s]); ctx.lineDashOffset = phase * 15 * s
    ctx.beginPath(); ctx.arc(cx, cy, 24 * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = c.main; ctx.shadowColor = c.accent; ctx.shadowBlur = 10 * intensity * s
    ctx.beginPath(); ctx.arc(cx, cy, 7 * s, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
  }
}

// ============================================================
//  4. 六棱晶核
// ============================================================
export class HexCrystalForm extends PetForm {
  readonly id = 'hexCrystal'
  readonly displayName = '六棱晶核'
  particleCount = 0

  colors(status: string): PetColors { return new EnergyCoreForm().colors(status) }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, _particles: Particle[], scale = 1) {
    const c = this.colors(status); const rot = phase * 0.4; const sz = 24 * scale
    const intensity = status === 'paused' ? 0.3 : 1
    ctx.fillStyle = c.glow; ctx.beginPath(); ctx.arc(cx, cy, 38 * intensity * scale, 0, Math.PI * 2); ctx.fill()
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot)
    ctx.strokeStyle = hexa(c.main, 0.8 * intensity); ctx.lineWidth = 2.5 * scale
    ctx.beginPath()
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * sz, y = Math.sin(a) * sz; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
    ctx.closePath(); ctx.stroke()
    ctx.strokeStyle = hexa(c.accent, 0.4 * intensity); ctx.lineWidth = 1 * scale
    ctx.beginPath()
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2 + Math.PI / 6; const ix = Math.cos(a) * sz * 0.5, iy = Math.sin(a) * sz * 0.5; i === 0 ? ctx.moveTo(ix, iy) : ctx.lineTo(ix, iy) }
    ctx.closePath(); ctx.stroke()
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; ctx.fillStyle = hexa(c.main, intensity); ctx.beginPath(); ctx.arc(Math.cos(a) * sz, Math.sin(a) * sz, 3 * scale, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8 * scale)
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.6, c.main); cg.addColorStop(1, c.dark)
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 8 * scale, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = hexa(c.accent, 0.6 * intensity); ctx.lineWidth = 1.2 * scale
    ctx.beginPath(); ctx.arc(cx, cy, 12 * scale, 0, Math.PI * 2); ctx.stroke()
  }
}

// ============================================================
//  5. 数据流
// ============================================================
export class DataStreamForm extends PetForm {
  readonly id = 'dataStream'
  readonly displayName = '数据流'
  particleCount = 0

  colors(status: string): PetColors { return new EnergyCoreForm().colors(status) }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, _particles: Particle[], scale = 1) {
    const c = this.colors(status); const count = 30; const intensity = status === 'paused' ? 0.12 : 0.7; const s = scale
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + phase * 1.1; const r = (8 + Math.sin(i * 2.3 + phase * 2.5) * 26) * s
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r
      const sz = (1.2 + Math.abs(Math.cos(i + phase * 1.7)) * 3) * s
      ctx.fillStyle = hexa(c.main, intensity * (0.3 + (r / s / 34) * 0.6))
      ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill()
    }
    const scanY = cy - 28 * s + ((phase * 12) % 56) * s
    const sg = ctx.createLinearGradient(cx - 30 * s, scanY - 6 * s, cx + 30 * s, scanY + 6 * s)
    sg.addColorStop(0, 'transparent'); sg.addColorStop(0.5, hexa(c.main, 0.25)); sg.addColorStop(1, 'transparent')
    ctx.fillStyle = sg; ctx.fillRect(cx - 30 * s, scanY - 2 * s, 60 * s, 4 * s)
    ctx.fillStyle = c.main; ctx.shadowColor = c.accent; ctx.shadowBlur = 8 * intensity * s
    ctx.beginPath(); ctx.arc(cx, cy, 5 * s, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
  }
}

// ============================================================
//  注册表
// ============================================================
export const petRegistry: PetForm[] = [
  new HeartbeatForm(),
  new EnergyCoreForm(),
  new PulseRingForm(),
  new HexCrystalForm(),
  new DataStreamForm(),
]

export function getPet(id: string): PetForm | undefined {
  return petRegistry.find(p => p.id === id)
}
