import { FLASH_EVENTS, INVASION_BOOST_DURATION_MS } from './config.js';
import {
  addMoney,
  activateBoost,
  activateInvasionBoost,
  activateApeBoost,
  activateSmokeTapBoost,
  computeStats,
} from './state.js';
import { pickRandomDilemma } from './assistant.js';

function randomIntervalSec() {
  return 38 + Math.random() * 16; // 38–54 secondi tra un evento e l'altro
}

export class FlashEventManager {
  constructor() {
    this.activeEvent = null; // Flash | invasion | blackout | neighbor_pitchfork | ape_car | crazy_smoke
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

      // Movimento orizzontale sgangherato dell'Ape Car sul prato
      if (ev.kind === 'ape_car') {
        ev.nx += ev.vx * dt;
        if (ev.nx < 0.11) {
          ev.nx = 0.11;
          ev.vx = Math.abs(ev.vx);
        } else if (ev.nx > 0.89) {
          ev.nx = 0.89;
          ev.vx = -Math.abs(ev.vx);
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

    // 1. Blackout al campo (solo in Terza Categoria / Promozione, ~12%)
    if (leagueIndex <= 1 && roll < 0.12) {
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

    // 2. Il Vicino col Forcone (~13%)
    if (roll < 0.25) {
      this.activeEvent = {
        kind: 'neighbor_pitchfork',
        id: 'neighbor_pitchfork',
        title: 'Il Vicino col Forcone!',
        icon: '🔱',
        nx: 0.28 + Math.random() * 0.44,
        ny: 0.24,
        timeLeft: 9.0,
        maxTime: 9.0,
        tapsDone: 0,
        tapsRequired: 5,
      };
      return this.activeEvent;
    }

    // 3. Ape Car in Campo (~13%)
    if (roll < 0.38) {
      const fromLeft = Math.random() < 0.5;
      this.activeEvent = {
        kind: 'ape_car',
        id: 'ape_car',
        title: 'Ape Car in Campo!',
        icon: '🛺',
        nx: fromLeft ? 0.14 : 0.86,
        ny: 0.48 + Math.random() * 0.22,
        vx: (fromLeft ? 1 : -1) * 0.21,
        timeLeft: 9.5,
        maxTime: 9.5,
        tapsDone: 0,
        tapsRequired: 4,
      };
      return this.activeEvent;
    }

    // 4. Nebbia da Fumogeni Impazziti (~12%)
    if (roll < 0.50) {
      this.activeEvent = {
        kind: 'crazy_smoke',
        id: 'crazy_smoke',
        title: 'Fumogeni Impazziti!',
        icon: '💨',
        nx: 0.5,
        ny: 0.54,
        timeLeft: 8.5,
        maxTime: 8.5,
        tapsDone: 0,
        tapsRequired: 5,
      };
      return this.activeEvent;
    }

    // 5. Invasione di Campo (~14%)
    if (roll < 0.64) {
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

    // 6. Dilemma Lampo di Gino il DS (~16%)
    if (roll < 0.80) {
      const dilemma = pickRandomDilemma();
      this.dilemmaOpen = true;
      return {
        kind: 'dilemma',
        title: dilemma.title,
        icon: '👔',
        dilemma,
      };
    }

    // 7. Evento Lampo classico (Calcio di Rigore / Pallone d'Oro / Sceicco in Tribuna, ~20%)
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
    const extraDurationMs = (stats.research.eventDurationBonusSec || 0) * 1000;

    // A. Invasione di Campo (hit sul prato — boost ×3 + cassa, zero 🪙)
    if (ev.kind === 'invasion') {
      if (Math.hypot(pitchNormX - ev.nx, pitchNormY - ev.ny) > 0.15) return null;
      ev.tapsDone += 1;
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
      const totalMs = INVASION_BOOST_DURATION_MS + extraDurationMs;
      const totalSec = Math.round(totalMs / 1000);
      activateInvasionBoost(state, totalMs);
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 18, stats.tapValue * 30, 220 * stats.leagueMult) * evMult
      );
      addMoney(state, cash);
      return {
        event: ev,
        completed: true,
        tokens: 0,
        cash,
        freePackId: null,
        label: `PLACCATO! ×3 (${totalSec}s) & +cassa`,
      };
    }

    // B. Il Vicino col Forcone (5 tap sul bordo alto — cassa + 15s Boost ×2, zero 🪙)
    if (ev.kind === 'neighbor_pitchfork') {
      if (Math.hypot(stageNormX - ev.nx, stageNormY - ev.ny) > 0.16) return null;
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
      const totalMs = 15000 + extraDurationMs;
      const totalSec = Math.round(totalMs / 1000);
      activateBoost(state, totalMs);
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 28, stats.tapValue * 44, 340 * stats.leagueMult) * evMult
      );
      addMoney(state, cash);
      return {
        event: ev,
        completed: true,
        tokens: 0,
        cash,
        freePackId: null,
        label: `PALLONE RECUPERATO! +cassa & ×2 (${totalSec}s)`,
      };
    }

    // C. Ape Car in Campo (4 tap sull'Ape — Sponsor Agricolo ×2.5 per 20s + cassa, zero 🪙)
    if (ev.kind === 'ape_car') {
      if (Math.hypot(pitchNormX - ev.nx, pitchNormY - ev.ny) > 0.16) return null;
      ev.tapsDone += 1;
      ev.vx = -ev.vx * 1.12;
      if (ev.tapsDone < ev.tapsRequired) {
        return {
          event: ev,
          partial: true,
          remaining: ev.tapsRequired - ev.tapsDone,
          horn: true,
        };
      }
      this.activeEvent = null;
      this.nextSpawnIn = randomIntervalSec();
      state.stats.flashEventsHit += 1;
      const totalMs = 20000 + extraDurationMs;
      const totalSec = Math.round(totalMs / 1000);
      activateApeBoost(state, totalMs);
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 22, stats.tapValue * 34, 260 * stats.leagueMult) * evMult
      );
      addMoney(state, cash);
      return {
        event: ev,
        completed: true,
        tokens: 0,
        cash,
        freePackId: null,
        horn: true,
        label: `SPONSOR AGRICOLO! ×2,5 (${totalSec}s) & +cassa`,
      };
    }

    // D. Nebbia da Fumogeni Impazziti (5 tap ovunque sul campo — ×3 Tap per 15s + cassa, zero 🪙)
    if (ev.kind === 'crazy_smoke') {
      if (pitchNormX < -0.05 || pitchNormX > 1.05 || pitchNormY < -0.05 || pitchNormY > 1.05) {
        return null;
      }
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
      const totalMs = 15000 + extraDurationMs;
      const totalSec = Math.round(totalMs / 1000);
      activateSmokeTapBoost(state, totalMs);
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 20, stats.tapValue * 38, 250 * stats.leagueMult) * evMult
      );
      addMoney(state, cash);
      return {
        event: ev,
        completed: true,
        tokens: 0,
        cash,
        freePackId: null,
        label: `NEBBIA DIRADATA! Entusiasmo Curva ×3 Tap (${totalSec}s)`,
      };
    }

    // E. Blackout al Campo (hit sul quadro elettrico — maxi rimborso assicurativo, zero 🪙)
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
        Math.max(stats.incomePerSec * 42, stats.tapValue * 65, 520 * stats.leagueMult) * evMult
      );
      addMoney(state, cash);
      return {
        event: ev,
        completed: true,
        cash,
        tokens: 0,
        freePackId: null,
        label: 'LUCE RIACCESA! Rimborso ENEL',
      };
    }

    // F. Evento Lampo classico (premi cassa / buste potenziati, zero 🪙)
    if (Math.hypot(stageNormX - ev.nx, stageNormY - ev.ny) > 0.12) return null;

    this.activeEvent = null;
    this.nextSpawnIn = randomIntervalSec();
    state.stats.flashEventsHit += 1;

    if (ev.id === 'penalty') {
      const cash = Math.floor(
        Math.max(stats.incomePerSec * 34, stats.tapValue * 52, 320 * stats.leagueMult) * evMult
      );
      addMoney(state, cash);
      return { event: ev, completed: true, cash, tokens: 0, freePackId: null };
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
        Math.max(stats.incomePerSec * 18, stats.tapValue * 28, 180 * stats.leagueMult) * evMult
      );
      addMoney(state, cash);
      return { event: ev, completed: true, cash, tokens: 0, freePackId };
    }

    // Sceicco in Tribuna
    const cash = Math.floor(
      Math.max(stats.incomePerSec * 60, stats.tapValue * 85, 650 * stats.leagueMult) * evMult
    );
    addMoney(state, cash);
    return { event: ev, completed: true, cash, tokens: 0, freePackId: null };
  }
}
