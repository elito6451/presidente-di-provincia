import {
  getPitchGeometry,
  projectPitch,
  unprojectPitch,
  renderStadiumTheme,
} from './themes.js';
import { renderPrestigeHelicopter } from './buildings.js';
import { StadiumEntities } from './entities.js';

export class StadiumCanvas {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks;
    this.entities = new StadiumEntities();
    this.width = 360;
    this.height = 300;
    this.dpr = 1;

    this.shakeTime = 0;
    this.shakeDuration = 0.18;
    this.shakeIntensity = 0;

    // Stato Elicottero del Fondo Estero (Prestige)
    this.helicopter = { active: false, elapsed: 0, duration: 2.6, progress: 0 };

    this._resize();
    this._bindEvents();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _bindEvents() {
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(this.canvas);
    } else {
      window.addEventListener('resize', () => this._resize());
    }

    this.canvas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const stageNormX = x / Math.max(1, rect.width);
      const stageNormY = y / Math.max(1, rect.height);

      const g = getPitchGeometry(this.width, this.height);
      const { nx: pitchNormX, ny: pitchNormY } = unprojectPitch(x, y, g);

      if (this.callbacks.onPointerDown) {
        this.callbacks.onPointerDown({
          clickX: x,
          clickY: y,
          stageNormX,
          stageNormY,
          pitchNormX,
          pitchNormY,
          projectFn: (nx, ny) => projectPitch(nx, ny, g),
        });
      }
    });
  }

  syncTopPlayers(topFive) {
    this.entities.syncTopPlayers(topFive);
  }

  triggerShake(intensity = 5, duration = 0.18) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  triggerTapFeedback(pitchNormX, pitchNormY, text, isCrit, leagueIndex) {
    this.entities.kickBallOnTap(pitchNormX, pitchNormY, isCrit, leagueIndex);
    if (isCrit) this.triggerShake(4.2, 0.14);
    this.entities.spawnFloatingText(pitchNormX, Math.max(0.14, pitchNormY - 0.06), text, {
      color: isCrit ? '#fbbf24' : '#ffffff',
      scale: isCrit ? 1.25 : 1.0,
    });
  }

  triggerEventHitFeedback(stageNormX, stageNormY, text) {
    const g = getPitchGeometry(this.width, this.height);
    const { nx, ny } = unprojectPitch(stageNormX * this.width, stageNormY * this.height, g);
    this.entities.spawnTapParticles(nx, ny, true, 4);
    this.triggerShake(5.5, 0.18);
    this.entities.spawnFloatingText(nx, Math.max(0.18, ny), text, {
      color: '#fde047',
      scale: 1.2,
      duration: 1.4,
    });
  }

  triggerMatchGoal(isPlayerGoal, leagueIndex) {
    const side = isPlayerGoal ? 'right' : 'left';
    this.entities.launchShotToGoal(side, 0.48 + (Math.random() - 0.5) * 0.12, {
      isGoal: true,
      leagueIndex,
    });
    this.triggerShake(isPlayerGoal ? 7.5 : 6.0, 0.24);
    this.entities.spawnFloatingText(
      isPlayerGoal ? 0.72 : 0.28,
      0.34,
      isPlayerGoal ? 'GOOOOL!' : 'GOL SUBITO!',
      {
        color: isPlayerGoal ? '#4ade80' : '#f87171',
        scale: 1.4,
        duration: 1.3,
      }
    );
    if (isPlayerGoal) {
      this.entities.spawnCrowdBubble('GOOOL!', { color: '#4ade80' });
    } else {
      this.entities.spawnCrowdBubble('NOOO!', { color: '#f87171' });
    }
  }

  triggerMatchSavedByOpponent(nx = 0.86, ny = 0.48, leagueIndex = 0) {
    this.entities.launchShotToGoal('right', ny, { isGoal: false, leagueIndex });
    this.triggerShake(4.2, 0.15);
    this.entities.spawnFloatingText(0.76, 0.34, 'PARATA!', {
      color: '#fbbf24',
      scale: 1.25,
      duration: 1.15,
    });
    this.entities.spawnCrowdBubble('OHHH!', { color: '#fde047' });
  }

  triggerMatchCrossbar(leagueIndex = 0) {
    this.entities.launchShotToGoal('right', 0.39, {
      isGoal: false,
      isCrossbar: true,
      leagueIndex,
    });
    this.triggerShake(6.2, 0.2);
    this.entities.spawnFloatingText(0.76, 0.32, 'TRAVERSA!', {
      color: '#fb923c',
      scale: 1.32,
      duration: 1.25,
    });
    this.entities.spawnCrowdBubble('OHHH!', { color: '#fb923c' });
  }

  triggerMatchSave(nx = 0.18, ny = 0.45) {
    this.entities.launchSaveDeflection(nx, ny);
    this.triggerShake(5.0, 0.16);
    this.entities.spawnFloatingText(0.26, 0.34, 'PARATONA!', {
      color: '#38bdf8',
      scale: 1.28,
      duration: 1.15,
    });
    this.entities.spawnCrowdBubble('DAI RAGAZZI!', { color: '#38bdf8' });
  }

  triggerPenaltyVisual(isPlayerKick, corner, scored, leagueIndex) {
    const cornerNy = corner === 'left' ? 0.39 : corner === 'right' ? 0.61 : 0.5;
    const side = isPlayerKick ? 'right' : 'left';
    if (scored) {
      this.entities.launchShotToGoal(side, cornerNy, { isGoal: true, leagueIndex });
      this.triggerShake(7.0, 0.22);
      this.entities.spawnFloatingText(
        isPlayerKick ? 0.74 : 0.26,
        0.34,
        isPlayerKick ? 'RIGORE IN RETE!' : 'GOL RIVALE',
        {
          color: isPlayerKick ? '#4ade80' : '#f87171',
          scale: 1.25,
          duration: 1.1,
        }
      );
      if (isPlayerKick) this.entities.spawnCrowdBubble('GOOOL!', { color: '#4ade80' });
    } else {
      this.entities.launchShotToGoal(side, cornerNy, { isGoal: false, leagueIndex });
      this.triggerShake(4.8, 0.16);
      this.entities.spawnFloatingText(
        isPlayerKick ? 0.74 : 0.26,
        0.34,
        isPlayerKick ? 'PARATO / FUORI!' : 'PARATONA!',
        {
          color: isPlayerKick ? '#fbbf24' : '#38bdf8',
          scale: 1.25,
          duration: 1.1,
        }
      );
      this.entities.spawnCrowdBubble(isPlayerKick ? 'OHHH!' : 'PARATONA!', {
        color: isPlayerKick ? '#fbbf24' : '#38bdf8',
      });
    }
  }

  celebratePromotion(isEuropean = false) {
    this.entities.spawnConfetti(105);
    this.entities.env.olaIntensity = 1;
    this.triggerShake(6.5, 0.22);
    this.entities.spawnCrowdBubble('CAMPIONI!!', { color: '#fde047' });
    if (isEuropean) {
      this.entities.spawnFirework(0.24, 0.2);
      this.entities.spawnFirework(0.5, 0.14);
      this.entities.spawnFirework(0.76, 0.22);
    }
  }

  startHelicopterAnimation(duration = 2.6) {
    this.helicopter = { active: true, elapsed: 0, duration, progress: 0 };
    this.triggerShake(4.5, 0.4);
  }

  update(dt, t, { leagueIndex, onMiniGoal, isMatchActive }) {
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime === 0) this.shakeIntensity = 0;
    }
    if (this.helicopter.active) {
      this.helicopter.elapsed += dt;
      this.helicopter.progress = Math.min(1, this.helicopter.elapsed / this.helicopter.duration);
      if (this.helicopter.elapsed >= this.helicopter.duration) {
        this.helicopter.active = false;
      }
    }
    this.entities.update(dt, t, { leagueIndex, onMiniGoal, isMatchActive });
  }

  render(leagueIndex, t, { flashEvent, matchActions = [], clubInfo, upgrades = {}, isMatchActive = false, oppColors }) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const g = getPitchGeometry(w, h);

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (this.shakeTime > 0 && this.shakeIntensity > 0) {
      const mag = this.shakeIntensity * (this.shakeTime / Math.max(0.01, this.shakeDuration));
      const sx = (Math.random() - 0.5) * 2 * mag;
      const sy = (Math.random() - 0.5) * 2 * mag;
      ctx.translate(sx, sy);
    }

    renderStadiumTheme(ctx, leagueIndex, w, h, g, t, this.entities.env, clubInfo, upgrades);
    this.entities.render(ctx, w, h, g, t, {
      flashEvent,
      matchActions,
      clubInfo,
      isMatchActive,
      oppColors,
    });
    renderPrestigeHelicopter(ctx, w, h, this.helicopter, t);
    ctx.restore();
  }
}
