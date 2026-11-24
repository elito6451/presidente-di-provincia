import {
  LEAGUES,
  UPGRADES,
  PACK_COST_GROWTH,
  UPGRADE_COST_GROWTH,
  BOOST_DURATION_MS,
  INVASION_BOOST_DURATION_MS,
  POLPETTA_BOOST_DURATION_MS,
  POLPETTA_COOLDOWN_MS,
  SAVE_VERSION,
  BASE_MATCH_DURATION_SEC,
  DEFAULT_CLUB_NAME,
  DEFAULT_CLUB_COLORS,
  TACTICS,
  PRESTIGE_UNLOCK_RUN_CASH,
  MILESTONE_LEVELS,
  MILESTONE_TOKEN_REWARDS,
  FORMATION_SLOTS_DEF,
} from './config.js';
import {
  getPlayerEffectiveBonus,
  getPlayerSecondaryBonus,
  getPlayerEffectivePower,
  getBenchSellValue,
  canFuseBenchIntoStarter,
  sortRosterInPlace,
} from './gacha.js';
import { getResearchEffects } from './research.js';

export function createEmptyLineup() {
  return { POR: null, DIF: null, CEN: null, ATT1: null, ATT2: null };
}

export function createInitialState() {
  return {
    version: SAVE_VERSION,
    clubName: DEFAULT_CLUB_NAME,
    clubColors: { ...DEFAULT_CLUB_COLORS },
    selectedTactic: 'contropiede',
    playoffStage: 0,
    buyMode: '1x',
    money: 0,
    leagueEarned: 0,
    runEarned: 0,
    runPeakBaseIncome: 0, // picco /s base della run senza boost temporanei (per costo buste anti-trucco)
    totalEarned: 0,
    leagueIndex: 0,
    seasonNumber: 1,
    seasonStars: 0,
    seasonCompleted: false, // true quando vinci anche la Superlega Galattica
    europeanCupWon: false,
    upgrades: {},
    roster: [],
    lineup: createEmptyLineup(),
    discoveredSecrets: [],
    claimedCareerMilestones: {},
    completedChallenges: [],
    cleanSheetStreak: 0,
    boughtIncomeUpgradeThisRun: false,
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
    polpettaBoostUntil: 0,
    polpettaCooldownUntil: 0,
    tutorialStep: 0,
    stats: {
      totalTaps: 0,
      packsOpened: 0,
      matchesWon: 0,
      flashEventsHit: 0,
      maxIncomePerSec: 0,
    },
    lastSavedAt: Date.now(),
  };
}

// --- FORMAZIONE A 5 RUOLI (1 POR, 1 DIF, 1 CEN, 2 ATT) & PANCHINA ---

export function getStarters(state) {
  const map = new Map((state.roster || []).map((p) => [p.id, p]));
  const lineup = state.lineup || createEmptyLineup();
  const starters = [];
  const used = new Set();

  for (const slot of FORMATION_SLOTS_DEF) {
    const pid = lineup[slot.key];
    if (pid && !used.has(pid) && map.has(pid)) {
      const pl = map.get(pid);
      if (pl.role === slot.role) {
        used.add(pid);
        starters.push({ slotKey: slot.key, slotDef: slot, player: pl });
      }
    }
  }
  return starters;
}

export function getStarterPlayers(state) {
  return getStarters(state).map((s) => s.player);
}

export function getStarterIdSet(state) {
  return new Set(getStarters(state).map((s) => s.player.id));
}

export function getBenchPlayers(state) {
  const starterIds = getStarterIdSet(state);
  return (state.roster || []).filter((p) => !starterIds.has(p.id));
}

export function autoAssignLineup(state) {
  const next = createEmptyLineup();
  const sorted = [...(state.roster || [])].sort(
    (a, b) => getPlayerEffectivePower(b) - getPlayerEffectivePower(a)
  );
  const used = new Set();

  for (const slot of FORMATION_SLOTS_DEF) {
    const candidate = sorted.find((p) => p.role === slot.role && !used.has(p.id));
    if (candidate) {
      next[slot.key] = candidate.id;
      used.add(candidate.id);
    }
  }
  state.lineup = next;
  return next;
}

export function autoFillEmptySlot(state, player) {
  if (!state.lineup) state.lineup = createEmptyLineup();
  const starterIds = getStarterIdSet(state);
  if (starterIds.has(player.id)) return false;

  for (const slot of FORMATION_SLOTS_DEF) {
    if (slot.role !== player.role) continue;
    const currentId = state.lineup[slot.key];
    const currentExists = currentId && state.roster.some((p) => p.id === currentId);
    if (!currentExists) {
      state.lineup[slot.key] = player.id;
      return true;
    }
  }
  return false;
}

export function assignSlotPlayer(state, slotKey, playerId) {
  const slot = FORMATION_SLOTS_DEF.find((s) => s.key === slotKey);
  if (!slot) return false;
  if (!state.lineup) state.lineup = createEmptyLineup();

  if (!playerId) {
    state.lineup[slotKey] = null;
    return true;
  }

  const player = state.roster.find((p) => p.id === playerId);
  if (!player || player.role !== slot.role) return false;

  // Se era già in un altro slot (es. ATT1 <-> ATT2), scambia
  for (const other of FORMATION_SLOTS_DEF) {
    if (other.key !== slotKey && state.lineup[other.key] === playerId) {
      state.lineup[other.key] = state.lineup[slotKey] || null;
    }
  }
  state.lineup[slotKey] = playerId;
  return true;
}

export function sellBenchPlayer(state, playerId, stats) {
  const starterIds = getStarterIdSet(state);
  if (starterIds.has(playerId)) return { ok: false, reason: 'Non puoi vendere un titolare' };
  const idx = state.roster.findIndex((p) => p.id === playerId);
  if (idx === -1) return { ok: false };

  const player = state.roster[idx];
  const { cash, tokens } = getBenchSellValue(player, state, stats);
  state.roster.splice(idx, 1);
  addMoney(state, cash);
  if (tokens > 0) addGoldTokens(state, tokens);
  return { ok: true, player, cash, tokens };
}

export function fuseBenchIntoStarter(state, benchId, slotKey) {
  const starterIds = getStarterIdSet(state);
  if (starterIds.has(benchId)) return { ok: false, reason: 'È già un titolare' };
  const benchIdx = state.roster.findIndex((p) => p.id === benchId);
  if (benchIdx === -1) return { ok: false };

  const starterId = state.lineup?.[slotKey];
  const starter = state.roster.find((p) => p.id === starterId);
  const benchPlayer = state.roster[benchIdx];

  if (!canFuseBenchIntoStarter(benchPlayer, starter)) {
    return { ok: false, reason: 'Servono stesso ruolo e rarità almeno pari' };
  }

  starter.stars = (starter.stars || 1) + 1;
  state.roster.splice(benchIdx, 1);
  sortRosterInPlace(state.roster);
  return { ok: true, starter, consumed: benchPlayer };
}

// --- UPGRADE, MILESTONE & STAGIONI ---

export function getUpgradeLevel(state, upgradeId) {
  return (state.upgrades && state.upgrades[upgradeId]) || 0;
}

export function getTotalInfraLevels(state) {
  return Object.values(state.upgrades || {}).reduce((sum, lvl) => sum + (lvl || 0), 0);
}

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
    if (getUpgradeLevel(state, upg.unlockUpgrade.id) < upg.unlockUpgrade.level) return false;
  }
  const hasLeague = upg.unlockLeague === undefined || state.leagueIndex >= upg.unlockLeague;
  const hasCashOr = upg.unlockRunCashOr !== undefined && state.runEarned >= upg.unlockRunCashOr;
  if (upg.unlockLeague !== undefined && upg.unlockRunCashOr !== undefined) {
    if (!hasLeague && !hasCashOr) return false;
  } else if (!hasLeague) {
    return false;
  }
  if (upg.unlockRunCash !== undefined && state.runEarned < upg.unlockRunCash) return false;
  return true;
}

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
  while (k > 0 && getGeometricSeriesCost(baseCost, costMult, currentLevel, k) > money) k -= 1;
  while (k < 500 && getGeometricSeriesCost(baseCost, costMult, currentLevel, k + 1) <= money) k += 1;
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

// Formula doppia v3.5: max(base * 1.55^n, runPeakBaseIncome * K) — immune a boost temporanei e rimozione titolari!
export function getPackCost(state, pack, stats = null) {
  const opened = (state.packPurchases && state.packPurchases[pack.id]) || 0;
  const expCost = Math.floor(pack.baseCost * Math.pow(PACK_COST_GROWTH, opened));
  const curBase = stats ? stats.baseIncomeNoTempBoosts : 0;
  const peakBase = Math.max(state.runPeakBaseIncome || 0, curBase);
  const incomeFloor = Math.floor(peakBase * (pack.incomeSecondsMult || 20));
  return Math.max(expCost, incomeFloor);
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

export function isPolpettaBoostActive(state, now = Date.now()) {
  return (state.polpettaBoostUntil || 0) > now;
}

export function getPolpettaBoostRemainingSec(state, now = Date.now()) {
  return Math.max(0, ((state.polpettaBoostUntil || 0) - now) / 1000);
}

export function isPolpettaReady(state, now = Date.now()) {
  return now >= (state.polpettaCooldownUntil || 0);
}

export function petPolpetta(state, now = Date.now()) {
  if (!isPolpettaReady(state, now)) {
    return { boosted: false, cooldownLeft: Math.ceil((state.polpettaCooldownUntil - now) / 1000) };
  }
  state.polpettaBoostUntil = now + POLPETTA_BOOST_DURATION_MS;
  state.polpettaCooldownUntil = now + POLPETTA_COOLDOWN_MS;
  return { boosted: true, cooldownLeft: 0 };
}

export function getPendingPrestigeShares(state) {
  if ((state.runEarned || 0) < PRESTIGE_UNLOCK_RUN_CASH) return 0;
  return Math.floor(Math.pow(state.runEarned / PRESTIGE_UNLOCK_RUN_CASH, 0.42));
}

export function canPrestige(state) {
  const pending = getPendingPrestigeShares(state);
  return pending >= 1 && (state.leagueIndex >= 2 || (state.runEarned || 0) >= PRESTIGE_UNLOCK_RUN_CASH);
}

// Soglia cassa scalata per Stagione 2+: ×5^(stagione - 1)
export function getLeagueUnlockCash(state, league) {
  const season = Math.max(1, state.seasonNumber || 1);
  return Math.floor(league.unlockCash * Math.pow(5, season - 1));
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
  let squadPowerPct = 0;
  let rawSquadPower = 0;
  let hasPorcotrio = false;
  let hasLoma = false;
  let hasPscon = false;
  let hasVavelocino = false;

  const shares = state.prestigeShares || 0;
  const rosterShareBoost = 1 + shares * 0.02;

  const applyBonus = (type, val) => {
    if (type === 'tapPct') rosterTapPct += val * rosterShareBoost;
    else if (type === 'incomePct') rosterIncomePct += val * rosterShareBoost;
    else if (type === 'critPct') rosterCritPct += val;
    else if (type === 'matchSec') rosterMatchSec += val;
    else if (type === 'squadPowerPct') squadPowerPct += val;
  };

  // SOLO i 5 Titolari schierati applicano bonus, abilità passive e Forza Rosa!
  const starterPlayers = getStarterPlayers(state);
  for (const player of starterPlayers) {
    applyBonus(player.bonusType, getPlayerEffectiveBonus(player));
    if (player.secondaryBonusType) {
      applyBonus(player.secondaryBonusType, getPlayerSecondaryBonus(player));
    }
    rawSquadPower += getPlayerEffectivePower(player);
    if (player.secretId === 'porcotrio') hasPorcotrio = true;
    if (player.secretId === 'loma') hasLoma = true;
    if (player.secretId === 'pscon') hasPscon = true;
    if (player.secretId === 'vavelocino') hasVavelocino = true;
  }

  const squadPower = Math.round(rawSquadPower * (1 + squadPowerPct / 100));
  const prestigeMult = 1 + (shares * research.shareBonusPct) / 100;
  const seasonMult = Math.pow(2, state.seasonStars || 0); // ×2 (+100%) per ogni Stella d'Oro ★!
  const challengeMult = 1 + (state.completedChallenges?.length || 0) * 0.05;
  const leagueMult = league.multiplier;

  const permanentMult = prestigeMult * seasonMult * challengeMult * leagueMult;

  const adBoostMult = isBoostActive(state, now) ? 2 : 1;
  const invBoostMult = isInvasionBoostActive(state, now) ? 3 : 1;
  const polpettaMult = isPolpettaBoostActive(state, now) ? 1.25 : 1;
  const boostMult = adBoostMult * invBoostMult * polpettaMult;
  const globalMult = permanentMult * boostMult;

  const baseIncomeNoTempBoosts = baseIncome * (1 + rosterIncomePct / 100) * permanentMult;
  const tapValue = baseTap * (1 + rosterTapPct / 100) * globalMult;
  const incomePerSec = baseIncomeNoTempBoosts * boostMult;
  const critChance = Math.min(0.68, 0.06 + rosterCritPct / 100);
  const critMultiplier = research.critMultiplier;
  const extraMatchSec = Math.min(4, rosterMatchSec);
  const matchDurationSec = BASE_MATCH_DURATION_SEC + extraMatchSec;
  const infraLevels = getTotalInfraLevels(state);

  return {
    league,
    research,
    starterCount: starterPlayers.length,
    baseTap,
    baseIncome,
    baseIncomeNoTempBoosts,
    rosterTapPct,
    rosterIncomePct,
    rosterCritPct,
    rosterMatchSec: extraMatchSec,
    squadPower,
    infraLevels,
    prestigeMult,
    seasonMult,
    challengeMult,
    leagueMult,
    adBoostMult,
    invBoostMult,
    polpettaMult,
    boostMult,
    tapValue,
    incomePerSec,
    critChance,
    critMultiplier,
    matchDurationSec,
    hasPorcotrio,
    hasLoma,
    hasPscon,
    hasVavelocino,
  };
}

export function syncPeakIncomeTracking(state, stats) {
  if (!stats) return;
  if (stats.baseIncomeNoTempBoosts > (state.runPeakBaseIncome || 0)) {
    state.runPeakBaseIncome = stats.baseIncomeNoTempBoosts;
  }
  if (!state.stats) state.stats = { totalTaps: 0, packsOpened: 0, matchesWon: 0, flashEventsHit: 0, maxIncomePerSec: 0 };
  if (stats.incomePerSec > (state.stats.maxIncomePerSec || 0)) {
    state.stats.maxIncomePerSec = stats.incomePerSec;
  }
}

export function getChecklistStatus(state) {
  const league = LEAGUES[state.leagueIndex] || LEAGUES[0];
  const stats = computeStats(state);

  const cashCur = state.leagueEarned;
  const cashReq = getLeagueUnlockCash(state, league);
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

  // Traccia acquisto upgrade /s per la Sfida "Austerity"
  if (upgrade.incomeAdd > 0) {
    state.boughtIncomeUpgradeThisRun = true;
  }

  if (!state.claimedCareerMilestones) state.claimedCareerMilestones = {};
  const newMilestones = [];
  let tokensAwarded = 0;

  for (const m of MILESTONE_LEVELS) {
    if (oldLevel < m && newLevel >= m) {
      newMilestones.push(m);
      const key = `${upgrade.id}:${m}`;
      if (!state.claimedCareerMilestones[key]) {
        state.claimedCareerMilestones[key] = true;
        tokensAwarded += MILESTONE_TOKEN_REWARDS[m] || 1;
      }
    }
  }
  if (tokensAwarded > 0) addGoldTokens(state, tokensAwarded);

  syncPeakIncomeTracking(state, computeStats(state));

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
  if (state.leagueIndex === LEAGUES.length - 1 && state.seasonCompleted) {
    return false;
  }
  return getChecklistStatus(state).allReady;
}

export function canStartNewSeason(state) {
  return state.leagueIndex === LEAGUES.length - 1 && Boolean(state.seasonCompleted);
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
  if (league.id === 'europa') {
    state.europeanCupWon = true;
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

  // Superlega Galattica vinta -> sblocca Nuova Stagione (★)!
  state.seasonCompleted = true;
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
  if (typeof primary === 'string' && hexRe.test(primary)) state.clubColors.primary = primary;
  if (typeof secondary === 'string' && hexRe.test(secondary)) state.clubColors.secondary = secondary;
}

function _buildPersistentCarry(state) {
  return {
    clubName: state.clubName,
    clubColors: { ...state.clubColors },
    selectedTactic: state.selectedTactic,
    buyMode: state.buyMode || '1x',
    trophies: [...(state.trophies || [])],
    discoveredSecrets: [...(state.discoveredSecrets || [])],
    claimedCareerMilestones: { ...(state.claimedCareerMilestones || {}) },
    completedChallenges: [...(state.completedChallenges || [])],
    cleanSheetStreak: state.cleanSheetStreak || 0,
    research: { ...(state.research || {}) },
    goldTokens: state.goldTokens || 0,
    prestigeCount: state.prestigeCount || 0,
    prestigeShares: state.prestigeShares || 0,
    seasonNumber: state.seasonNumber || 1,
    seasonStars: state.seasonStars || 0,
    europeanCupWon: Boolean(state.europeanCupWon),
    musicEnabled: state.musicEnabled,
    sfxEnabled: state.sfxEnabled,
    tutorialStep: 4,
    stats: { ...state.stats },
    totalEarned: state.totalEarned,
  };
}

export function performPrestige(state) {
  if (!canPrestige(state)) return { ok: false, gainedShares: 0 };

  const gainedShares = getPendingPrestigeShares(state);
  const carry = _buildPersistentCarry(state);
  const nextPrestige = carry.prestigeCount + 1;
  const nextShares = carry.prestigeShares + gainedShares;

  const fresh = createInitialState();
  Object.assign(state, fresh, carry, {
    prestigeCount: nextPrestige,
    prestigeShares: nextShares,
    seasonCompleted: false,
  });
  return { ok: true, gainedShares, totalShares: nextShares };
}

export function startNewSeason(state) {
  if (!canStartNewSeason(state)) return { ok: false };

  const gainedShares = getPendingPrestigeShares(state);
  const bonusTokens = 25;
  const carry = _buildPersistentCarry(state);

  const fresh = createInitialState();
  Object.assign(state, fresh, carry, {
    seasonNumber: carry.seasonNumber + 1,
    seasonStars: carry.seasonStars + 1,
    seasonCompleted: false,
    goldTokens: carry.goldTokens + bonusTokens,
    prestigeShares: carry.prestigeShares + gainedShares,
  });

  return {
    ok: true,
    seasonNumber: state.seasonNumber,
    seasonStars: state.seasonStars,
    gainedShares,
    bonusTokens,
  };
}

export function resetStateInPlace(state) {
  const musicEnabled = state.musicEnabled;
  const sfxEnabled = state.sfxEnabled;
  const fresh = createInitialState();
  Object.assign(state, fresh, { musicEnabled, sfxEnabled });
}
