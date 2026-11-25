import { TACTICS, ATTACK_COOLDOWN_SEC } from './config.js';
import {
  computeStats,
  canStartSpareggio,
  awardLeagueVictory,
  getCurrentMatchRound,
  getStarterPlayers,
  getDynastyDifficultyMult,
} from './state.js';

const CORNERS = ['left', 'center', 'right'];
const SAVE_HEIGHTS = [0.28, 0.50, 0.72]; // Alto, Centro, Basso

// 5 zone bersaglio sui Calci di Rigore Frontali 3D (v4.5)
export const PENALTY_ZONES = [
  {
    id: 'top_left',
    label: '↖ Incrocio SX',
    short: '↖ Alto SX',
    col: 'left',
    height: 'top',
    greenMult: 0.68,
    unstoppableOnGreen: true,
    tx: 0.24,
    ty: 0.28,
  },
  {
    id: 'panenka',
    label: '🥄 Cucchiaio',
    short: '🥄 Cucchiaio',
    col: 'center',
    height: 'mid',
    greenMult: 0.92,
    isPanenka: true,
    tx: 0.50,
    ty: 0.40,
  },
  {
    id: 'top_right',
    label: '↗ Incrocio DX',
    short: '↗ Alto DX',
    col: 'right',
    height: 'top',
    greenMult: 0.68,
    unstoppableOnGreen: true,
    tx: 0.76,
    ty: 0.28,
  },
  {
    id: 'low_left',
    label: '↙ Basso SX',
    short: '↙ Basso SX',
    col: 'left',
    height: 'low',
    greenMult: 1.18,
    tx: 0.26,
    ty: 0.72,
  },
  {
    id: 'low_right',
    label: '↘ Basso DX',
    short: '↘ Basso DX',
    col: 'right',
    height: 'low',
    greenMult: 1.18,
    tx: 0.74,
    ty: 0.72,
  },
];

export const PENALTY_ZONE_BY_ID = Object.fromEntries(PENALTY_ZONES.map((z) => [z.id, z]));

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

    // Possesso normalizzato 0..100
    this.possession = 0;
    this.squadFactor = 1.0;
    this.attackCooldown = 0;
    this.attackCooldownDuration = ATTACK_COOLDOWN_SEC;
    this.actionBufferTimer = 0;
    this.saveWindowSec = 1.35;
    this.hasPorcotrio = false;
    this.hasLoma = false;
    this.hasPscon = false;
    this.hasVavelocino = false;
    this.psconShieldAvailable = false;
    this.dynastyDiffMult = 1.0;
    this.matchPrecisionMult = 1.0;
    this.challengePossMult = 1.0;
    this.challengePenaltyMult = 1.0;
    this.startersSnapshot = [];
    this.dangerSchedule = [];

    this.leagueIndex = 0;
    this.stageIdx = 0;

    // Mutua esclusione: al massimo 1 Azione Chiave attiva alla volta
    this.goalChance = null;
    this.enemyDanger = null;

    // Pausa match per Finto VAR comico
    this.paused = false;
    this.varTriggeredThisMatch = false;

    // Stato Calci di Rigore 3D
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

    this.duration = stats.matchDurationSec;
    this.elapsed = 0;
    this.minute = 0;
    this.myGoals = 0;
    this.oppGoals = 0;
    this.possession = 18;
    this.attackCooldown = 0;
    this.actionBufferTimer = 0;

    const ratio = stats.squadPower / Math.max(1, league.minSquadPower);
    this.squadFactor = Math.max(0.85, Math.min(1.35, 0.85 + 0.24 * Math.log2(ratio + 1)));

    this.hasPorcotrio = stats.hasPorcotrio;
    this.hasLoma = stats.hasLoma;
    this.hasPscon = stats.hasPscon;
    this.hasVavelocino = stats.hasVavelocino;
    this.psconShieldAvailable = this.hasPscon;
    this.dynastyDiffMult = getDynastyDifficultyMult(state);

    const relicPrecision = 1 + (stats.relicEffects?.matchPrecisionPct || 0) / 100;
    this.matchPrecisionMult =
      (stats.research?.matchPrecisionMult || 1.0) * relicPrecision * this.dynastyDiffMult;
    this.challengePossMult =
      1 + ((stats.challengePerks?.possessionPct || 0) + (stats.relicEffects?.possessionPct || 0)) / 100;
    this.challengePenaltyMult =
      (1 + (stats.challengePerks?.penaltyBarPct || 0) / 100) * this.dynastyDiffMult;

    this.attackCooldownDuration = this.hasVavelocino ? 2.4 : ATTACK_COOLDOWN_SEC;
    this.startersSnapshot = getStarterPlayers(state);

    const lomaMult = this.hasLoma ? 1.25 : 1.0;
    this.saveWindowSec =
      (round.saveWindowSec || 1.35) * tactic.saveWindowMult * lomaMult * this.matchPrecisionMult;

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
    const baseHalf = 0.16 * (this.hasPorcotrio ? 1.22 : 1.0) * this.matchPrecisionMult;
    const center = 0.70;
    const bandMin = Math.max(0.32, center - baseHalf);
    const bandMax = Math.min(0.95, center + baseHalf);

    this.goalChance = {
      type: 'goal_chance',
      label: 'TIRA!',
      nx: 0.72 + Math.random() * 0.11,
      ny: 0.36 + Math.random() * 0.34,
      timeLeft: maxTime,
      maxTime,
      bandMin,
      bandMax,
      spawnedAt: performance.now(),
    };
  }

  _computeSaveBand(scale = 1.0) {
    const halfW = Math.min(
      0.32,
      Math.max(0.11, 0.21 * (this.hasLoma ? 1.2 : 1.0) * this.matchPrecisionMult * scale)
    );
    const center = 0.67;
    const bandMin = Math.max(0.28, center - halfW);
    const bandMax = Math.min(0.96, center + halfW);
    const perfectHalf = Math.min(halfW * 0.42, 0.065);
    return {
      bandMin,
      bandMax,
      perfectMin: center - perfectHalf,
      perfectMax: center + perfectHalf,
    };
  }

  _spawnEnemyDanger() {
    const maxTime = this.saveWindowSec;
    const ny = pickRandom(SAVE_HEIGHTS);
    const nx = 0.16 + Math.random() * 0.09;
    const band = this._computeSaveBand(1.0);

    // Serie A+ (leagueIndex >= 3): 15% Finta + 15% Ribattuta
    const roll = Math.random();
    const isFeint = this.leagueIndex >= 3 && roll < 0.15;
    const hasRebound = this.leagueIndex >= 3 && roll >= 0.15 && roll < 0.30;
    const realNy = isFeint ? pickRandom(SAVE_HEIGHTS.filter((h) => h !== ny)) : ny;
    const feintMaxTime = this.hasLoma ? 0.42 : 0.32;

    this.enemyDanger = {
      type: 'enemy_danger',
      label: 'PARA!',
      nx,
      ny,
      timeLeft: maxTime,
      maxTime,
      bandMin: band.bandMin,
      bandMax: band.bandMax,
      perfectMin: band.perfectMin,
      perfectMax: band.perfectMax,
      isFeint,
      feintTimeLeft: isFeint ? feintMaxTime : 0,
      feintMaxTime,
      realNy,
      feintBaited: false,
      hasRebound,
      isRebound: false,
      spawnedAt: performance.now(),
    };
  }

  registerTap(isCrit = false) {
    if (!this.isPlaying || this.paused) return null;
    if (this.goalChance || this.enemyDanger) return null;
    if (this.attackCooldown > 0) return null;

    const baseGain = isCrit ? 12.0 * this.tactic.critPossessionMult : 7.4;
    const turboMult = (this.hasVavelocino ? 1.25 : 1.0) * this.challengePossMult;
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
   * Hit-test generoso (50px) per smartphone su TIRA! e PARA! (precisione + finta + ribattuta).
   */
  tryHitKeyActionPx(clickX, clickY, projectFn) {
    if (!this.isPlaying || this.paused) return null;
    const hitRadiusPx = 50;

    if (this.goalChance) {
      const act = this.goalChance;
      const pt = projectFn(act.nx, act.ny);
      if (Math.hypot(clickX - pt.x, clickY - pt.y) <= hitRadiusPx) {
        const progress = 1 - act.timeLeft / act.maxTime;
        this.goalChance = null;
        this.attackCooldown = this.attackCooldownDuration;
        this.actionBufferTimer = 1.05;

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
        // 1) Se tocchi durante la FINTA, abbocchi e la fascia di parata reale si stringe del 30%!
        if (act.isFeint) {
          const tightBand = this._computeSaveBand(0.70);
          act.isFeint = false;
          act.feintBaited = true;
          act.ny = act.realNy;
          act.timeLeft = act.maxTime;
          act.bandMin = tightBand.bandMin;
          act.bandMax = tightBand.bandMax;
          act.perfectMin = tightBand.perfectMin;
          act.perfectMax = tightBand.perfectMax;
          return { type: 'feint_baited', nx: act.nx, ny: act.ny };
        }

        const progress = 1 - act.timeLeft / act.maxTime;

        // 2) Tuffo in anticipo (prima che l'anello diventi ciano/verde PARA!)
        if (progress < act.bandMin) {
          this.enemyDanger = null;
          this.actionBufferTimer = 0.9;
          if (this.psconShieldAvailable) {
            this.psconShieldAvailable = false;
            return { type: 'pscon_block', nx: act.nx, ny: act.ny };
          }
          this.oppGoals += 1;
          return { type: 'early_dive', nx: act.nx, ny: act.ny, progress };
        }

        // 3) Parata valida (normale o Perfetta!)
        const isPerfect = progress >= act.perfectMin && progress <= act.perfectMax;

        // Se ha la Ribattuta attiva, genera subito un secondo PARA! rapido
        if (act.hasRebound) {
          const reboundNy = pickRandom(SAVE_HEIGHTS.filter((h) => h !== act.ny));
          const reboundMax = (this.hasLoma ? 1.05 : 0.86) * Math.max(0.84, this.dynastyDiffMult);
          const rebBand = this._computeSaveBand(0.92);
          this.enemyDanger = {
            type: 'enemy_danger',
            label: 'RIBATTUTA!',
            nx: Math.max(0.14, Math.min(0.28, act.nx + (Math.random() - 0.5) * 0.06)),
            ny: reboundNy,
            timeLeft: reboundMax,
            maxTime: reboundMax,
            bandMin: rebBand.bandMin,
            bandMax: rebBand.bandMax,
            perfectMin: rebBand.perfectMin,
            perfectMax: rebBand.perfectMax,
            isFeint: false,
            feintTimeLeft: 0,
            feintMaxTime: 0,
            realNy: reboundNy,
            feintBaited: false,
            hasRebound: false,
            isRebound: true,
            spawnedAt: performance.now(),
          };
          return { type: 'rebound_spawn', nx: act.nx, ny: act.ny, isPerfect };
        }

        this.enemyDanger = null;
        this.actionBufferTimer = 0.9;
        if (isPerfect) {
          this.possession = Math.min(99, this.possession + 25);
          return { type: 'perfect_save', nx: act.nx, ny: act.ny, progress };
        }
        return { type: 'player_save', nx: act.nx, ny: act.ny, progress };
      }
    }

    return null;
  }

  update(dt, state) {
    if (this.paused) return [];
    if (this.phase === 'penalties') {
      return this._updatePenalties(dt, state);
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

    // 1. Avanzamento passivo possesso
    if (!this.goalChance && !this.enemyDanger && this.attackCooldown <= 0) {
      const turboMult = (this.hasVavelocino ? 1.25 : 1.0) * this.challengePossMult;
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

    // 2. Schedule attacchi avversari PARA!
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

    // 3. Countdown TIRA!
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

    // 4. Countdown PARA! (prima eventuale Finta, poi anello reale)
    if (this.enemyDanger) {
      if (this.enemyDanger.isFeint) {
        this.enemyDanger.feintTimeLeft -= dt;
        if (this.enemyDanger.feintTimeLeft <= 0) {
          this.enemyDanger.isFeint = false;
          this.enemyDanger.ny = this.enemyDanger.realNy;
          this.enemyDanger.timeLeft = this.enemyDanger.maxTime;
          events.push({
            type: 'feint_switch',
            nx: this.enemyDanger.nx,
            ny: this.enemyDanger.ny,
          });
        }
      } else {
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

  // --- CALCI DI RIGORE FRONTALI 3D (v4.5) ---

  _applyPenaltyZoneBounds(pen) {
    const zone = PENALTY_ZONE_BY_ID[pen.selectedZone] || PENALTY_ZONES[2];
    const greenHalf = Math.min(0.28, Math.max(0.06, pen.baseGreenHalf * zone.greenMult));
    pen.greenHalf = greenHalf;
    pen.yellowHalf = Math.min(0.42, greenHalf * 2.1);
  }

  _initPenalties() {
    this.phase = 'penalties';
    const baseGreen = 0.14 + (this.tactic.penaltyGreenBonus || 0);
    const baseGreenHalf = Math.min(0.26, Math.max(0.08, baseGreen * this.challengePenaltyMult));
    const baseSpeed = (this.hasLoma ? 1.27 : 1.55) / Math.max(0.84, this.dynastyDiffMult);

    const pen = {
      turn: 'player', // 'player' | 'opponent'
      myScore: 0,
      oppScore: 0,
      myLog: [],
      oppLog: [],
      selectedZone: 'top_right',
      cursor: 0.22,
      cursorDir: 1,
      cursorSpeed: baseSpeed,
      baseGreenHalf,
      greenHalf: baseGreenHalf,
      yellowHalf: baseGreenHalf * 2.1,
      locked: false,
      lastMessage: 'Pareggio al 90°! Scegli la zona in porta 3D e ferma il cursore sul verde.',
      suddenDeath: false,
      // Riflessi parata avversario
      oppCorner: 'center',
      runupDuration: 1.15,
      runupElapsed: 0,
      telegraphDuration: 0.45,
      telegraphStart: 0.70,
      telegraphHint: null,
      // Animazione palla + tuffo 3D su Canvas
      shotAnim: null,
      pendingMatchOutcome: null,
    };
    this._applyPenaltyZoneBounds(pen);
    this.penalties = pen;
  }

  _updatePenalties(dt, state) {
    const pen = this.penalties;
    if (!pen) return [];
    const events = [];

    if (pen.shotAnim && pen.shotAnim.active) {
      pen.shotAnim.elapsed = Math.min(pen.shotAnim.duration, pen.shotAnim.elapsed + dt);
    }

    if (pen.locked) return events;

    if (pen.turn === 'player') {
      pen.cursor += pen.cursorDir * pen.cursorSpeed * dt;
      if (pen.cursor >= 1) {
        pen.cursor = 1;
        pen.cursorDir = -1;
      } else if (pen.cursor <= 0) {
        pen.cursor = 0;
        pen.cursorDir = 1;
      }
    } else if (pen.turn === 'opponent') {
      pen.runupElapsed += dt;
      if (pen.runupElapsed >= pen.telegraphStart) {
        const intensity = Math.min(
          1,
          (pen.runupElapsed - pen.telegraphStart) / Math.max(0.05, pen.telegraphDuration)
        );
        pen.telegraphHint = { corner: pen.oppCorner, intensity };
      } else {
        pen.telegraphHint = null;
      }

      if (pen.runupElapsed >= pen.runupDuration) {
        const res = this._resolveOpponentPenalty(null, state, true);
        if (res) {
          events.push({ type: 'penalty_auto_resolved', res });
        }
      }
    }

    return events;
  }

  setPenaltyZone(zoneId) {
    if (!this.penalties || this.penalties.locked || this.penalties.turn !== 'player') return;
    if (PENALTY_ZONE_BY_ID[zoneId]) {
      this.penalties.selectedZone = zoneId;
      this._applyPenaltyZoneBounds(this.penalties);
    }
  }

  shootPlayerPenalty(state) {
    const pen = this.penalties;
    if (!pen || pen.locked || pen.turn !== 'player') return null;

    pen.locked = true;
    const dist = Math.abs(pen.cursor - 0.5);
    const zDef = PENALTY_ZONE_BY_ID[pen.selectedZone] || PENALTY_ZONES[2];
    const keeperCorner = pickRandom(CORNERS);
    const sameCorner = zDef.col === keeperCorner;

    let timingZone = 'red';
    let scored = false;
    let saved = false;
    let outcomeType = 'goal';

    if (dist <= pen.greenHalf) {
      timingZone = 'green';
      if (zDef.isPanenka) {
        if (keeperCorner === 'center') {
          scored = false;
          saved = true;
          outcomeType = 'saved';
        } else {
          scored = true;
          outcomeType = 'panenka_goal';
        }
      } else if (zDef.unstoppableOnGreen) {
        scored = true;
        outcomeType = 'top_bin';
      } else {
        scored = sameCorner ? Math.random() < 0.45 : true;
        saved = !scored;
        outcomeType = scored ? 'goal' : 'saved';
      }
    } else if (dist <= pen.yellowHalf) {
      timingZone = 'yellow';
      if (zDef.isPanenka) {
        scored = keeperCorner === 'center' ? false : Math.random() < 0.78;
        saved = !scored;
        outcomeType = scored ? 'goal' : 'saved';
      } else {
        scored = sameCorner ? Math.random() < 0.28 : Math.random() < 0.80;
        saved = !scored;
        outcomeType = scored ? 'goal' : 'saved';
      }
    } else {
      timingZone = 'red';
      scored = false;
      saved = false;
      outcomeType = 'over';
    }

    pen.myLog.push(scored ? 'goal' : 'miss');
    if (scored) pen.myScore += 1;

    pen.shotAnim = {
      active: true,
      elapsed: 0,
      duration: 0.72,
      isPlayerKick: true,
      targetZoneId: zDef.id,
      targetTx: zDef.tx,
      targetTy: outcomeType === 'over' ? -0.14 : zDef.ty,
      keeperCorner,
      keeperHeight: zDef.height,
      scored,
      saved,
      outcomeType,
    };

    pen.lastMessage = scored
      ? outcomeType === 'panenka_goal'
        ? '🥄 CUCCHIAIO DA MAESTRO! Portiere spiazzato!'
        : outcomeType === 'top_bin'
          ? '🎯 INCROCIO IMPARABILE! Palla nel sette!'
          : '⚽ RIGORE SEGNATO!'
      : outcomeType === 'over'
        ? '❌ Fuori tempo! Pallone in curva sopra la traversa!'
        : zDef.isPanenka
          ? '🧤 Il portiere resta fermo e blocca il cucchiaio!'
          : '🧤 Il portiere intuisce l\'angolo e respinge!';

    const matchOutcome = this._checkPenaltyDecided(state);
    pen.pendingMatchOutcome = matchOutcome;
    return {
      scored,
      saved,
      zone: timingZone,
      targetZone: zDef.id,
      keeperCorner,
      matchOutcome,
    };
  }

  advancePenaltyAfterPlayer() {
    const pen = this.penalties;
    if (!pen) return;
    pen.turn = 'opponent';
    pen.locked = false;
    pen.shotAnim = null;
    pen.oppCorner = pickRandom(CORNERS);
    pen.runupDuration = 1.18;
    pen.runupElapsed = 0;
    pen.telegraphDuration = (this.leagueIndex >= 6 ? 0.38 : 0.46) * (this.hasLoma ? 1.30 : 1.0);
    pen.telegraphStart = Math.max(0.35, pen.runupDuration - pen.telegraphDuration);
    pen.telegraphHint = null;
    pen.lastMessage = `Rincorsa di ${this.opponent}... osserva l'inclinazione e TUFFATI!`;
  }

  diveForOpponentPenalty(diveCorner, state) {
    return this._resolveOpponentPenalty(diveCorner, state, false);
  }

  _resolveOpponentPenalty(diveCorner, state, timedOut = false) {
    const pen = this.penalties;
    if (!pen || pen.locked || pen.turn !== 'opponent') return null;

    pen.locked = true;
    const oppCorner = pen.oppCorner;
    const guessedRight = !timedOut && diveCorner === oppCorner;
    const scored = guessedRight ? false : timedOut ? Math.random() < 0.88 : Math.random() < 0.78;
    const hitPost = !guessedRight && !scored;

    pen.oppLog.push(scored ? 'goal' : 'miss');
    if (scored) pen.oppScore += 1;

    const oppTx = oppCorner === 'left' ? 0.25 : oppCorner === 'right' ? 0.75 : 0.50;
    const oppTy = hitPost ? 0.16 : 0.52;

    pen.shotAnim = {
      active: true,
      elapsed: 0,
      duration: 0.72,
      isPlayerKick: false,
      targetZoneId: oppCorner,
      targetTx: oppTx,
      targetTy: oppTy,
      keeperCorner: diveCorner || 'none',
      keeperHeight: 'mid',
      scored,
      saved: guessedRight,
      outcomeType: guessedRight ? 'saved' : hitPost ? 'post' : 'goal',
    };

    pen.lastMessage = guessedRight
      ? '🧤 PARATONA DI RIFLESSO! Hai letto la rincorsa!'
      : timedOut
        ? scored
          ? `⏱️ Troppo tardi! ${this.opponent} ti spiazza dal dischetto.`
          : `💥 TRAVERSA! ${this.opponent} grazia il tuo portiere immobile!`
        : scored
          ? `😞 ${this.opponent} trasforma il rigore.`
          : `💥 PALO! ${this.opponent} sbaglia il rigore!`;

    const matchOutcome = this._checkPenaltyDecided(state);
    pen.pendingMatchOutcome = matchOutcome;
    return {
      scored,
      saved: guessedRight,
      timedOut,
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
    pen.shotAnim = null;
    pen.telegraphHint = null;
    pen.cursor = Math.random() < 0.5 ? 0.12 : 0.88;
    pen.cursorDir = pen.cursor < 0.5 ? 1 : -1;
    if (pen.myLog.length >= 5) {
      pen.suddenDeath = true;
      const baseSpd = (this.hasLoma ? 1.27 : 1.55) / Math.max(0.84, this.dynastyDiffMult);
      pen.cursorSpeed = Math.min(2.25, baseSpd + (pen.myLog.length - 4) * 0.11);
      pen.lastMessage = '🔥 OLTRANZA! Ogni rigore è decisivo!';
    } else {
      pen.lastMessage = 'Tocca a te! Scegli la zona in porta 3D e ferma il cursore sul verde.';
    }
  }

  finishPenalties() {
    this.phase = 'idle';
    this.penalties = null;
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
