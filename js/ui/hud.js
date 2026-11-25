import { formatMoney, formatNumber } from '../format.js';
import {
  computeStats,
  isBoostActive,
  getBoostRemainingSec,
  isInvasionBoostActive,
  getInvasionBoostRemainingSec,
  isPolpettaBoostActive,
  getPolpettaBoostRemainingSec,
  isApeBoostActive,
  getApeBoostRemainingSec,
  isSmokeTapBoostActive,
  getSmokeTapBoostRemainingSec,
  canStartSpareggio,
  canPrestige,
  getTotalFreePacks,
  syncPeakIncomeTracking,
} from '../state.js';
import { getExpeditionStatus } from '../expeditions.js';

function formatClubDisplayName(state) {
  const dyn = state.dynastyLevel || 0;
  if (dyn <= 0) return state.clubName;
  return `${state.clubName} 👑×${dyn}`;
}

export class HudController {
  constructor() {
    this.elMoney = document.getElementById('hud-money');
    this.elTokens = document.getElementById('hud-tokens');
    this.elIncome = document.getElementById('hud-income');
    this.elTap = document.getElementById('hud-tap');
    this.elInvBoost = document.getElementById('hud-inv-boost');
    this.elApeBoost = document.getElementById('hud-ape-boost');
    this.elSmokeBoost = document.getElementById('hud-smoke-boost');
    this.elPolpettaBoost = document.getElementById('hud-polpetta-boost');
    this.elLeague = document.getElementById('hud-league');
    this.elBoostBtn = document.getElementById('btn-boost');
    this.elBoostLabel = document.getElementById('btn-boost-label');
    this.elTopBadges = document.getElementById('stage-top-badges');
    this.elClubName = document.getElementById('stage-club-name');
    this.elClubSwatch = document.getElementById('chip-swatch');
    this.elPrestigeChip = document.getElementById('stage-prestige-chip');
    this.elTapHint = document.getElementById('tap-hint');
    this.elBadgeScouting = document.getElementById('badge-scouting');
    this.elBadgeSpareggio = document.getElementById('badge-spareggio');
    this.elBadgeSocieta = document.getElementById('badge-societa');
    this.elQuickMusic = document.getElementById('btn-quick-music');
    this.elQuickSfx = document.getElementById('btn-quick-sfx');

    // Broadcast TV Scoreboard & Possesso
    this.elTvBoard = document.getElementById('tv-scoreboard');
    this.elTvMin = document.getElementById('tv-min');
    this.elTvHomeSwatch = document.getElementById('tv-home-swatch');
    this.elTvHomeName = document.getElementById('tv-home-name');
    this.elTvScore = document.getElementById('tv-score');
    this.elTvAwayName = document.getElementById('tv-away-name');
    this.elTvAwaySwatch = document.getElementById('tv-away-swatch');

    this.elPossHud = document.getElementById('match-possession-hud');
    this.elPossTactic = document.getElementById('poss-tactic');
    this.elPossPct = document.getElementById('poss-pct');
    this.elPossFill = document.getElementById('poss-fill');

    this._last = {};
  }

  _setText(key, el, value) {
    if (el && this._last[key] !== value) {
      this._last[key] = value;
      el.textContent = value;
    }
  }

  update(state, matchCtrl) {
    const now = Date.now();
    const stats = computeStats(state, now);
    syncPeakIncomeTracking(state, stats);

    this._setText('money', this.elMoney, formatMoney(state.money));
    this._setText('tokens', this.elTokens, `🪙 ${formatNumber(state.goldTokens || 0)}`);
    this._setText('income', this.elIncome, `${formatMoney(stats.incomePerSec)}/s`);
    this._setText('tap', this.elTap, `${formatMoney(stats.tapValue)}/tap`);
    this._setText('league', this.elLeague, stats.league.name);

    // Micro-toggle audio rapidi
    if (this.elQuickMusic) {
      this.elQuickMusic.classList.toggle('off', !state.musicEnabled);
      this._setText('qMusic', this.elQuickMusic, state.musicEnabled ? '♫' : '✕');
    }
    if (this.elQuickSfx) {
      this.elQuickSfx.classList.toggle('off', !state.sfxEnabled);
      this._setText('qSfx', this.elQuickSfx, state.sfxEnabled ? '🔊' : '🔇');
    }

    // Boost ×3 da Invasione di Campo
    if (isInvasionBoostActive(state, now)) {
      const rem = Math.ceil(getInvasionBoostRemainingSec(state, now));
      this.elInvBoost?.classList.remove('hidden');
      this._setText('invB', this.elInvBoost, `×3 ${rem}s`);
    } else {
      this.elInvBoost?.classList.add('hidden');
    }

    // Boost ×2,5 da Ape Car (Sponsor Agricolo)
    if (isApeBoostActive(state, now)) {
      const rem = Math.ceil(getApeBoostRemainingSec(state, now));
      this.elApeBoost?.classList.remove('hidden');
      this._setText('apeB', this.elApeBoost, `🛺 ×2,5 ${rem}s`);
    } else {
      this.elApeBoost?.classList.add('hidden');
    }

    // Boost ×3 Tap da Fumogeni / Bi-Zona
    if (isSmokeTapBoostActive(state, now)) {
      const rem = Math.ceil(getSmokeTapBoostRemainingSec(state, now));
      this.elSmokeBoost?.classList.remove('hidden');
      this._setText('smokeB', this.elSmokeBoost, `💨 ×3tap ${rem}s`);
    } else {
      this.elSmokeBoost?.classList.add('hidden');
    }

    // Boost morale ×1,25 da Polpetta
    if (isPolpettaBoostActive(state, now)) {
      const rem = Math.ceil(getPolpettaBoostRemainingSec(state, now));
      this.elPolpettaBoost?.classList.remove('hidden');
      this._setText('polpB', this.elPolpettaBoost, `🐹 ×1,25 ${rem}s`);
    } else {
      this.elPolpettaBoost?.classList.add('hidden');
    }

    // Chip Club personalizzato (con badge Dinastia 👑×N)
    const displayClub = formatClubDisplayName(state);
    this._setText('clubName', this.elClubName, displayClub);
    const swatchCss = `linear-gradient(90deg, ${state.clubColors.primary} 50%, ${state.clubColors.secondary} 50%)`;
    if (this._last.swatchCss !== swatchCss) {
      this._last.swatchCss = swatchCss;
      if (this.elClubSwatch) this.elClubSwatch.style.background = swatchCss;
      if (this.elTvHomeSwatch) this.elTvHomeSwatch.style.background = swatchCss;
    }

    if (this._last.leagueColor !== stats.league.badgeColor) {
      this._last.leagueColor = stats.league.badgeColor;
      this.elLeague.style.background = stats.league.badgeColor;
    }

    if ((state.prestigeShares || 0) > 0) {
      this.elPrestigeChip.classList.remove('hidden');
      this._setText('prestige', this.elPrestigeChip, `×${stats.prestigeMult.toFixed(2).replace('.', ',')}`);
    } else {
      this.elPrestigeChip.classList.add('hidden');
    }

    if (state.stats.totalTaps >= 3 || matchCtrl.active) {
      this.elTapHint.classList.add('hidden');
    } else {
      this.elTapHint.classList.remove('hidden');
    }

    const active = isBoostActive(state, now);
    if (active) {
      const rem = Math.ceil(getBoostRemainingSec(state, now));
      this.elBoostBtn.classList.add('active');
      this._setText('boost', this.elBoostLabel, `Boost x2 • ${rem}s`);
    } else {
      this.elBoostBtn.classList.remove('active');
      this._setText('boost', this.elBoostLabel, 'Boost x2 (Demo 5s)');
    }

    const freeCount = getTotalFreePacks(state);
    const expStatus = getExpeditionStatus(state, now);
    const expReady = Boolean(expStatus && expStatus.ready);
    if (freeCount > 0 || expReady) {
      this.elBadgeScouting.classList.remove('hidden');
      this._setText('freeBadge', this.elBadgeScouting, expReady ? '🗺️' : String(freeCount));
    } else {
      this.elBadgeScouting.classList.add('hidden');
    }

    if (canStartSpareggio(state) && !matchCtrl.active) {
      this.elBadgeSpareggio.classList.remove('hidden');
    } else {
      this.elBadgeSpareggio.classList.add('hidden');
    }

    if (canPrestige(state) && !matchCtrl.active) {
      this.elBadgeSocieta?.classList.remove('hidden');
    } else {
      this.elBadgeSocieta?.classList.add('hidden');
    }

    // Tabellone TV Live
    if (matchCtrl.active) {
      this.elTopBadges.classList.add('hidden');
      this.elTvBoard.classList.remove('hidden');

      const minLabel = matchCtrl.isPenalties ? 'RIG' : `${matchCtrl.minute}'`;
      this._setText('tvMin', this.elTvMin, minLabel);
      this._setText('tvHome', this.elTvHomeName, displayClub);
      this._setText('tvAway', this.elTvAwayName, matchCtrl.opponent);
      this._setText('tvScore', this.elTvScore, `${matchCtrl.myGoals} - ${matchCtrl.oppGoals}`);

      const oppSwatch = `linear-gradient(90deg, ${matchCtrl.oppColors[0]} 50%, ${matchCtrl.oppColors[1]} 50%)`;
      if (this._last.oppSwatch !== oppSwatch) {
        this._last.oppSwatch = oppSwatch;
        this.elTvAwaySwatch.style.background = oppSwatch;
      }

      if (matchCtrl.isPlaying) {
        this.elPossHud.classList.remove('hidden');
        const pct = Math.round(matchCtrl.getPossessionRatio() * 100);
        this._setText('possTactic', this.elPossTactic, `Tattica: ${matchCtrl.tactic.name}`);
        const statusTxt =
          matchCtrl.attackCooldown > 0
            ? `Recupero ${matchCtrl.attackCooldown.toFixed(1)}s`
            : `Possesso ${pct}%`;
        this._setText('possPct', this.elPossPct, statusTxt);
        this.elPossFill.style.width = `${pct}%`;
      } else {
        this.elPossHud.classList.add('hidden');
      }
    } else {
      this.elTopBadges.classList.remove('hidden');
      this.elTvBoard.classList.add('hidden');
      this.elPossHud.classList.add('hidden');
    }
  }
}
