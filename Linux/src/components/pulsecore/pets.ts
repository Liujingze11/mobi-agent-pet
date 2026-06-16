// ============================================================
//  PetForm 基类 + 各形态子类 (OOP)
// ============================================================

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; size: number }

export interface PetColors { main: string; glow: string; accent: string; dark: string }

function hexa(hex: string, a: number) { return hex + Math.round(a * 255).toString(16).padStart(2, '0') }

// ---- 粒子工具 ----
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

  /** 返回各状态对应的配色 */
  abstract colors(status: string): PetColors

  /** 在 canvas 上绘制一帧 */
  abstract draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, particles: Particle[], scale?: number): void

  /** 可选：粒子数量覆写 */
  particleCount = 25
}

// ============================================================
//  1. 赛博心跳 ❤️‍🔥
// ============================================================
export class HeartbeatForm extends PetForm {
  readonly id = 'heartbeat'
  readonly displayName = '心跳'
  particleCount = 30

  colors(status: string): PetColors {
    const map: Record<string, PetColors> = {
      idle:       { main: '#f43f5e', glow: 'rgba(244,63,94,0.35)',  accent: '#e11d48', dark: '#4c0519' },
      working:    { main: '#f43f5e', glow: 'rgba(244,63,94,0.55)',  accent: '#fb7185', dark: '#4c0519' },
      learning:   { main: '#f43f5e', glow: 'rgba(244,63,94,0.55)',  accent: '#fb7185', dark: '#4c0519' },
      deep_focus: { main: '#fb7185', glow: 'rgba(251,113,133,0.6)', accent: '#f43f5e', dark: '#4c0519' },
      paused:     { main: '#9ca3af', glow: 'rgba(156,163,175,0.2)', accent: '#6b7280', dark: '#1f2937' },
    }
    return map[status] || map.idle
  }

  private drawHeartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s)
    ctx.beginPath()
    ctx.moveTo(0, 15)
    ctx.bezierCurveTo(-30, -5, -50, -30, -12, -45)
    ctx.bezierCurveTo(10, -55, 0, -35, 0, -20)
    ctx.bezierCurveTo(0, -35, 12, -55, 32, -45)
    ctx.bezierCurveTo(70, -30, 50, -5, 0, 15)
    ctx.closePath()
    ctx.restore()
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, _particles: Particle[], scale = 1) {
    const c = this.colors(status)
    const t = phase * 3.5
    const cycle = t % (Math.PI * 2)
    let beat = 1
    if (status === 'idle') { beat = 1 + Math.sin(phase * 0.8) * 0.03 }
    else if (status === 'paused') { beat = 0.92 }
    else if (cycle < 0.3) { beat = 1 + Math.sin(cycle / 0.3 * Math.PI) * 0.12 }
    else if (cycle < 0.5) { beat = 1 - Math.sin((cycle - 0.3) / 0.2 * Math.PI) * 0.05 }
    else if (cycle < 0.8) { beat = 1 + Math.sin((cycle - 0.5) / 0.3 * Math.PI) * 0.08 }
    else if (cycle < 1.0) { beat = 1 - Math.sin((cycle - 0.8) / 0.2 * Math.PI) * 0.04 }

    const s = scale * 0.9

    // 废土光晕 — 暗色弥散
    const glowR = 55 * beat * s
    const grad = ctx.createRadialGradient(cx, cy, 5 * s, cx, cy, glowR)
    grad.addColorStop(0, c.glow); grad.addColorStop(0.7, hexa(c.dark, 0.3)); grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill()

    // 赛博脉冲波纹
    if (status !== 'idle' && status !== 'paused') {
      const ripple = ((phase * 2) % (Math.PI * 2)) / (Math.PI * 2)
      for (let i = 0; i < 2; i++) {
        const r = (35 + ((ripple + i * 0.5) % 1) * 30) * s
        ctx.strokeStyle = hexa(c.accent, 0.35 * (1 - (r / s - 35) / 30))
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      }
      // 野粒子
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + phase * 0.4
        const dist = (38 + Math.sin(i * 1.9 + phase * 0.6) * 12) * s
        const px = cx + Math.cos(ang) * dist, py = cy + Math.sin(ang) * dist
        ctx.fillStyle = hexa(c.accent, 0.35)
        ctx.beginPath(); ctx.arc(px, py, 1.5 * s, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 爱心本体 — 暗红带黑
    const bodyGrad = ctx.createRadialGradient(cx, cy - 8 * s, 2 * s, cx, cy, 50 * s)
    bodyGrad.addColorStop(0, c.main); bodyGrad.addColorStop(0.7, c.dark); bodyGrad.addColorStop(1, '#0a0000')
    ctx.fillStyle = bodyGrad
    this.drawHeartPath(ctx, cx, cy - 2 * s, beat * s)
    ctx.fill()
    ctx.strokeStyle = hexa(c.accent, 0.7); ctx.lineWidth = 1.5
    ctx.stroke()

    // 赛博纹理 — 电路般的裂痕线
    ctx.save()
    this.drawHeartPath(ctx, cx, cy - 2 * s, beat * s * 0.85)
    ctx.clip()
    ctx.strokeStyle = hexa(c.accent, 0.15); ctx.lineWidth = 0.6
    for (let i = 0; i < 5; i++) {
      const lx = cx - 20 + i * 10 + Math.sin(phase + i) * 3
      ctx.beginPath(); ctx.moveTo(lx, cy - 40); ctx.lineTo(lx + 8, cy + 10)
      ctx.stroke()
    }
    // 水平断线
    for (let i = 0; i < 3; i++) {
      const ly = cy - 25 + i * 15
      ctx.beginPath(); ctx.moveTo(cx - 30, ly); ctx.lineTo(cx + 30, ly + Math.cos(phase + i) * 4)
      ctx.stroke()
    }
    ctx.restore()

    // 霓虹边线 — 外轮廓 glow
    this.drawHeartPath(ctx, cx, cy - 2 * s, beat * s * 1.05)
    ctx.strokeStyle = hexa(c.accent, 0.3); ctx.lineWidth = 3
    ctx.stroke()

    // 中心亮核
    const hlx = cx - 3 * s, hly = cy - 16 * s
    const coreGrad = ctx.createRadialGradient(hlx, hly, 1 * s, hlx, hly, 14 * beat * s)
    coreGrad.addColorStop(0, 'rgba(255,200,200,0.7)'); coreGrad.addColorStop(0.5, hexa(c.main, 0.4)); coreGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = coreGrad; ctx.beginPath(); ctx.arc(hlx, hly, 14 * beat * s, 0, Math.PI * 2); ctx.fill()

    // 小白点
    ctx.fillStyle = 'rgba(255,220,220,0.6)'
    ctx.beginPath(); ctx.arc(hlx - 1 * s, hly - 3 * s, 3 * beat * s, 0, Math.PI * 2); ctx.fill()
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

  colors(status: string): PetColors {
    return new EnergyCoreForm().colors(status)  // 复用配色
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, _particles: Particle[], scale = 1) {
    const c = this.colors(status)
    const intensity = status === 'paused' ? 0.2 : 0.9
    const s = scale
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

  colors(status: string): PetColors {
    return new EnergyCoreForm().colors(status)
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, _particles: Particle[], scale = 1) {
    const c = this.colors(status)
    const rot = phase * 0.4; const sz = 24 * scale
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

    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 - Math.PI / 2
      ctx.fillStyle = hexa(c.main, intensity)
      ctx.beginPath(); ctx.arc(Math.cos(a) * sz, Math.sin(a) * sz, 3 * scale, 0, Math.PI * 2); ctx.fill()
    }
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

  colors(status: string): PetColors {
    return new EnergyCoreForm().colors(status)
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, phase: number, status: string, _particles: Particle[], scale = 1) {
    const c = this.colors(status)
    const count = 30; const intensity = status === 'paused' ? 0.12 : 0.7
    const s = scale
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + phase * 1.1
      const r = (8 + Math.sin(i * 2.3 + phase * 2.5) * 26) * s
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
