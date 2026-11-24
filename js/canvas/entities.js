import { RARITIES } from '../config.js';
import { projectPitch } from './themes.js';

const FORMATION_SLOTS = [
  { x: 0.12, y: 0.5 },  // 1 - Portiere / Difesa bassa
  { x: 0.32, y: 0.28 }, // 2 - Difensore alto
  { x: 0.36, y: 0.74 }, // 3 - Mediano basso
  { x: 0.58, y: 0.34 }, // 4 - Ala / Trequartista
  { x: 0.68, y: 0.66 }, // 5 - Punta
];

const RIVAL_SLOTS = [
  { x: 0.80, y: 0.32, num: 4 },
  { x: 0.78, y: 0.68, num: 5 },
  { x: 0.56, y: 0.54, num: 8 },
  { x: 0.44, y: 0.38, num: 11 },
];

export class StadiumEntities {
  constructor() {
    this.ball = {
      nx: 0.5,
      ny: 0.5,
      vx: 0,
      vy: 0,
      z: 0,
      vz: 0,
      spin: 0,
      passTimer: 1.8,
      glowTimer: 0,
    };
    this.ballTrail = [];

    this.players = [];
    this.rivals = RIVAL_SLOTS.map((s, idx) => ({
      id: `opp_${idx}`,
      homeX: s.x,
      homeY: s.y,
      nx: s.x,
      ny: s.y,
      tx: s.x,
      ty: s.y,
      vx: 0,
      vy: 0,
      jerseyNumber: s.num,
      moveTimer: 0.5 + idx * 0.4,
      phase: idx * 1.3,
    }));

    // Portiere avversario nella porta destra (si tuffa davvero sui tiri!)
    this.rivalKeeper = {
      nx: 0.945,
      ny: 0.5,
      targetNy: 0.5,
      diveTimer: 0,
      diveDuration: 0.68,
      diveDir: 0, // -1 su, +1 giù, 0 centrale
    };

    this.particles = [];
    this.floatingTexts = [];
    this.crowdBubbles = [];
    this.confetti = [];
    this.fireworks = [];

    this.env = {
      dog: { active: false, nx: -0.1, ny: 0.5, dir: 1, cooldown: 6 },
      netBulgeLeft: 0,
      netBulgeRight: 0,
      netVelLeft: 0,
      netVelRight: 0,
      olaIntensity: 0,
      olaPhase: 0,
      tapComboTimestamps: [],
    };
  }

  syncTopPlayers(topFive) {
    const next = [];
    for (let i = 0; i < topFive.length; i++) {
      const data = topFive[i];
      const slot = FORMATION_SLOTS[i] || { x: 0.5, y: 0.5 };
      const existing = this.players.find((p) => p.id === data.id);
      if (existing) {
        existing.data = data;
        existing.homeX = slot.x;
        existing.homeY = slot.y;
        next.push(existing);
      } else {
        next.push({
          id: data.id,
          data,
          homeX: slot.x,
          homeY: slot.y,
          nx: slot.x,
          ny: slot.y,
          tx: slot.x,
          ty: slot.y,
          vx: 0,
          vy: 0,
          moveTimer: 0.5 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    this.players = next;
  }

  spawnCrowdBubble(text, { color = '#fef08a', nx = null } = {}) {
    const bx = nx !== null ? nx : 0.18 + Math.random() * 0.64;
    this.crowdBubbles.push({
      nx: bx,
      text,
      color,
      life: 1.55,
      maxLife: 1.55,
    });
    if (this.crowdBubbles.length > 4) this.crowdBubbles.shift();
  }

  triggerOpponentKeeperDive(targetNy = 0.5, saved = false) {
    const gk = this.rivalKeeper;
    gk.diveDuration = 0.72;
    gk.diveTimer = gk.diveDuration;
    if (saved) {
      gk.diveDir = targetNy < gk.ny ? -1 : 1;
      gk.targetNy = Math.max(0.39, Math.min(0.61, targetNy));
    } else {
      // Tuffo spettacolare in ritardo / dall'altro lato sul gol!
      gk.diveDir = targetNy < 0.5 ? 1 : -1;
      gk.targetNy = gk.diveDir < 0 ? 0.40 : 0.60;
    }
  }

  registerTapCombo() {
    const now = performance.now();
    const list = this.env.tapComboTimestamps;
    list.push(now);
    while (list.length > 0 && now - list[0] > 1600) {
      list.shift();
    }
    if (list.length >= 4) {
      const wasLow = this.env.olaIntensity < 0.2;
      this.env.olaIntensity = Math.min(1, this.env.olaIntensity + 0.35);
      if (wasLow && Math.random() < 0.45) {
        this.spawnCrowdBubble('DAI RAGAZZI!', { color: '#7dd3fc' });
      }
    }
  }

  triggerNetBulge(side = 'right', strength = 1.0) {
    if (side === 'left') {
      this.env.netVelLeft = Math.max(this.env.netVelLeft, 9.5 * strength);
    } else {
      this.env.netVelRight = Math.max(this.env.netVelRight, 9.5 * strength);
    }
  }

  kickBallOnTap(normX, normY, isCrit, leagueIndex) {
    const cx = Math.max(0.08, Math.min(0.92, normX));
    const cy = Math.max(0.1, Math.min(0.9, normY));
    const dx = cx - this.ball.nx;
    const dy = cy - this.ball.ny;
    this.ball.vx = dx * 3.4 + (Math.random() - 0.5) * 0.25;
    this.ball.vy = dy * 3.4 + (Math.random() - 0.5) * 0.25;
    this.ball.vz = isCrit ? 205 : 140;
    if (isCrit) this.ball.glowTimer = 0.65;

    this.registerTapCombo();
    this.spawnTapParticles(cx, cy, isCrit, leagueIndex);
    if (isCrit && leagueIndex === 4) {
      this.spawnFirework(cx, Math.max(0.08, cy - 0.2));
    }
  }

  launchShotToGoal(side = 'right', targetNy = 0.5, { isGoal = true, isCrossbar = false, leagueIndex = 0 } = {}) {
    const b = this.ball;
    const startX = side === 'right' ? 0.68 : 0.32;
    b.nx = startX;
    b.ny = 0.45 + (Math.random() - 0.5) * 0.14;
    const endX = side === 'right' ? 0.99 : 0.01;

    if (isCrossbar) {
      // Rimbalzo secco dalla traversa verso il campo!
      b.nx = 0.95;
      b.ny = 0.39;
      b.vx = -2.2;
      b.vy = (Math.random() - 0.5) * 1.4;
      b.vz = 195;
      b.glowTimer = 0.85;
      this.spawnTapParticles(0.96, 0.39, true, 4);
      this.triggerOpponentKeeperDive(0.4, false);
      return;
    }

    b.vx = (endX - b.nx) * 4.2;
    b.vy = (targetNy - b.ny) * 3.8;
    b.vz = isGoal ? 165 : 210;
    b.glowTimer = 0.9;

    if (side === 'right') {
      this.triggerOpponentKeeperDive(targetNy, !isGoal);
    }

    if (isGoal) {
      this.triggerNetBulge(side, 1.18);
      this.env.olaIntensity = 1;
      this.spawnTapParticles(endX, targetNy, true, leagueIndex);
      if (leagueIndex === 4) {
        this.spawnFirework(side === 'right' ? 0.84 : 0.18, 0.18);
        this.spawnFirework(0.5, 0.14);
      }
    } else if (side === 'right') {
      // Respinta del portiere avversario
      b.nx = 0.92;
      b.ny = targetNy;
      b.vx = -1.7;
      b.vy = (Math.random() - 0.5) * 1.5;
      b.vz = 140;
      this.spawnTapParticles(0.93, targetNy, true, 2);
    }
  }

  launchSaveDeflection(nx = 0.18, ny = 0.5) {
    const b = this.ball;
    b.nx = nx;
    b.ny = ny;
    b.vx = 1.9;
    b.vy = (Math.random() - 0.5) * 1.4;
    b.vz = 155;
    b.glowTimer = 0.5;
    this.spawnTapParticles(nx, ny, true, 2);
  }

  spawnTapParticles(nx, ny, isCrit, leagueIndex) {
    const palettes = [
      ['#78502b', '#4d3319', '#fde047', '#93c5fd'],
      ['#4ade80', '#fb923c', '#fde047'],
      ['#38bdf8', '#4ade80', '#facc15'],
      ['#c084fc', '#fde047', '#ffffff'],
      ['#38bdf8', '#fde047', '#f472b6'],
    ];
    const cols = palettes[leagueIndex] || palettes[0];
    const count = isCrit ? 15 : leagueIndex === 0 ? 10 : 7;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (isCrit ? 62 : 38) + Math.random() * 68;
      this.particles.push({
        nx,
        ny,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 26,
        size: isCrit ? 3.5 + Math.random() * 2.4 : 2.2 + Math.random() * 2.1,
        color: cols[i % cols.length],
        life: 0.45 + Math.random() * 0.28,
        maxLife: 0.72,
      });
    }
  }

  spawnFloatingText(nx, ny, text, { color = '#fef08a', scale = 1, duration = 0.95 } = {}) {
    this.floatingTexts.push({
      nx,
      ny,
      text,
      color,
      scale,
      life: duration,
      maxLife: duration,
      vy: -42,
    });
    if (this.floatingTexts.length > 26) this.floatingTexts.shift();
  }

  spawnConfetti(count = 80) {
    const colors = ['#facc15', '#22c55e', '#38bdf8', '#ef4444', '#c084fc', '#ffffff'];
    for (let i = 0; i < count; i++) {
      this.confetti.push({
        nx: Math.random(),
        ny: -0.05 - Math.random() * 0.25,
        vx: (Math.random() - 0.5) * 60,
        vy: 55 + Math.random() * 90,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 10,
        w: 5 + Math.random() * 4,
        h: 3 + Math.random() * 3,
        color: colors[i % colors.length],
        life: 2.6 + Math.random() * 1.4,
      });
    }
  }

  spawnFirework(nx, ny) {
    const colors = ['#38bdf8', '#facc15', '#f472b6', '#4ade80', '#ffffff'];
    const baseCol = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.15;
      const spd = 45 + Math.random() * 75;
      this.fireworks.push({
        nx,
        ny,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color: i % 3 === 0 ? '#ffffff' : baseCol,
        life: 0.75 + Math.random() * 0.35,
        maxLife: 1.1,
      });
    }
  }

  update(dt, t, { leagueIndex, onMiniGoal, isMatchActive }) {
    // 1. Fisica elastica rete porte 3D
    const springK = 55;
    const damping = 5.2;
    this.env.netVelLeft += (-springK * this.env.netBulgeLeft - damping * this.env.netVelLeft) * dt;
    this.env.netBulgeLeft += this.env.netVelLeft * dt;
    if (Math.abs(this.env.netBulgeLeft) < 0.004 && Math.abs(this.env.netVelLeft) < 0.02) {
      this.env.netBulgeLeft = 0;
      this.env.netVelLeft = 0;
    }

    this.env.netVelRight += (-springK * this.env.netBulgeRight - damping * this.env.netVelRight) * dt;
    this.env.netBulgeRight += this.env.netVelRight * dt;
    if (Math.abs(this.env.netBulgeRight) < 0.004 && Math.abs(this.env.netVelRight) < 0.02) {
      this.env.netBulgeRight = 0;
      this.env.netVelRight = 0;
    }

    // 2. Onda "Ola"
    if (this.env.olaIntensity > 0) {
      this.env.olaPhase += dt * 0.95;
      this.env.olaIntensity = Math.max(0, this.env.olaIntensity - dt * 0.38);
    }

    // 3. Cane randagio in Terza Categoria
    if (leagueIndex === 0) {
      const dog = this.env.dog;
      if (dog.active) {
        dog.nx += dog.dir * 0.16 * dt;
        if (dog.nx > 1.15 || dog.nx < -0.15) {
          dog.active = false;
          dog.cooldown = 11 + Math.random() * 9;
        }
      } else {
        dog.cooldown -= dt;
        if (dog.cooldown <= 0) {
          dog.active = true;
          dog.dir = Math.random() < 0.5 ? 1 : -1;
          dog.nx = dog.dir === 1 ? -0.1 : 1.1;
          dog.ny = 0.25 + Math.random() * 0.55;
        }
      }
    } else {
      this.env.dog.active = false;
    }

    // 4. Movimento Top 5 giocatori del club
    for (const pl of this.players) {
      pl.moveTimer -= dt;
      if (pl.moveTimer <= 0) {
        pl.moveTimer = 1.2 + Math.random() * 1.6;
        pl.tx = Math.max(0.08, Math.min(0.86, pl.homeX + (Math.random() - 0.5) * 0.18));
        pl.ty = Math.max(0.14, Math.min(0.86, pl.homeY + (Math.random() - 0.5) * 0.24));
      }
      const prevX = pl.nx;
      const prevY = pl.ny;
      pl.nx += (pl.tx - pl.nx) * Math.min(1, dt * 2.5);
      pl.ny += (pl.ty - pl.ny) * Math.min(1, dt * 2.5);
      pl.vx = (pl.nx - prevX) / Math.max(0.001, dt);
      pl.vy = (pl.ny - prevY) / Math.max(0.001, dt);
    }

    // 5. Movimento squadra avversaria + portiere rivale durante il match
    if (isMatchActive) {
      for (const rv of this.rivals) {
        rv.moveTimer -= dt;
        if (rv.moveTimer <= 0) {
          rv.moveTimer = 0.85 + Math.random() * 1.1;
          // Pressing leggermente orientato verso il pallone
          const pressX = rv.homeX * 0.72 + this.ball.nx * 0.28 + (Math.random() - 0.5) * 0.14;
          const pressY = rv.homeY * 0.68 + this.ball.ny * 0.32 + (Math.random() - 0.5) * 0.22;
          rv.tx = Math.max(0.22, Math.min(0.88, pressX));
          rv.ty = Math.max(0.14, Math.min(0.86, pressY));
        }
        const px = rv.nx;
        const py = rv.ny;
        rv.nx += (rv.tx - rv.nx) * Math.min(1, dt * 3.0);
        rv.ny += (rv.ty - rv.ny) * Math.min(1, dt * 3.0);
        rv.vx = (rv.nx - px) / Math.max(0.001, dt);
        rv.vy = (rv.ny - py) / Math.max(0.001, dt);
      }

      const gk = this.rivalKeeper;
      if (gk.diveTimer > 0) {
        gk.diveTimer = Math.max(0, gk.diveTimer - dt);
        gk.ny += (gk.targetNy - gk.ny) * Math.min(1, dt * 9.5);
      } else {
        const followY = Math.max(0.39, Math.min(0.61, 0.5 + (this.ball.ny - 0.5) * 0.55));
        gk.ny += (followY - gk.ny) * Math.min(1, dt * 4.5);
      }
    }

    // 6. Fisica pallone + scia luminosa
    const b = this.ball;
    b.nx += b.vx * dt;
    b.ny += b.vy * dt;
    b.vx *= Math.pow(0.08, dt);
    b.vy *= Math.pow(0.08, dt);
    if (b.glowTimer > 0) b.glowTimer = Math.max(0, b.glowTimer - dt);

    if (b.nx < 0.04) { b.nx = 0.04; b.vx = Math.abs(b.vx) * 0.65; }
    if (b.nx > 0.96) { b.nx = 0.96; b.vx = -Math.abs(b.vx) * 0.65; }
    if (b.ny < 0.07) { b.ny = 0.07; b.vy = Math.abs(b.vy) * 0.65; }
    if (b.ny > 0.93) { b.ny = 0.93; b.vy = -Math.abs(b.vy) * 0.65; }

    if (b.z > 0 || b.vz !== 0) {
      b.z += b.vz * dt;
      b.vz -= 520 * dt;
      if (b.z <= 0) {
        b.z = 0;
        if (Math.abs(b.vz) > 40) b.vz = -b.vz * 0.45;
        else b.vz = 0;
      }
    }
    const speed = Math.hypot(b.vx, b.vy);
    b.spin += (speed * 11 + 0.65) * dt;

    if (speed > 0.55 || b.glowTimer > 0) {
      this.ballTrail.push({
        nx: b.nx,
        ny: b.ny,
        z: b.z,
        life: 0.28,
        maxLife: 0.28,
        hot: b.glowTimer > 0,
      });
      if (this.ballTrail.length > 14) this.ballTrail.shift();
    }
    for (let i = this.ballTrail.length - 1; i >= 0; i--) {
      this.ballTrail[i].life -= dt;
      if (this.ballTrail[i].life <= 0) this.ballTrail.splice(i, 1);
    }

    // Passaggi automatici fuori match
    if (this.players.length > 0 && !isMatchActive) {
      b.passTimer -= dt;
      if (b.passTimer <= 0) {
        b.passTimer = 1.9 + Math.random() * 1.4;
        if (Math.random() < 0.22) {
          b.vx = (0.97 - b.nx) * 3.0;
          b.vy = (0.5 - b.ny) * 2.8;
          b.vz = 118;
          b.glowTimer = 0.55;
          this.triggerNetBulge('right', 0.75);
          if (leagueIndex === 4) {
            this.spawnFirework(0.82, 0.2);
            this.spawnFirework(0.24, 0.18);
          }
          if (onMiniGoal) onMiniGoal();
        } else {
          const receiver = this.players[Math.floor(Math.random() * this.players.length)];
          b.vx = (receiver.nx - b.nx) * 2.1;
          b.vy = (receiver.ny - b.ny) * 2.1;
          b.vz = 55;
        }
      }
    }

    // 7. Particelle, testi, fumetti, coriandoli, fuochi
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      pt.vy += 125 * dt;
      pt.nx += (pt.vx * dt) / 360;
      pt.ny += (pt.vy * dt) / 220;
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) { this.floatingTexts.splice(i, 1); continue; }
      ft.ny += (ft.vy * dt) / 220;
    }

    for (let i = this.crowdBubbles.length - 1; i >= 0; i--) {
      this.crowdBubbles[i].life -= dt;
      if (this.crowdBubbles[i].life <= 0) this.crowdBubbles.splice(i, 1);
    }

    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life -= dt;
      if (c.life <= 0) { this.confetti.splice(i, 1); continue; }
      c.nx += (c.vx * dt) / 380;
      c.ny += (c.vy * dt) / 300;
      c.rot += c.vrot * dt;
    }

    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const fw = this.fireworks[i];
      fw.life -= dt;
      if (fw.life <= 0) { this.fireworks.splice(i, 1); continue; }
      fw.vy += 65 * dt;
      fw.nx += (fw.vx * dt) / 360;
      fw.ny += (fw.vy * dt) / 260;
    }
  }

  _drawSecretAura(ctx, auraType, s, t, phase) {
    const pulse = 0.9 + Math.sin(t * 7 + phase) * 0.14;
    const auraR = 19 * s * pulse;

    if (auraType === 'fire') {
      // Aura infuocata oro/rosso per Francesco Porcotrio
      const grad = ctx.createRadialGradient(0, 8 * s, 2, 0, 8 * s, auraR);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.78)');
      grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.45)');
      grad.addColorStop(0.85, 'rgba(220, 38, 38, 0.22)');
      grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 8 * s, auraR, auraR * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 8 * s, 14 * s * pulse, 6 * s * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Scintille di fuoco ascendenti
      for (let i = 0; i < 4; i++) {
        const p = (t * 2.2 + i * 0.25) % 1;
        const ex = Math.cos(t * 4 + i * 1.8) * 9 * s;
        const ey = (6 - p * 18) * s;
        ctx.fillStyle = `rgba(254, 240, 138, ${(1 - p) * 0.85})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // Aura elettrica celeste/ciano per Loma
    const grad = ctx.createRadialGradient(0, 8 * s, 2, 0, 8 * s, auraR);
    grad.addColorStop(0, 'rgba(224, 242, 254, 0.78)');
    grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)');
    grad.addColorStop(0.85, 'rgba(14, 165, 233, 0.2)');
    grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 8 * s, auraR, auraR * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 8 * s, 14 * s * pulse, 6 * s * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Mini scariche elettriche
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.85)';
    ctx.lineWidth = 1.2;
    const ang = t * 5 + phase;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 10 * s, 6 * s);
    ctx.lineTo(Math.cos(ang + 0.4) * 14 * s, 1 * s);
    ctx.lineTo(Math.cos(ang + 0.8) * 11 * s, -4 * s);
    ctx.stroke();
  }

  _renderFootballer(ctx, { nx, ny, vx, vy, phase, primary, secondary, number, label, labelColor, rarity, aura, diveTilt = 0 }, g, t) {
    const pt = projectPitch(nx, ny, g);
    const s = pt.scale;
    const speed = Math.hypot(vx || 0, vy || 0);
    const runFreq = speed > 0.04 ? 14 : 6;
    const stride = Math.sin(t * runFreq + phase);
    const bob = diveTilt ? 4 * s : Math.abs(stride) * (speed > 0.04 ? 2.6 : 1.1) * s;

    ctx.save();
    ctx.translate(pt.x, pt.y);

    // Aura speciale per Segreto, Leggenda o Epico
    if (aura) {
      this._drawSecretAura(ctx, aura, s, t, phase);
    } else if (rarity === 'epico' || rarity === 'leggenda') {
      const rarObj = RARITIES[rarity];
      const pulse = 0.88 + Math.sin(t * 5 + phase) * 0.14;
      const auraR = 16 * s * pulse;
      const grad = ctx.createRadialGradient(0, 8 * s, 2, 0, 8 * s, auraR);
      if (rarity === 'leggenda') {
        grad.addColorStop(0, 'rgba(251, 191, 36, 0.55)');
        grad.addColorStop(0.65, 'rgba(251, 191, 36, 0.2)');
        grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
      } else {
        grad.addColorStop(0, 'rgba(192, 132, 252, 0.5)');
        grad.addColorStop(0.65, 'rgba(192, 132, 252, 0.18)');
        grad.addColorStop(1, 'rgba(192, 132, 252, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 8 * s, auraR, auraR * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = rarObj.color;
      ctx.lineWidth = rarity === 'leggenda' ? 2.1 : 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 8 * s, 13 * s * pulse, 5.5 * s * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ombra a terra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 9 * s, (diveTilt ? 12 : 8.5) * s, 3.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eventuale inclinazione del tuffo del portiere rivale!
    ctx.translate(0, -bob);
    if (diveTilt) {
      ctx.rotate(diveTilt);
    }

    // Piedi in corsa
    const footOff = diveTilt ? 0 : stride * 3.2 * s;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(-3.2 * s, 7.5 * s + footOff * 0.4, 2.5 * s, 1.5 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(3.2 * s, 7.5 * s - footOff * 0.4, 2.5 * s, 1.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pantaloncini
    ctx.fillStyle = secondary;
    ctx.fillRect(-4.8 * s, 2.5 * s, 9.6 * s, 4 * s);

    // Maglia bicolore + spalle
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.roundRect(-7.5 * s, -7.2 * s, 15 * s, 10.6 * s, 3.8 * s);
    ctx.fill();

    ctx.fillStyle = secondary;
    ctx.fillRect(-2.4 * s, -7.0 * s, 4.8 * s, 10.2 * s);
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(-6.8 * s, -4.4 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.arc(6.8 * s, -4.4 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(-7.5 * s, -7.2 * s, 15 * s, 10.6 * s, 3.8 * s);
    ctx.stroke();

    // Testa + capelli
    ctx.fillStyle = '#fdba74';
    ctx.beginPath();
    ctx.arc(0, -11.4 * s, 4.3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(0, -12.6 * s, 4.2 * s, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();

    // Numero maglia
    ctx.font = `900 ${Math.round(8.2 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeText(String(number), 0, -1.6 * s);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(number), 0, -1.6 * s);

    ctx.restore();

    // Etichetta cognome dritta sotto i piedi (solo per i nostri giocatori)
    if (label) {
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.fillStyle = 'rgba(7, 12, 22, 0.8)';
      ctx.fillRect(-20 * s, 11 * s, 40 * s, 9.5 * s);
      ctx.fillStyle = labelColor || '#f8fafc';
      ctx.font = `800 ${Math.round(6.6 * s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 9), 0, 15.8 * s);
      ctx.restore();
    }
  }

  // Pallone realistico a pentagoni bianchi e neri rotante
  _renderRealisticBall(ctx, g) {
    const bPt = projectPitch(this.ball.nx, this.ball.ny, g);
    const bz = this.ball.z * 0.42;
    const shadowScale = Math.max(0.45, 1 - bz / 75) * bPt.scale;
    const r = 8.4 * bPt.scale;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(bPt.x, bPt.y + 6 * bPt.scale, 8.6 * shadowScale, 3.8 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(bPt.x, bPt.y - bz);

    // Sfera bianca con sfumatura 3D
    const grad = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.12, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#e2e8f0');
    grad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Clippa il pattern a pentagoni dentro il cerchio del pallone mentre ruota
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(this.ball.spin);

    // Pentagono centrale nero
    const cRad = r * 0.40;
    const verts = [];
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const vx = Math.cos(a) * cRad;
      const vy = Math.sin(a) * cRad;
      verts.push({ x: vx, y: vy, a });
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();

    // Cuciture radiali + 5 pentagoni perimetrali parziali
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.lineWidth = Math.max(0.8, 1.0 * bPt.scale);
    for (const v of verts) {
      const ox = Math.cos(v.a) * r * 0.92;
      const oy = Math.sin(v.a) * r * 0.92;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.lineTo(ox, oy);
      ctx.stroke();

      // Pentagono nero sul bordo esterno
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(Math.cos(v.a) * r * 1.04, Math.sin(v.a) * r * 1.04, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Contorno pallone
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Bersaglio di precisione con anello esterno che si restringe verso la fascia verde/oro
  _renderKeyActionTarget(ctx, act, g, t) {
    const pt = projectPitch(act.nx, act.ny, g);
    const isGoalChance = act.type === 'goal_chance';
    const progress = Math.max(0, Math.min(1, 1 - act.timeLeft / act.maxTime));

    ctx.save();
    if (isGoalChance) {
      const baseR = 23;
      const maxRingR = 56;
      const minRingR = 12;
      const curRingR = maxRingR - progress * (maxRingR - minRingR);
      const bandOuterR = maxRingR - act.bandMin * (maxRingR - minRingR);
      const bandInnerR = maxRingR - act.bandMax * (maxRingR - minRingR);
      const inSweetSpot = progress >= act.bandMin && progress <= act.bandMax;

      // Fascia bersaglio VERDE / ORO fissa (dove far cadere l'anello!)
      ctx.fillStyle = inSweetSpot ? 'rgba(34, 197, 94, 0.38)' : 'rgba(34, 197, 94, 0.22)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, bandOuterR, 0, Math.PI * 2);
      ctx.arc(pt.x, pt.y, Math.max(4, bandInnerR), 0, Math.PI * 2, true);
      ctx.fill();

      ctx.strokeStyle = inSweetSpot ? '#fde047' : 'rgba(74, 222, 128, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, bandOuterR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(4, bandInnerR), 0, Math.PI * 2);
      ctx.stroke();

      // Cerchio centrale TIRA!
      ctx.fillStyle = inSweetSpot ? '#16a34a' : 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, baseR * 0.88, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = inSweetSpot ? '#fef08a' : '#94a3b8';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Anello esterno luminoso che si restringe verso il centro
      ctx.strokeStyle = inSweetSpot ? '#fef08a' : '#ffffff';
      ctx.lineWidth = inSweetSpot ? 4.4 : 3.2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, curRingR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 10.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TIRA!', pt.x, pt.y + 0.5);
    } else {
      // Pericolo avversario PARA! con anello rosso che si stringe con urgenza
      const pulse = 1 + Math.sin(t * 15) * 0.08;
      const radius = 24 * pulse;
      const ratio = Math.max(0, act.timeLeft / act.maxTime);
      const shrinkR = radius + ratio * 22;

      const glow = ctx.createRadialGradient(pt.x, pt.y, 4, pt.x, pt.y, radius * 1.8);
      glow.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
      glow.addColorStop(0.55, 'rgba(220, 38, 38, 0.35)');
      glow.addColorStop(1, 'rgba(220, 38, 38, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fecaca';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Anello countdown esterno che collassa
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, shrinkR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 10.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PARA!', pt.x, pt.y + 0.5);
    }
    ctx.restore();
  }

  _renderCrowdBubbles(ctx, w, g) {
    for (const cb of this.crowdBubbles) {
      const alpha = Math.min(1, (cb.life / cb.maxLife) * 1.6);
      const rise = (1 - cb.life / cb.maxLife) * 12;
      const x = cb.nx * w;
      const y = Math.max(36, g.topY - 26 - rise);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 9.5px system-ui, sans-serif';
      const tw = ctx.measureText(cb.text).width;
      const bw = tw + 14;
      const bh = 18;

      ctx.fillStyle = 'rgba(7, 12, 22, 0.9)';
      ctx.strokeStyle = cb.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(x - bw * 0.5, y - bh * 0.5, bw, bh, 8);
      ctx.fill();
      ctx.stroke();

      // Triangolino fumetto verso gli spalti
      ctx.beginPath();
      ctx.moveTo(x - 4, y + bh * 0.5);
      ctx.lineTo(x + 4, y + bh * 0.5);
      ctx.lineTo(x, y + bh * 0.5 + 5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cb.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cb.text, x, y + 0.5);
      ctx.restore();
    }
  }

  render(ctx, w, h, g, t, { flashEvent, matchActions = [], clubInfo, isMatchActive = false, oppColors = ['#3b82f6', '#facc15'] }) {
    // 1. Giocatori (nostri Top 5 + squadra avversaria + portiere rivale) ordinati per profondità ny
    const drawList = [];

    for (const pl of this.players) {
      const isGK = pl.data.role === 'POR';
      drawList.push({
        ny: pl.ny,
        render: () =>
          this._renderFootballer(
            ctx,
            {
              nx: pl.nx,
              ny: pl.ny,
              vx: pl.vx,
              vy: pl.vy,
              phase: pl.phase,
              primary: isGK ? (pl.data.secretId === 'loma' ? '#0ea5e9' : '#eab308') : clubInfo.primary,
              secondary: isGK ? '#0f172a' : clubInfo.secondary,
              number: pl.data.jerseyNumber,
              label: pl.data.shortName,
              labelColor:
                pl.data.rarity === 'segreto'
                  ? '#fb923c'
                  : pl.data.rarity === 'leggenda'
                    ? '#fde047'
                    : '#f8fafc',
              rarity: pl.data.rarity,
              aura: pl.data.aura || null,
            },
            g,
            t
          ),
      });
    }

    if (isMatchActive) {
      for (const rv of this.rivals) {
        drawList.push({
          ny: rv.ny,
          render: () =>
            this._renderFootballer(
              ctx,
              {
                nx: rv.nx,
                ny: rv.ny,
                vx: rv.vx,
                vy: rv.vy,
                phase: rv.phase,
                primary: oppColors[0] || '#3b82f6',
                secondary: oppColors[1] || '#facc15',
                number: rv.jerseyNumber,
                label: null,
              },
              g,
              t
            ),
        });
      }

      // Portiere avversario nella porta destra (con tuffo animato!)
      const gk = this.rivalKeeper;
      const diveProg = gk.diveTimer > 0 ? Math.sin((gk.diveTimer / gk.diveDuration) * Math.PI) : 0;
      const diveTilt = gk.diveDir * diveProg * 1.15;
      drawList.push({
        ny: gk.ny,
        render: () =>
          this._renderFootballer(
            ctx,
            {
              nx: gk.nx,
              ny: gk.ny,
              vx: 0,
              vy: 0,
              phase: 0,
              primary: '#84cc16',
              secondary: '#0f172a',
              number: 1,
              label: null,
              diveTilt,
            },
            g,
            t
          ),
      });
    }

    drawList.sort((a, b) => a.ny - b.ny);
    for (const item of drawList) item.render();

    // 2. Scia luminosa del pallone
    if (this.ballTrail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.ballTrail.length; i++) {
        const tr = this.ballTrail[i];
        const pt = projectPitch(tr.nx, tr.ny, g);
        const alpha = (tr.life / tr.maxLife) * 0.55;
        const rad = (3 + (i / this.ballTrail.length) * 5.2) * pt.scale;
        ctx.fillStyle = tr.hot
          ? `rgba(251, 191, 36, ${alpha.toFixed(3)})`
          : `rgba(125, 211, 252, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y - tr.z * 0.42, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. Pallone realistico a pentagoni rotante
    this._renderRealisticBall(ctx, g);

    // 4. Bersagli Azioni Chiave (TIRA! con anello di precisione / PARA!)
    for (const act of matchActions) {
      this._renderKeyActionTarget(ctx, act, g, t);
    }

    // 5. Eventi Casuali fuori partita (Flash Event classico / Invasione di Campo / Blackout!)
    if (flashEvent) {
      if (flashEvent.kind === 'invasion') {
        const pt = projectPitch(flashEvent.nx, flashEvent.ny, g);
        const bob = Math.abs(Math.sin(t * 16)) * 4;
        ctx.save();
        ctx.translate(pt.x, pt.y);

        // Alone bersaglio
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, -4, 24 + Math.sin(t * 12) * 3, 0, Math.PI * 2);
        ctx.stroke();

        // Tifoso invasore a zig-zag con sciarpa al vento
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 10, 9, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(0, -bob);
        ctx.fillStyle = '#fdba74';
        ctx.beginPath();
        ctx.roundRect(-6, -6, 12, 10, 3);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-5, 3, 10, 5);
        ctx.fillStyle = '#fdba74';
        ctx.beginPath();
        ctx.arc(0, -10, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Sciarpa sventolante
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12, -14 + Math.sin(t * 18) * 3);
        ctx.lineTo(12, -14 - Math.sin(t * 18) * 3);
        ctx.stroke();

        // Badge tap rimanenti
        const rem = flashEvent.tapsRequired - flashEvent.tapsDone;
        ctx.fillStyle = 'rgba(7, 12, 22, 0.92)';
        ctx.fillRect(-44, 15, 88, 16);
        ctx.fillStyle = '#fde047';
        ctx.font = '900 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`INVASORE! TOC ${rem}x`, 0, 23);
        ctx.restore();
      } else if (flashEvent.kind === 'blackout') {
        // Stadio al buio + quadro elettrico lampeggiante cliccabile!
        const ex = flashEvent.nx * w;
        const ey = flashEvent.ny * h;
        ctx.save();
        ctx.fillStyle = 'rgba(3, 6, 14, 0.78)';
        ctx.fillRect(0, 0, w, h);

        // Alone lampeggiante del quadro elettrico
        const blink = 0.55 + Math.sin(t * 16) * 0.45;
        const glow = ctx.createRadialGradient(ex, ey, 6, ex, ey, 56);
        glow.addColorStop(0, `rgba(250, 204, 21, ${(0.7 * blink).toFixed(2)})`);
        glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ex, ey, 56, 0, Math.PI * 2);
        ctx.fill();

        // Quadro elettrico
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = blink > 0.6 ? '#fde047' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(ex - 24, ey - 26, 48, 52, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde047';
        ctx.font = '22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', ex, ey - 2);

        const rem = flashEvent.tapsRequired - flashEvent.tapsDone;
        ctx.fillStyle = 'rgba(7, 12, 22, 0.94)';
        ctx.fillRect(ex - 54, ey + 30, 108, 17);
        ctx.fillStyle = '#fef08a';
        ctx.font = '900 9px system-ui, sans-serif';
        ctx.fillText(`BLACKOUT! RIACCENDI ${rem}x`, ex, ey + 38.5);
        ctx.restore();
      } else {
        const ex = flashEvent.nx * w;
        const ey = flashEvent.ny * h;
        const pulse = 1 + Math.sin(t * 10) * 0.08;
        const ratio = Math.max(0, flashEvent.timeLeft / flashEvent.maxTime);
        const radius = 24 * pulse;

        ctx.save();
        const glow = ctx.createRadialGradient(ex, ey, 6, ex, ey, radius * 1.6);
        glow.addColorStop(0, flashEvent.accent);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ex, ey, radius * 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = flashEvent.color;
        ctx.beginPath();
        ctx.arc(ex, ey, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ex, ey, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();

        ctx.font = '20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(flashEvent.icon, ex, ey + 1);

        ctx.fillStyle = 'rgba(7, 12, 22, 0.9)';
        ctx.fillRect(ex - 48, ey + radius + 8, 96, 15);
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillText(flashEvent.title.toUpperCase(), ex, ey + radius + 16);
        ctx.restore();
      }
    }

    // 6. Fumetti cori dagli spalti
    this._renderCrowdBubbles(ctx, w, g);

    // 7. Particelle, fuochi, coriandoli, testi fluttuanti
    for (const pt of this.particles) {
      const pos = projectPitch(pt.nx, pt.ny, g);
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pt.size * pos.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const fw of this.fireworks) {
      ctx.globalAlpha = Math.max(0, fw.life / fw.maxLife);
      ctx.fillStyle = fw.color;
      ctx.beginPath();
      ctx.arc(fw.nx * w, fw.ny * h, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const c of this.confetti) {
      ctx.save();
      ctx.translate(c.nx * w, c.ny * h);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w * 0.5, -c.h * 0.5, c.w, c.h);
      ctx.restore();
    }

    for (const ft of this.floatingTexts) {
      const pos = projectPitch(ft.nx, ft.ny, g);
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      const pop = ft.life > ft.maxLife - 0.12 ? 1.18 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${Math.round(15 * ft.scale * pop)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(7, 12, 22, 0.94)';
      ctx.strokeText(ft.text, pos.x, pos.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, pos.x, pos.y);
      ctx.restore();
    }
  }
}
