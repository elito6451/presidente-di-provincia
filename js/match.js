import { TACTICS, ATTACK_COOLDOWN_SEC } from './config.js';
import {
  computeStats,
  canStartSpareggio,
  awardLeagueVictory,
  getCurrentMatchRound,
  getStarterPlayers,
} from './state.js';

const CORNERS = ['left', 'center', 'right'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class SpareggioController {
  constructor() {
    this.phase = 'idle'; // 'idle' | 'playing' | 'penalties'
    this.opponent = '';
    this.oppColors = ['#3b82f6', '#facc15'];
    this.title = '';
    this.tactic = TACTICS.contropiede;
    this.duration = 28;
    this.elapsed = 0;
    this.minute = 0;
    this.myGoals = 0;
    this.oppGoals = 0;

    // Possesso normalizzato 0..100 (completamente indipendente dai soldi/tap grezzi!)
    this.possession = 0;
    this.squadFactor = 1.0;
    this.attackCooldown = 0;      // min 3.2s tra un TIRA! e il successivo (2.4s con Vavelocino)
    this.attackCooldownDuration = ATTACK_COOLDOWN_SEC;
    this.actionBufferTimer = 0;   // ~1s di respiro per evitare sovrapposizioni TIRA!/PARA!
    this.saveWindowSec = 1.35;
    this.hasPorcotrio = false;
    this.hasLoma = false;
    this.hasPscon = false;
    this.hasVavelocino = false;
    this.psconShieldAvailable = false;
    this.startersSnapshot = [];
    this.dangerSchedule = [];     // array di timestamp (s) pianificati per i 4-6 PARA!

    this.leagueIndex = 0;
    this.stageIdx = 0;

    // Mutua esclusione: al massimo 1 Azione Chiave attiva alla volta
    this.goalChance = null;
    this.enemyDanger = null;

    // Pausa match per Finto VAR comico (1 volta max a partita)
    this.paused = false;
    this.varTriggeredThisMatch = false;

    // Stato Calci di Rigore
    this.penalties = null;
  }

  setPaused(flag) {
    this.paused = Boolean(flag);
  }

  get active() {
    return this.phase !== 'idle';
  }

  get isPlaying() {
    return this.phase === 'playing';
  }

  get isPenalties() {
    return this.phase === 'penalties';
  }

  start(state) {
    if (this.active || !canStartSpareggio(state)) return false;

    const stats = computeStats(state);
    const { league, round, stageIdx } = getCurrentMatchRound(state);
    const tactic = TACTICS[state.selectedTactic] || TACTICS.contropiede;

    this.phase = 'playing';
    this.leagueIndex = league.index;
    this.stageIdx = stageIdx;
    this.opponent = round.opponent;
    this.oppColors = round.oppColors || ['#3b82f6', '#facc15'];
    this.title = round.roundName;
    this.tactic = tactic;

    this.duration = stats.matchDurationSec; // ~28s (+max 4s da bonus rosa)
    this.elapsed = 0;
    this.minute = 0;
    this.myGoals = 0;
    this.oppGoals = 0;
    this.possession = 18; // partenza vivace
    this.attackCooldown = 0;
    this.actionBufferTimer = 0;

    // Normalizzazione logaritmica della Forza Rosa rispetto alla lega (clampata 0.85..1.35)
    const ratio = stats.squadPower / Math.max(1, league.minSquadPower);
    this.squadFactor = Math.max(0.85, Math.min(1.35, 0.85 + 0.24 * Math.log2(ratio + 1)));

    this.hasPorcotrio = stats.hasPorcotrio;
    this.hasLoma = stats.hasLoma;
    this.hasPscon = stats.hasPscon;
    this.hasVavelocino = stats.hasVavelocino;
    this.psconShieldAvailable = this.hasPscon;
    this.attackCooldownDuration = this.hasVavelocino ? 2.4 : ATTACK_COOLDOWN_SEC;
    this.startersSnapshot = getStarterPlayers(state);

    // Finestra PARA! (1.15s..1.45s * tattica, +25% con Loma "Muro Invalicabile")
    const lomaMult = this.hasLoma ? 1.25 : 1.0;
    this.saveWindowSec = (round.saveWindowSec || 1.35) * tactic.saveWindowMult * lomaMult;

    // Pianifica 4–6 attacchi avversari ben distribuiti (-1 con Tumas Pscon "Muro di Granito")
    const dangerCount = Math.max(2, tactic.dangerCount - (this.hasPscon ? 1 : 0));
    this.dangerSchedule = this._buildDangerSchedule(dangerCount, this.duration);

    this.goalChance = null;
    this.enemyDanger = null;
    this.paused = false;
    this.varTriggeredThisMatch = false;
    this.penalties = null;
    return true;
  }

  _buildDangerSchedule(count, duration) {
    const startSec = 3.6;
    const endSec = duration - 2.6;
    const span = Math.max(4, endSec - startSec);
    const step = span / Math.max(1, count);
    const times = [];
    for (let i = 0; i < count; i++) {
      const jitter = (Math.random() - 0.5) * step * 0.42;
      const t = Math.max(startSec, Math.min(endSec, startSec + (i + 0.5) * step + jitter));
      times.push(t);
    }
    return times.sort((a, b) => a - b);
  }

  getExtraCritPct() {
    if (!this.isPlaying) return 0;
    return this.tactic.critBonusPct || 0;
  }

  getPossessionRatio() {
    return Math.min(1, Math.max(0, this.possession / 100));
  }

  getActiveKeyActions() {
    if (this.goalChance) return [this.goalChance];
    if (this.enemyDanger) return [this.enemyDanger];
    return [];
  }

  _spawnGoalChance() {
    const maxTime = 1.4 * this.tactic.chanceWindowMult;
    // Fascia verde/oro base [0.54..0.86] (ampiezza 0.32); +22% con Porcotrio ("Istinto Killer")
    const baseHalf = 0.16 * (this.hasPorcotrio ? 1.22 : 1.0);
    const center = 0.70;
    const bandMin = Math.max(0.38, center - baseHalf);
    const bandMax = Math.min(0.93, center + baseHalf);

    this.goalChance = {
      type: 'goal_chance',
      label: 'TIRA!',
      nx: 0.72 + Math.random() * 0.11,
      ny: 0.38 + Math.random() * 0.34,
      timeLeft: maxTime,
      maxTime,
      bandMin,
      bandMax,
      spawnedAt: performance.now(),
    };
  }

  _spawnEnemyDanger() {
    const maxTime = this.saveWindowSec;
    this.enemyDanger = {
      type: 'enemy_danger',
      label: 'PARA!',
      nx: 0.16 + Math.random() * 0.11,
      ny: 0.38 + Math.random() * 0.34,
      timeLeft: maxTime,
      maxTime,
      spawnedAt: performance.now(),
    };
  }

  /**
   * Tap sul campo durante il match: carica il possesso normalizzato (0..100).
   * Non può MAI scattare TIRA! mentre PARA! è attivo, durante il cooldown 3.2s o nel buffer 1s.
   */
  registerTap(isCrit = false) {
    if (!this.isPlaying || this.paused) return null;
    if (this.goalChance || this.enemyDanger) return null;
    if (this.attackCooldown > 0) return null;

    const baseGain = isCrit ? 12.0 * this.tactic.critPossessionMult : 7.4;
    const turboMult = this.hasVavelocino ? 1.25 : 1.0;
    this.possession = Math.min(
      100,
      this.possession + baseGain * this.tactic.possessionMult * this.squadFactor * turboMult
    );

    if (this.possession >= 100 && this.actionBufferTimer <= 0 && this.elapsed < this.duration - 1.5) {
      this.possession = 0;
      this._spawnGoalChance();
      return { type: 'spawn_chance', action: this.goalChance };
    }
    return null;
  }

  /**
   * Hit-test generoso (48px) per il pollice su smartphone.
   * Valuta la precisione dell'anello che si restringe su TIRA! (Gol / Parata / Traversa).
   */
  tryHitKeyActionPx(clickX, clickY, projectFn) {
    if (!this.isPlaying || this.paused) return null;
    const hitRadiusPx = 48;

    if (this.goalChance) {
      const act = this.goalChance;
      const pt = projectFn(act.nx, act.ny);
      if (Math.hypot(clickX - pt.x, clickY - pt.y) <= hitRadiusPx) {
        const progress = 1 - act.timeLeft / act.maxTime;
        this.goalChance = null;
        this.attackCooldown = this.attackCooldownDuration;
        this.actionBufferTimer = 1.05; // lascia ~1s pulito prima di eventuale PARA!

        if (progress >= act.bandMin && progress <= act.bandMax) {
          this.myGoals += 1;
          return { type: 'player_goal', nx: act.nx, ny: act.ny, progress };
        }
        if (progress < act.bandMin) {
          return { type: 'player_saved', nx: act.nx, ny: act.ny, progress };
        }
        return { type: 'player_crossbar', nx: act.nx, ny: act.ny, progress };
      }
    }

    if (this.enemyDanger) {
      const act = this.enemyDanger;
      const pt = projectFn(act.nx, act.ny);
      if (Math.hypot(clickX - pt.x, clickY - pt.y) <= hitRadiusPx) {
        this.enemyDanger = null;
        this.actionBufferTimer = 0.9;
        return { type: 'player_save', nx: act.nx, ny: act.ny };
      }
    }

    return null;
  }

  update(dt, state) {
    if (this.paused) return [];
    if (this.phase === 'penalties') {
      this._updatePenalties(dt);
      return [];
    }
    if (this.phase !== 'playing') return [];

    const events = [];

    this.elapsed += dt;
    this.minute = Math.min(90, Math.floor((this.elapsed / this.duration) * 90));

    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    }
    if (this.actionBufferTimer > 0) {
      this.actionBufferTimer = Math.max(0, this.actionBufferTimer - dt);
    }

    // 1. Avanzamento passivo possesso (solo fuori da Azioni Chiave e fuori cooldown)
    if (!this.goalChance && !this.enemyDanger && this.attackCooldown <= 0) {
      const turboMult = this.hasVavelocino ? 1.25 : 1.0;
      const passiveRate = 11.5 * this.tactic.possessionMult * this.squadFactor * turboMult;
      this.possession = Math.min(100, this.possession + passiveRate * dt);
      if (
        this.possession >= 100 &&
        this.actionBufferTimer <= 0 &&
        this.elapsed < this.duration - 1.5
      ) {
        this.possession = 0;
        this._spawnGoalChance();
        events.push({ type: 'spawn_chance', action: this.goalChance });
      }
    }

    // 2. Schedule attacchi avversari PARA! (mutua esclusione: aspetta fine TIRA! + 1s buffer)
    if (
      !this.goalChance &&
      !this.enemyDanger &&
      this.actionBufferTimer <= 0 &&
      this.dangerSchedule.length > 0 &&
      this.elapsed >= this.dangerSchedule[0] &&
      this.elapsed < this.duration - 1.3
    ) {
      this.dangerSchedule.shift();
      this._spawnEnemyDanger();
      events.push({ type: 'spawn_danger', action: this.enemyDanger });
    }

    // 3. Countdown anello TIRA!
    if (this.goalChance) {
      this.goalChance.timeLeft -= dt;
      if (this.goalChance.timeLeft <= 0) {
        const old = this.goalChance;
        this.goalChance = null;
        this.attackCooldown = this.attackCooldownDuration;
        this.actionBufferTimer = 1.0;
        events.push({ type: 'chance_expired', nx: old.nx, ny: old.ny });
      }
    }

    // 4. Countdown anello PARA!
    if (this.enemyDanger) {
      this.enemyDanger.timeLeft -= dt;
      if (this.enemyDanger.timeLeft <= 0) {
        const old = this.enemyDanger;
        this.enemyDanger = null;
        this.actionBufferTimer = 0.9;
        if (this.psconShieldAvailable) {
          this.psconShieldAvailable = false;
          events.push({ type: 'pscon_block', nx: old.nx, ny: old.ny });
        } else {
          this.oppGoals += 1;
          events.push({ type: 'enemy_goal', nx: old.nx, ny: old.ny });
        }
      }
    }

    // 5. Fischio finale al 90°!
    if (this.elapsed >= this.duration) {
      this.minute = 90;
      this.goalChance = null;
      this.enemyDanger = null;

      if (this.myGoals > this.oppGoals) {
        this.phase = 'idle';
        const reward = awardLeagueVictory(state);
        events.push({
          type: 'match_finished',
          won: true,
          byPenalties: false,
          leagueIndex: this.leagueIndex,
          starters: this.startersSnapshot,
          myGoals: this.myGoals,
          oppGoals: this.oppGoals,
          opponent: this.opponent,
          title: this.title,
          ...reward,
        });
      } else if (this.myGoals < this.oppGoals) {
        this.phase = 'idle';
        events.push({
          type: 'match_finished',
          won: false,
          byPenalties: false,
          leagueIndex: this.leagueIndex,
          starters: this.startersSnapshot,
          myGoals: this.myGoals,
          oppGoals: this.oppGoals,
          opponent: this.opponent,
          title: this.title,
          stayedAtFinal: state.playoffStage > 0,
        });
      } else {
        this._initPenalties();
        events.push({
          type: 'enter_penalties',
          myGoals: this.myGoals,
          oppGoals: this.oppGoals,
        });
      }
    }

    return events;
  }

  // --- CALCI DI RIGORE INTERATTIVI ---

  _initPenalties() {
    this.phase = 'penalties';
    const greenHalf = 0.14 + (this.tactic.penaltyGreenBonus || 0);
    // Passiva Loma ("Muro Invalicabile"): cursore rigori -18% più lento!
    const baseSpeed = this.hasLoma ? 1.27 : 1.55;
    this.penalties = {
      turn: 'player',
      myScore: 0,
      oppScore: 0,
      myLog: [],
      oppLog: [],
      selectedCorner: 'right',
      cursor: 0.25,
      cursorDir: 1,
      cursorSpeed: baseSpeed,
      greenHalf,
      yellowHalf: Math.min(0.42, greenHalf * 2.15),
      locked: false,
      lastMessage: 'Pareggio al 90°! Scegli l\'angolo e ferma il cursore sul verde.',
      suddenDeath: false,
    };
  }

  _updatePenalties(dt) {
    const pen = this.penalties;
    if (!pen || pen.locked || pen.turn !== 'player') return;
    pen.cursor += pen.cursorDir * pen.cursorSpeed * dt;
    if (pen.cursor >= 1) {
      pen.cursor = 1;
      pen.cursorDir = -1;
    } else if (pen.cursor <= 0) {
      pen.cursor = 0;
      pen.cursorDir = 1;
    }
  }

  setPenaltyCorner(corner) {
    if (!this.penalties || this.penalties.locked) return;
    if (CORNERS.includes(corner)) {
      this.penalties.selectedCorner = corner;
    }
  }

  shootPlayerPenalty(state) {
    const pen = this.penalties;
    if (!pen || pen.locked || pen.turn !== 'player') return null;

    pen.locked = true;
    const dist = Math.abs(pen.cursor - 0.5);
    const corner = pen.selectedCorner;
    const keeperCorner = pickRandom(CORNERS);
    const sameCorner = corner === keeperCorner;

    let zone = 'red';
    let scored = false;
    if (dist <= pen.greenHalf) {
      zone = 'green';
      scored = sameCorner ? Math.random() < 0.88 : true;
    } else if (dist <= pen.yellowHalf) {
      zone = 'yellow';
      scored = sameCorner ? Math.random() < 0.35 : Math.random() < 0.82;
    } else {
      zone = 'red';
      scored = false;
    }

    pen.myLog.push(scored ? 'goal' : 'miss');
    if (scored) pen.myScore += 1;

    pen.lastMessage = scored
      ? zone === 'green'
        ? '🎯 INCROCIO PERFETTO! RIGORE IN RETE!'
        : '⚽ RIGORE SEGNATO!'
      : zone === 'red'
        ? '❌ Fuori tempo! Pallone alto sopra la traversa!'
        : '🧤 Il portiere intuisce e para!';

    const matchOutcome = this._checkPenaltyDecided(state);
    return {
      scored,
      zone,
      corner,
      keeperCorner,
      matchOutcome,
    };
  }

  advancePenaltyAfterPlayer() {
    const pen = this.penalties;
    if (!pen) return;
    pen.turn = 'opponent';
    pen.locked = false;
    pen.lastMessage = `Tocca a ${this.opponent}! Scegli dove tuffarti per parare!`;
  }

  diveForOpponentPenalty(diveCorner, state) {
    const pen = this.penalties;
    if (!pen || pen.locked || pen.turn !== 'opponent') return null;

    pen.locked = true;
    const oppCorner = pickRandom(CORNERS);
    const guessedRight = diveCorner === oppCorner;
    const scored = guessedRight ? false : Math.random() < 0.76;

    pen.oppLog.push(scored ? 'goal' : 'miss');
    if (scored) pen.oppScore += 1;

    pen.lastMessage = guessedRight
      ? '🧤 PARATONA! Hai intuito l\'angolo perfetto!'
      : scored
        ? `😞 ${this.opponent} trasforma il rigore.`
        : `💥 PALO! ${this.opponent} sbaglia il rigore!`;

    const matchOutcome = this._checkPenaltyDecided(state);
    return {
      scored,
      saved: guessedRight,
      oppCorner,
      diveCorner,
      matchOutcome,
    };
  }

  advancePenaltyAfterOpponent() {
    const pen = this.penalties;
    if (!pen) return;
    pen.turn = 'player';
    pen.locked = false;
    pen.cursor = Math.random() < 0.5 ? 0.12 : 0.88;
    pen.cursorDir = pen.cursor < 0.5 ? 1 : -1;
    if (pen.myLog.length >= 5) {
      pen.suddenDeath = true;
      const baseSpd = this.hasLoma ? 1.27 : 1.55;
      pen.cursorSpeed = Math.min(2.1, baseSpd + (pen.myLog.length - 4) * 0.11);
      pen.lastMessage = '🔥 OLTRANZA! Ogni rigore è decisivo!';
    } else {
      pen.lastMessage = 'Tocca a te! Scegli l\'angolo e ferma il cursore sul verde.';
    }
  }

  _checkPenaltyDecided(state) {
    const pen = this.penalties;
    const myTaken = pen.myLog.length;
    const oppTaken = pen.oppLog.length;

    let winner = null;
    if (myTaken <= 5 && oppTaken <= 5) {
      const myRem = 5 - myTaken;
      const oppRem = 5 - oppTaken;
      if (pen.myScore > pen.oppScore + oppRem) winner = 'player';
      else if (pen.oppScore > pen.myScore + myRem) winner = 'opponent';
    } else if (myTaken === oppTaken) {
      if (pen.myScore > pen.oppScore) winner = 'player';
      else if (pen.oppScore > pen.myScore) winner = 'opponent';
    }

    if (!winner) return null;

    const myPen = pen.myScore;
    const oppPen = pen.oppScore;
    this.phase = 'idle';
    this.penalties = null;

    if (winner === 'player') {
      const reward = awardLeagueVictory(state);
      return {
        type: 'match_finished',
        won: true,
        byPenalties: true,
        leagueIndex: this.leagueIndex,
        starters: this.startersSnapshot,
        myGoals: this.myGoals,
        oppGoals: this.oppGoals,
        myPen,
        oppPen,
        opponent: this.opponent,
        title: this.title,
        ...reward,
      };
    }

    return {
      type: 'match_finished',
      won: false,
      byPenalties: true,
      leagueIndex: this.leagueIndex,
      starters: this.startersSnapshot,
      myGoals: this.myGoals,
      oppGoals: this.oppGoals,
      myPen,
      oppPen,
      opponent: this.opponent,
      title: this.title,
      stayedAtFinal: state.playoffStage > 0,
    };
  }
}
