import { FLASH_EVENTS } from './config.js';
import {
  addMoney,
  addGoldTokens,
  activateInvasionBoost,
  computeStats,
} from './state.js';
import { pickRandomDilemma } from './assistant.js';

function randomIntervalSec() {
  return 40 + Math.random() * 16; // 40–56 secondi tra un evento e l'altro
}

export class FlashEventManager {
  constructor() {
    this.activeEvent = null; // Flash classico | invasion | blackout
    this.dilemmaOpen = false;
    this.nextSpawnIn = randomIntervalSec();
  }

  setDilemmaOpen(flag) {
    this.dilemmaOpen = Boolean(flag);
    if (!this.dilemmaOpen) {
      this.nextSpawnIn = randomIntervalSec();
    }
  }

  update(dt, { isMatchActive, leagueIndex }) {
    if (isMatchActive || this.dilemmaOpen) return null;

    if (this.activeEvent) {
      const ev = this.activeEvent;
      ev.timeLeft -= dt;

      // Movimento a zig-zag dell'Invasore di Campo sul prato
      if (ev.kind === 'invasion') {
        ev.nx += ev.vx * dt;
        ev.ny += ev.vy * dt;
        if (ev.nx < 0.14 || ev.nx > 0.86) ev.vx = -ev.vx;
        if (ev.ny < 0.24 || ev.ny > 0.82) ev.vy = -ev.vy;
        ev.zigTimer -= dt;
        if (ev.zigTimer <= 0) {
          ev.zigTimer = 0.75 + Math.random() * 0.5;
          ev.vy = (Math.random() < 0.5 ? -1 : 1) * (0.28 + Math.random() * 0.18);
        }
      }

      if (ev.timeLeft <= 0) {
        this.activeEvent = null;
        this.nextSpawnIn = randomIntervalSec();
      }
      return null;
    }

    this.nextSpawnIn -= dt;
    if (this.nextSpawnIn <= 0) {
      return this.spawnRandom({ leagueIndex });
    }
    return null;
  }

  spawnRandom({ leagueIndex = 0 } = {}) {
    const roll = Math.random();

    // 1. Blackout al campo (solo in Terza Categoria / Promozione, ~18%)
    if (leagueIndex <= 1 && roll < 0.18) {
      this.activeEvent = {
        kind: 'blackout',
        id: 'blackout',
        title: 'Blackout al Campo!',
        icon: '⚡',
        nx: 0.22 + Math.random() * 0.56,
        ny: 0.48 + Math.random() * 0.28,
        timeLeft: 9.0,
        maxTime: 9.0,
        tapsDone: 0,
        tapsRequired: 5,
      };
      return this.activeEvent;
    }

    // 2. Invasione di Campo (~22%)
    if (roll < 0.40) {
      this.activeEvent = {
        kind: 'invasion',
        id: 'invasion',
        title: 'Invasione di Campo!',
        icon: '🏃',
        nx: 0.22 + Math.random() * 0.56,
        ny: 0.42 + Math.random() * 0.3,
        vx: (Math.random() < 0.5 ? -1 : 1) * 0.28,
        vy: 0.22,
        zigTimer: 0.8,
        timeLeft: 9.5,
        maxTime: 9.5,
        tapsDone: 0,
        tapsRequired: 4,
      };
      return this.activeEvent;
    }

    // 3. Dilemma Lampo di Gino il DS (~18%)
    if (roll < 0.58) {
      const dilemma = pickRandomDilemma();
      this.dilemmaOpen = true;
      return {
        kind: 'dilemma',
        title: dilemma.title,
        icon: '👔',
        dilemma,
      };
    }

    // 4. Evento Lampo classico (Calcio di Rigore / Pallone d'Oro / Sceicco in Tribuna)
    const template =
      FLASH_EVENTS[Math.floor(Math.random() * FLASH_EVENTS.length)];
    const nx = 0.18 + Math.random() * 0.64;
    const ny =
      template.zone === 'stands'
        ? 0.2 + Math.random() * 0.1
        : 0.38 + Math.random() * 0.42;

    this.activeEvent = {
      kind: 'flash',
      ...template,
      nx,
      ny,
      timeLeft: template.durationSec,
      maxTime: template.durationSec,
      spawnedAt: performance.now(),
    };
    return this.activeEvent;
  }

  tryHit({ stageNormX, stageNormY, pitchNormX, pitchNormY }, state) {
    if (!this.activeEvent) return null;
    const ev = this.activeEvent;
    const stats = computeStats(state);
    const evMult = stats.research.eventCashMult;
    const extraTok = stats.research.eventExtraTokens;

    // A. Invasione di Campo (hit sul prato)
    if (ev.kind === 'invasion') {
      if (Math.hypot(pitchNormX - ev.nx, pitchNormY - ev.ny) > 0.15) return null;
      ev.tapsDone += 1;
      // Scarto laterale quando lo tocchi
      ev.vx = -ev.vx * 1.08;
      if (ev.tapsDone < ev.tapsRequired) {
        return {
          event: ev,
          partial: true,
          remaining: ev.tapsRequired - ev.tapsDone,
        };
      }
      this.activeEvent = null;
      this.nextSpawnIn = randomIntervalSec();
      state.stats.flashEventsHit += 1;
      activateInvasionBoost(state);
      const tokens = 3 + extraTok;
      addGoldTokens(state, tokens);
      return {
        event: ev,
        completed: true,
        tokens,
        cash: 0,
        freePackId: null,
        label: `PLACCATO! ×3 (25s) & +${tokens} 🪙`,
      };
    }

    // B. Blackout al Campo (hit sul quadro elettrico in stage coords)
    if (ev.kind === 'blackout') {
      if (Math.hypot(stageNormX - ev.nx, stageNormY - ev.ny) > 0.15) return null;
      ev.tapsDone += 1;
      if (ev.tapsDone < ev.tapsRequired) {
        return {
          event: ev,
          partial: true,
          remaining: ev.tapsRequired - ev.tapsDone,
        };
      }
      this.activeEvent = null;
      this.nextSpawnIn = randomIntervalSec();
      state.stats.flashEventsHit += 1;
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 28, stats.tapValue * 45, 320 * stats.leagueMult) * evMult
      );
      const tokens = 3 + extraTok;
      addMoney(state, cash);
      addGoldTokens(state, tokens);
      return {
        event: ev,
        completed: true,
        cash,
        tokens,
        freePackId: null,
        label: `LUCE RIACCESA! +${tokens} 🪙`,
      };
    }

    // C. Evento Lampo classico
    if (Math.hypot(stageNormX - ev.nx, stageNormY - ev.ny) > 0.12) return null;

    this.activeEvent = null;
    this.nextSpawnIn = randomIntervalSec();
    state.stats.flashEventsHit += 1;

    if (ev.id === 'penalty') {
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 25, stats.tapValue * 40, 220 * stats.leagueMult) * evMult
      );
      const tokens = 1 + extraTok;
      addMoney(state, cash);
      addGoldTokens(state, tokens);
      return { event: ev, completed: true, cash, tokens, freePackId: null };
    }

    if (ev.id === 'ballon') {
      const freePackId =
        state.leagueIndex >= 3
          ? 'vip'
          : state.leagueIndex >= 1
            ? 'osservatore'
            : 'oratorio';
      state.freePacks[freePackId] = (state.freePacks[freePackId] || 0) + 1;
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 12, stats.tapValue * 20, 120 * stats.leagueMult) * evMult
      );
      const tokens = 1 + extraTok;
      addMoney(state, cash);
      addGoldTokens(state, tokens);
      return { event: ev, completed: true, cash, tokens, freePackId };
    }

    // Sceicco in Tribuna
    const cash = Math.floor(
      Math.max(stats.incomePerSec * 45, stats.tapValue * 65, 450 * stats.leagueMult) * evMult
    );
    const tokens = 2 + extraTok;
    addMoney(state, cash);
    addGoldTokens(state, tokens);
    return { event: ev, completed: true, cash, tokens, freePackId: null };
  }
}
