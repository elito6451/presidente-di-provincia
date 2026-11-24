import {
  LEAGUES,
  UPGRADES,
  PACK_COST_GROWTH,
  UPGRADE_COST_GROWTH,
  BOOST_DURATION_MS,
  INVASION_BOOST_DURATION_MS,
  SAVE_VERSION,
  BASE_MATCH_DURATION_SEC,
  DEFAULT_CLUB_NAME,
  DEFAULT_CLUB_COLORS,
  TACTICS,
  PRESTIGE_UNLOCK_RUN_CASH,
  MILESTONE_LEVELS,
  MILESTONE_TOKEN_REWARDS,
} from './config.js';
import {
  getPlayerEffectiveBonus,
  getPlayerSecondaryBonus,
  getPlayerEffectivePower,
} from './gacha.js';
import { getResearchEffects } from './research.js';

export function createInitialState() {
  return {
    version: SAVE_VERSION,
    clubName: DEFAULT_CLUB_NAME,
    clubColors: { ...DEFAULT_CLUB_COLORS },
    selectedTactic: 'contropiede',
    playoffStage: 0,
    buyMode: '1x', // '1x' | '10x' | '100x' | 'MAX'
    money: 0,
    leagueEarned: 0,
    runEarned: 0,
    totalEarned: 0,
    leagueIndex: 0,
    europeanCupWon: false,
    upgrades: {},
    roster: [],
    discoveredSecrets: [],
    claimedCareerMilestones: {}, // anti-exploit: Gettoni Milestone 1 volta in carriera!
    packPurchases: { oratorio: 0, osservatore: 0, vip: 0 },
    freePacks: { oratorio: 0, osservatore: 0, vip: 0 },
    trophies: [],
    prestigeCount: 0,
    prestigeShares: 0,
    goldTokens: 0,
    research: {},
    musicEnabled: true,
    sfxEnabled: true,
    boostUntil: 0,
    invasionBoostUntil: 0,
    tutorialStep: 0, // 0..3 passi attivi, 4 = completato/saltato
    stats: {
      totalTaps: 0,
      packsOpened: 0,
      matchesWon: 0,
      flashEventsHit: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export function getUpgradeLevel(state, upgradeId) {
  return (state.upgrades && state.upgrades[upgradeId]) || 0;
}

export function getTotalInfraLevels(state) {
  return Object.values(state.upgrades || {}).reduce((sum, lvl) => sum + (lvl || 0), 0);
}

// Moltiplicatore Milestone ×2 per ciascun traguardo (Lv 10, 25, 50, 100) — attivo in ogni run!
export function getUpgradeMilestoneMult(level) {
  let mult = 1;
  for (const m of MILESTONE_LEVELS) {
    if (level >= m) mult *= 2;
  }
  return mult;
}

export function getUpgradeMilestoneInfo(level) {
  let prev = 0;
  for (const m of MILESTONE_LEVELS) {
    if (level < m) {
      return {
        next: m,
        prev,
        pct: Math.min(100, Math.max(0, ((level - prev) / (m - prev)) * 100)),
        mult: getUpgradeMilestoneMult(level),
        allDone: false,
      };
    }
    prev = m;
  }
  return {
    next: MILESTONE_LEVELS[MILESTONE_LEVELS.length - 1],
    prev: 100,
    pct: 100,
    mult: getUpgradeMilestoneMult(level),
    allDone: true,
  };
}

export function isUpgradeUnlocked(state, upg) {
  if (getUpgradeLevel(state, upg.id) > 0) return true;
  if (upg.unlockUpgrade) {
    if (getUpgradeLevel(state, upg.unlockUpgrade.id) < upg.unlockUpgrade.level) {
      return false;
    }
  }
  const hasLeague = upg.unlockLeague === undefined || state.leagueIndex >= upg.unlockLeague;
  const hasCashOr = upg.unlockRunCashOr !== undefined && state.runEarned >= upg.unlockRunCashOr;
  if (upg.unlockLeague !== undefined && upg.unlockRunCashOr !== undefined) {
    if (!hasLeague && !hasCashOr) return false;
  } else if (!hasLeague) {
    return false;
  }
  if (upg.unlockRunCash !== undefined && state.runEarned < upg.unlockRunCash) {
    return false;
  }
  return true;
}

/**
 * Restituisce tutti gli upgrade sbloccati + al massimo i successivi 2 come mystery card bloccate.
 */
export function getVisibleUpgrades(state) {
  const result = [];
  let lockedShown = 0;
  for (const upg of UPGRADES) {
    const unlocked = isUpgradeUnlocked(state, upg);
    if (unlocked) {
      result.push({ upgrade: upg, unlocked: true });
    } else if (lockedShown < 2) {
      result.push({ upgrade: upg, unlocked: false });
      lockedShown += 1;
    }
  }
  return result;
}

// Calcolo esatto serie geometrica per acquisti 1x / 10x / 100x / MAX
export function getGeometricSeriesCost(baseCost, costMult, currentLevel, count) {
  if (count <= 0) return 0;
  const r = UPGRADE_COST_GROWTH;
  const firstTerm = baseCost * costMult * Math.pow(r, currentLevel);
  if (count === 1) return Math.max(1, Math.floor(firstTerm));
  return Math.max(1, Math.floor(firstTerm * ((Math.pow(r, count) - 1) / (r - 1))));
}

export function getMaxAffordableCount(baseCost, costMult, currentLevel, money) {
  const r = UPGRADE_COST_GROWTH;
  const firstTerm = baseCost * costMult * Math.pow(r, currentLevel);
  if (money < Math.max(1, Math.floor(firstTerm))) return 0;

  let k = Math.floor(
    Math.log(1 + (money * (r - 1)) / Math.max(0.0001, firstTerm)) / Math.log(r)
  );
  k = Math.max(1, Math.min(500, k));
  // Correzione precisione floating point ai bordi
  while (k > 0 && getGeometricSeriesCost(baseCost, costMult, currentLevel, k) > money) {
    k -= 1;
  }
  while (
    k < 500 &&
    getGeometricSeriesCost(baseCost, costMult, currentLevel, k + 1) <= money
  ) {
    k += 1;
  }
  return k;
}

export function getBulkUpgradePlan(state, upgrade, mode = state.buyMode || '1x') {
  const lvl = getUpgradeLevel(state, upgrade.id);
  const { upgradeCostMult } = getResearchEffects(state);

  if (mode === 'MAX') {
    const maxCount = getMaxAffordableCount(upgrade.baseCost, upgradeCostMult, lvl, state.money);
    const displayCount = Math.max(1, maxCount);
    const totalCost = getGeometricSeriesCost(upgrade.baseCost, upgradeCostMult, lvl, displayCount);
    return {
      count: displayCount,
      affordableCount: maxCount,
      totalCost,
      canBuy: maxCount >= 1,
    };
  }

  const fixedCount = mode === '100x' ? 100 : mode === '10x' ? 10 : 1;
  const totalCost = getGeometricSeriesCost(upgrade.baseCost, upgradeCostMult, lvl, fixedCount);
  return {
    count: fixedCount,
    affordableCount: state.money >= totalCost ? fixedCount : 0,
    totalCost,
    canBuy: state.money >= totalCost,
  };
}

export function getPackCost(state, pack) {
  const opened = (state.packPurchases && state.packPurchases[pack.id]) || 0;
  return Math.floor(pack.baseCost * Math.pow(PACK_COST_GROWTH, opened));
}

export function getFreePackCount(state, packId) {
  return (state.freePacks && state.freePacks[packId]) || 0;
}

export function getTotalFreePacks(state) {
  if (!state.freePacks) return 0;
  return Object.values(state.freePacks).reduce((sum, n) => sum + (n || 0), 0);
}

export function isBoostActive(state, now = Date.now()) {
  return state.boostUntil > now;
}

export function getBoostRemainingSec(state, now = Date.now()) {
  return Math.max(0, (state.boostUntil - now) / 1000);
}

export function isInvasionBoostActive(state, now = Date.now()) {
  return (state.invasionBoostUntil || 0) > now;
}

export function getInvasionBoostRemainingSec(state, now = Date.now()) {
  return Math.max(0, ((state.invasionBoostUntil || 0) - now) / 1000);
}

export function getPendingPrestigeShares(state) {
  if ((state.runEarned || 0) < PRESTIGE_UNLOCK_RUN_CASH) return 0;
  return Math.floor(Math.pow(state.runEarned / PRESTIGE_UNLOCK_RUN_CASH, 0.42));
}

export function canPrestige(state) {
  const pending = getPendingPrestigeShares(state);
  return pending >= 1 && (state.leagueIndex >= 2 || (state.runEarned || 0) >= PRESTIGE_UNLOCK_RUN_CASH);
}

export function computeStats(state, now = Date.now()) {
  const league = LEAGUES[state.leagueIndex] || LEAGUES[0];
  const research = getResearchEffects(state);

  let baseTap = 2;
  let baseIncome = 0;

  for (const upg of UPGRADES) {
    const lvl = getUpgradeLevel(state, upg.id);
    if (lvl > 0) {
      const mMult = getUpgradeMilestoneMult(lvl);
      baseTap += upg.tapAdd * lvl * mMult;
      baseIncome += upg.incomeAdd * lvl * mMult;
    }
  }

  let rosterTapPct = 0;
  let rosterIncomePct = 0;
  let rosterCritPct = 0;
  let rosterMatchSec = 0;
  let squadPower = 0;
  let hasPorcotrio = false;
  let hasLoma = false;

  // Ogni Azione Prestige potenzia anche il rendimento passivo della rosa (+2% per Azione)
  const shares = state.prestigeShares || 0;
  const rosterShareBoost = 1 + shares * 0.02;

  const applyBonus = (type, val) => {
    if (type === 'tapPct') rosterTapPct += val * rosterShareBoost;
    else if (type === 'incomePct') rosterIncomePct += val * rosterShareBoost;
    else if (type === 'critPct') rosterCritPct += val;
    else if (type === 'matchSec') rosterMatchSec += val;
  };

  for (const player of state.roster) {
    applyBonus(player.bonusType, getPlayerEffectiveBonus(player));
    if (player.secondaryBonusType) {
      applyBonus(player.secondaryBonusType, getPlayerSecondaryBonus(player));
    }
    squadPower += getPlayerEffectivePower(player);
    if (player.secretId === 'porcotrio') hasPorcotrio = true;
    if (player.secretId === 'loma') hasLoma = true;
  }

  const prestigeMult = 1 + (shares * research.shareBonusPct) / 100;
  const leagueMult = league.multiplier;
  const adBoostMult = isBoostActive(state, now) ? 2 : 1;
  const invBoostMult = isInvasionBoostActive(state, now) ? 3 : 1;
  const boostMult = adBoostMult * invBoostMult;
  const globalMult = prestigeMult * leagueMult * boostMult;

  const tapValue = baseTap * (1 + rosterTapPct / 100) * globalMult;
  const incomePerSec = baseIncome * (1 + rosterIncomePct / 100) * globalMult;
  const critChance = Math.min(0.65, 0.06 + rosterCritPct / 100);
  const critMultiplier = research.critMultiplier;
  const extraMatchSec = Math.min(4, rosterMatchSec);
  const matchDurationSec = BASE_MATCH_DURATION_SEC + extraMatchSec;
  const infraLevels = getTotalInfraLevels(state);

  return {
    league,
    research,
    baseTap,
    baseIncome,
    rosterTapPct,
    rosterIncomePct,
    rosterCritPct,
    rosterMatchSec: extraMatchSec,
    squadPower,
    infraLevels,
    prestigeMult,
    leagueMult,
    adBoostMult,
    invBoostMult,
    boostMult,
    tapValue,
    incomePerSec,
    critChance,
    critMultiplier,
    matchDurationSec,
    hasPorcotrio,
    hasLoma,
  };
}

export function getChecklistStatus(state) {
  const league = LEAGUES[state.leagueIndex] || LEAGUES[0];
  const stats = computeStats(state);

  const cashCur = state.leagueEarned;
  const cashReq = league.unlockCash;
  const cashOk = cashCur >= cashReq;

  const squadCur = stats.squadPower;
  const squadReq = league.minSquadPower;
  const squadOk = squadCur >= squadReq;

  const infraCur = stats.infraLevels;
  const infraReq = league.minInfraLevels;
  const infraOk = infraCur >= infraReq;

  return {
    cash: {
      current: cashCur,
      target: cashReq,
      pct: Math.min(100, (cashCur / Math.max(1, cashReq)) * 100),
      done: cashOk,
    },
    squadPower: {
      current: squadCur,
      target: squadReq,
      pct: Math.min(100, (squadCur / Math.max(1, squadReq)) * 100),
      done: squadOk,
    },
    infra: {
      current: infraCur,
      target: infraReq,
      pct: Math.min(100, (infraCur / Math.max(1, infraReq)) * 100),
      done: infraOk,
    },
    allReady: cashOk && squadOk && infraOk,
  };
}

export function getCurrentMatchRound(state) {
  const league = LEAGUES[state.leagueIndex] || LEAGUES[0];
  const rounds = league.rounds || [];
  const stageIdx = Math.min(Math.max(0, state.playoffStage || 0), Math.max(0, rounds.length - 1));
  return {
    league,
    rounds,
    stageIdx,
    totalRounds: rounds.length,
    round: rounds[stageIdx],
    isKnockoutBracket: rounds.length > 1,
  };
}

export function addMoney(state, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.money += amount;
  state.leagueEarned += amount;
  state.runEarned = (state.runEarned || 0) + amount;
  state.totalEarned += amount;
}

export function addGoldTokens(state, count) {
  const n = Math.floor(count);
  if (!Number.isFinite(n) || n <= 0) return;
  state.goldTokens = (state.goldTokens || 0) + n;
}

export function performTap(state, { extraCritPct = 0 } = {}) {
  const stats = computeStats(state);
  const effCrit = Math.min(0.75, stats.critChance + extraCritPct / 100);
  const isCrit = Math.random() < effCrit;
  const amount = stats.tapValue * (isCrit ? stats.critMultiplier : 1);
  addMoney(state, amount);
  state.stats.totalTaps += 1;
  return { amount, isCrit, stats };
}

export function buyUpgradeBulk(state, upgradeId, mode = state.buyMode || '1x') {
  const upgrade = UPGRADES.find((u) => u.id === upgradeId);
  if (!upgrade || !isUpgradeUnlocked(state, upgrade)) return { ok: false };

  const plan = getBulkUpgradePlan(state, upgrade, mode);
  if (!plan.canBuy || plan.count <= 0) return { ok: false };

  const oldLevel = getUpgradeLevel(state, upgrade.id);
  const newLevel = oldLevel + plan.count;

  state.money -= plan.totalCost;
  state.upgrades[upgrade.id] = newLevel;

  // Controlla Milestone ×2 attraversate (Gettoni d'Oro 1 sola volta in carriera!)
  if (!state.claimedCareerMilestones) state.claimedCareerMilestones = {};
  const newMilestones = [];
  let tokensAwarded = 0;

  for (const m of MILESTONE_LEVELS) {
    if (oldLevel < m && newLevel >= m) {
      newMilestones.push(m);
      const key = `${upgrade.id}:${m}`;
      if (!state.claimedCareerMilestones[key]) {
        state.claimedCareerMilestones[key] = true;
        const reward = MILESTONE_TOKEN_REWARDS[m] || 1;
        tokensAwarded += reward;
      }
    }
  }
  if (tokensAwarded > 0) {
    addGoldTokens(state, tokensAwarded);
  }

  return {
    ok: true,
    upgrade,
    boughtCount: plan.count,
    cost: plan.totalCost,
    oldLevel,
    newLevel,
    newMilestones,
    tokensAwarded,
  };
}

export function activateBoost(state, durationMs = BOOST_DURATION_MS) {
  const now = Date.now();
  const base = state.boostUntil > now ? state.boostUntil : now;
  state.boostUntil = Math.min(now + durationMs * 3, base + durationMs);
}

export function activateInvasionBoost(state, durationMs = INVASION_BOOST_DURATION_MS) {
  const now = Date.now();
  const base = (state.invasionBoostUntil || 0) > now ? state.invasionBoostUntil : now;
  state.invasionBoostUntil = Math.min(now + durationMs * 2, base + durationMs);
}

export function canStartSpareggio(state) {
  const league = LEAGUES[state.leagueIndex];
  if (!league) return false;
  if (state.leagueIndex === LEAGUES.length - 1 && state.europeanCupWon) {
    return false;
  }
  return getChecklistStatus(state).allReady;
}

export function awardLeagueVictory(state) {
  const { league, stageIdx, totalRounds, rounds } = getCurrentMatchRound(state);
  if (!league) return { promoted: false, finalCup: false, semifinalWon: false, tokensAwarded: 0 };

  state.stats.matchesWon += 1;

  if (totalRounds > 1 && stageIdx < totalRounds - 1) {
    state.playoffStage = stageIdx + 1;
    const semiTokens = Math.max(3, Math.floor((league.promotionTokens || 10) * 0.35));
    addGoldTokens(state, semiTokens);
    return {
      promoted: false,
      finalCup: false,
      semifinalWon: true,
      nextRound: rounds[state.playoffStage],
      newLeague: league,
      trophyName: null,
      tokensAwarded: semiTokens,
    };
  }

  const promoTokens = league.promotionTokens || 5;
  addGoldTokens(state, promoTokens);

  if (!state.trophies.includes(league.trophyId)) {
    state.trophies.push(league.trophyId);
  }

  if (state.leagueIndex < LEAGUES.length - 1) {
    state.leagueIndex += 1;
    state.leagueEarned = 0;
    state.playoffStage = 0;
    return {
      promoted: true,
      finalCup: false,
      semifinalWon: false,
      newLeague: LEAGUES[state.leagueIndex],
      trophyName: league.trophyName,
      tokensAwarded: promoTokens,
    };
  }

  state.europeanCupWon = true;
  state.playoffStage = 0;
  return {
    promoted: false,
    finalCup: true,
    semifinalWon: false,
    newLeague: league,
    trophyName: league.trophyName,
    tokensAwarded: promoTokens,
  };
}

export function setSelectedTactic(state, tacticId) {
  if (TACTICS[tacticId]) {
    state.selectedTactic = tacticId;
    return true;
  }
  return false;
}

export function setClubCustomization(state, { name, primary, secondary }) {
  if (typeof name === 'string') {
    const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 22);
    state.clubName = cleaned || DEFAULT_CLUB_NAME;
  }
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  if (typeof primary === 'string' && hexRe.test(primary)) {
    state.clubColors.primary = primary;
  }
  if (typeof secondary === 'string' && hexRe.test(secondary)) {
    state.clubColors.secondary = secondary;
  }
}

export function performPrestige(state) {
  if (!canPrestige(state)) return { ok: false, gainedShares: 0 };

  const gainedShares = getPendingPrestigeShares(state);
  const keptTrophies = [...state.trophies];
  const keptSecrets = [...(state.discoveredSecrets || [])];
  const keptCareerMilestones = { ...(state.claimedCareerMilestones || {}) };
  const keptResearch = { ...(state.research || {}) };
  const keptTokens = state.goldTokens || 0;
  const nextPrestige = state.prestigeCount + 1;
  const nextShares = (state.prestigeShares || 0) + gainedShares;
  const musicEnabled = state.musicEnabled;
  const sfxEnabled = state.sfxEnabled;
  const stats = { ...state.stats };
  const totalEarned = state.totalEarned;
  const clubName = state.clubName;
  const clubColors = { ...state.clubColors };
  const selectedTactic = state.selectedTactic;
  const buyMode = state.buyMode || '1x';
  const tutorialStep = 4;

  const fresh = createInitialState();
  Object.assign(state, fresh, {
    clubName,
    clubColors,
    selectedTactic,
    buyMode,
    trophies: keptTrophies,
    discoveredSecrets: keptSecrets,
    claimedCareerMilestones: keptCareerMilestones,
    research: keptResearch,
    goldTokens: keptTokens,
    prestigeCount: nextPrestige,
    prestigeShares: nextShares,
    musicEnabled,
    sfxEnabled,
    tutorialStep,
    stats,
    totalEarned,
  });
  return { ok: true, gainedShares, totalShares: nextShares };
}

export function resetStateInPlace(state) {
  const musicEnabled = state.musicEnabled;
  const sfxEnabled = state.sfxEnabled;
  const fresh = createInitialState();
  Object.assign(state, fresh, { musicEnabled, sfxEnabled });
}
