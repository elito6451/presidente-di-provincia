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
  PRESTIGE_SHARES_EXPONENT,
  PRESTIGE_SOFTCAP_EXPONENT,
  DYNASTY_CASH_GROWTH,
  DYNASTY_POWER_STEP,
  DYNASTY_POWER_CAP,
  DYNASTY_INFRA_STEP,
  DYNASTY_DIFF_STEP,
  DYNASTY_DIFF_CAP,
  DYNASTY_INCOME_BONUS_PER_LVL,
  DYNASTY_MILESTONE_TOKENS,
  MILESTONE_LEVELS,
  MILESTONE_TOKEN_REWARDS,
  MASTERY_TIERS,
  LEAGUE_MASTERY_GOALS,
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
import { getChallengePerks } from './challenges.js';
import { getRelicEffects } from './expeditions.js';

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
    careerPrestigePeakEarned: 0, // v4.5: record di carriera per impedire micro-prestige farming
    totalEarned: 0,
    leagueIndex: 0,
    dynastyLevel: 0, // v4.5: Superlega Dinastia Infinita (0 = prima vittoria, 1, 2, 3... ∞)
    claimedDynastyMilestones: {},
    europeanCupWon: false,
    upgrades: {},
    roster: [],
    lineup: createEmptyLineup(),
    discoveredSecrets: [],
    claimedCareerMilestones: {},
    claimedCareerPromotions: [], // v4.5: 1 volta per categoria in carriera
    masteryTrophies: {},         // v4.5: 28 Trofei di Maestria ("leagueId:tier": true)
    relicInventory: [],          // v4.5: Cimeli trovati dalle Spedizioni (permanenti al Prestige)
    equippedRelics: [null, null, null], // 3 slot attivi (1 per tipo)
    activeExpedition: null,      // { id, startedAt, endsAt }
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
    apeBoostUntil: 0,       // v4.5: Ape Car Sponsor Agricolo ×2,5
    smokeTapBoostUntil: 0,  // v4.5: Nebbia Fumogeni Entusiasmo Curva ×3 tap
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
  // v4.5: Milestone ×2 infinite anche oltre Lv.100 (ogni +50 livelli: 150, 200, 250..., 0 🪙!)
  if (level >= 150) {
    const extra = Math.floor((level - 100) / 50);
    mult *= Math.pow(2, extra);
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
  // Oltre Lv.100: prossima milestone ogni +50 livelli (150, 200, 250...)
  const prevStep = Math.floor(level / 50) * 50;
  const nextStep = prevStep + 50;
  return {
    next: nextStep,
    prev: prevStep,
    pct: Math.min(100, Math.max(0, ((level - prevStep) / 50) * 100)),
    mult: getUpgradeMilestoneMult(level),
    allDone: false,
  };
}

// v4.5: Sblocco rigorosamente legato alla Categoria (rimossa ogni scorciatoia OR €!)
export function isUpgradeUnlocked(state, upg) {
  if (upg.unlockLeague !== undefined && (state.leagueIndex || 0) < upg.unlockLeague) {
    return false;
  }
  if (getUpgradeLevel(state, upg.id) > 0) return true;
  if (upg.unlockUpgrade) {
    if (getUpgradeLevel(state, upg.unlockUpgrade.id) < upg.unlockUpgrade.level) return false;
  }
  if (upg.unlockRunCash !== undefined && (state.runEarned || 0) < upg.unlockRunCash) return false;
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

// Formula doppia v4.5: max(base * 1.50^n, runPeakBaseIncome * K) con sconti Procuratori + Solo Giovani + Valigetta!
export function getPackCost(state, pack, stats = null) {
  const opened = (state.packPurchases && state.packPurchases[pack.id]) || 0;
  const expCost = pack.baseCost * Math.pow(PACK_COST_GROWTH, opened);
  const curBase = stats ? stats.baseIncomeNoTempBoosts : 0;
  const peakBase = Math.max(state.runPeakBaseIncome || 0, curBase);
  const incomeFloor = peakBase * (pack.incomeSecondsMult || 18);
  const rawCost = Math.max(expCost, incomeFloor);

  const research = stats?.research || getResearchEffects(state);
  const perks = stats?.challengePerks || getChallengePerks(state, research.challengePerkMult);
  const relicFx = stats?.relicEffects || getRelicEffects(state);
  const challengeDiscount = Math.max(0.75, 1 - (perks.packDiscountPct || 0) / 100);
  const relicDiscount = Math.max(0.70, 1 - (relicFx.packDiscountPct || 0) / 100);
  const discountMult = (research.packCostMult || 1) * challengeDiscount * relicDiscount;
  return Math.max(50, Math.floor(rawCost * discountMult));
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

export function isApeBoostActive(state, now = Date.now()) {
  return (state.apeBoostUntil || 0) > now;
}

export function getApeBoostRemainingSec(state, now = Date.now()) {
  return Math.max(0, ((state.apeBoostUntil || 0) - now) / 1000);
}

export function isSmokeTapBoostActive(state, now = Date.now()) {
  return (state.smokeTapBoostUntil || 0) > now;
}

export function getSmokeTapBoostRemainingSec(state, now = Date.now()) {
  return Math.max(0, ((state.smokeTapBoostUntil || 0) - now) / 1000);
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
  const relicFx = getRelicEffects(state);
  const cdMs = relicFx.polpettaCooldownMs || POLPETTA_COOLDOWN_MS;
  state.polpettaBoostUntil = now + POLPETTA_BOOST_DURATION_MS;
  state.polpettaCooldownUntil = now + cdMs;
  return { boosted: true, cooldownLeft: 0, mult: relicFx.polpettaMult || 1.25 };
}

// v4.5: Calcolo Azioni Prestige legato al record di carriera (zero micro-prestige farming!)
export function rawSharesForEarned(earned) {
  if (!Number.isFinite(earned) || earned < PRESTIGE_UNLOCK_RUN_CASH) return 0;
  return Math.floor(Math.pow(earned / PRESTIGE_UNLOCK_RUN_CASH, PRESTIGE_SHARES_EXPONENT));
}

export function getEffectivePrestigeShares(shares) {
  if (!Number.isFinite(shares) || shares <= 0) return 0;
  return Math.pow(shares, PRESTIGE_SOFTCAP_EXPONENT);
}

export function getPendingPrestigeShares(state) {
  const curShares = rawSharesForEarned(state.runEarned || 0);
  const peakShares = rawSharesForEarned(state.careerPrestigePeakEarned || 0);
  return Math.max(0, curShares - peakShares);
}

export function canPrestige(state) {
  const pending = getPendingPrestigeShares(state);
  return pending >= 1 && (state.leagueIndex >= 2 || (state.runEarned || 0) >= PRESTIGE_UNLOCK_RUN_CASH);
}

// --- DINASTIA INFINITA & MAESTRIA 28 TROFEI ---

export function getLeagueUnlockCash(state, league) {
  if (league.index === LEAGUES.length - 1) {
    const d = Math.max(0, state.dynastyLevel || 0);
    return Math.floor(league.unlockCash * Math.pow(DYNASTY_CASH_GROWTH, d));
  }
  return league.unlockCash;
}

export function getLeagueMinSquadPower(state, league) {
  if (league.index === LEAGUES.length - 1) {
    const d = Math.max(0, state.dynastyLevel || 0);
    return Math.min(DYNASTY_POWER_CAP, league.minSquadPower + d * DYNASTY_POWER_STEP);
  }
  return league.minSquadPower;
}

export function getLeagueMinInfraLevels(state, league) {
  if (league.index === LEAGUES.length - 1) {
    const d = Math.max(0, state.dynastyLevel || 0);
    return league.minInfraLevels + d * DYNASTY_INFRA_STEP;
  }
  return league.minInfraLevels;
}

export function getDynastyDifficultyMult(state) {
  if ((state.leagueIndex || 0) < LEAGUES.length - 1) return 1.0;
  const d = Math.max(0, state.dynastyLevel || 0);
  return Math.max(1 - DYNASTY_DIFF_CAP, 1 - d * DYNASTY_DIFF_STEP);
}

export function getMasteryBonuses(state) {
  let incomePct = 0;
  let tapPct = 0;
  let count = 0;
  const map = state.masteryTrophies || {};
  for (const lg of LEAGUES) {
    const goals = LEAGUE_MASTERY_GOALS[lg.id];
    if (!goals) continue;
    for (const tier of MASTERY_TIERS) {
      if (map[`${lg.id}:${tier.id}`]) {
        count += 1;
        incomePct += tier.incomePct;
        const g = goals[tier.id];
        if (g && g.extraTapPct) tapPct += g.extraTapPct;
      }
    }
  }
  return { incomePct, tapPct, count, total: LEAGUES.length * MASTERY_TIERS.length };
}

export function getCurrentLeagueNextMastery(state) {
  const lg = LEAGUES[state.leagueIndex] || LEAGUES[0];
  const goals = LEAGUE_MASTERY_GOALS[lg.id];
  if (!goals) return null;
  const map = state.masteryTrophies || {};
  const infraCur = getTotalInfraLevels(state);
  const cashCur = state.leagueEarned || 0;
  for (const tier of MASTERY_TIERS) {
    const key = `${lg.id}:${tier.id}`;
    if (!map[key]) {
      const req = goals[tier.id];
      return {
        league: lg,
        tier,
        req,
        infraCur,
        cashCur,
        infraPct: Math.min(100, (infraCur / Math.max(1, req.infra)) * 100),
        cashPct: Math.min(100, (cashCur / Math.max(1, req.cash)) * 100),
        tokens: req.tokensOverride !== undefined ? req.tokensOverride : tier.tokens,
      };
    }
  }
  return { league: lg, allDone: true };
}

export function evaluateMasteryTrophies(state) {
  const lg = LEAGUES[state.leagueIndex];
  if (!lg) return [];
  const goals = LEAGUE_MASTERY_GOALS[lg.id];
  if (!goals) return [];
  if (!state.masteryTrophies) state.masteryTrophies = {};

  const infraCur = getTotalInfraLevels(state);
  const cashCur = state.leagueEarned || 0;
  const newly = [];

  for (const tier of MASTERY_TIERS) {
    const key = `${lg.id}:${tier.id}`;
    if (state.masteryTrophies[key]) continue;
    const req = goals[tier.id];
    if (req && infraCur >= req.infra && cashCur >= req.cash) {
      state.masteryTrophies[key] = true;
      const tokens = req.tokensOverride !== undefined ? req.tokensOverride : tier.tokens;
      if (tokens > 0) addGoldTokens(state, tokens);
      newly.push({ league: lg, tier, req, tokens });
    }
  }
  return newly;
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
  const effectiveShares = getEffectivePrestigeShares(shares); // v4.5: softcap 0,58 anche su rosterShareBoost!
  const rosterShareBoost = 1 + effectiveShares * 0.02;

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

  const challengePerks = getChallengePerks(state, research.challengePerkMult);
  const masteryBonuses = getMasteryBonuses(state);
  const relicEffects = getRelicEffects(state);

  const totalSquadPowerPct =
    squadPowerPct + (challengePerks.squadPowerPct || 0) + (relicEffects.squadPowerPct || 0);
  const squadPower = Math.round(
    rawSquadPower * (1 + totalSquadPowerPct / 100) * (research.squadPowerMult || 1)
  );

  // Softcap 0,58 sul moltiplicatore Prestige + Dinastia additiva (+20%/liv) + Maestria + Cimeli!
  const prestigeMult = 1 + (effectiveShares * research.shareBonusPct) / 100;
  const dynastyMult = 1 + (state.dynastyLevel || 0) * DYNASTY_INCOME_BONUS_PER_LVL;
  const masteryIncomeMult = 1 + (masteryBonuses.incomePct || 0) / 100;
  const masteryTapMult = 1 + (masteryBonuses.tapPct || 0) / 100;
  const relicIncomeMult = 1 + (relicEffects.incomePct || 0) / 100;
  const relicTapMult = 1 + (relicEffects.tapPct || 0) / 100;
  const challengeIncomeMult = 1 + (challengePerks.globalIncomePct || 0) / 100;
  const challengeTapMult = 1 + (challengePerks.tapPct || 0) / 100;
  const marketingMult = research.globalIncomeMult || 1;
  const leagueMult = league.multiplier;

  const permanentMult =
    prestigeMult *
    dynastyMult *
    masteryIncomeMult *
    challengeIncomeMult *
    marketingMult *
    leagueMult;

  const adBoostMult = isBoostActive(state, now) ? 2 : 1;
  const invBoostMult = isInvasionBoostActive(state, now) ? 3 : 1;
  const apeBoostMult = isApeBoostActive(state, now) ? 2.5 : 1;
  const smokeTapMult = isSmokeTapBoostActive(state, now) ? 3 : 1;
  const polpettaMult = isPolpettaBoostActive(state, now) ? (relicEffects.polpettaMult || 1.25) : 1;
  const boostMult = adBoostMult * invBoostMult * apeBoostMult * polpettaMult;
  const globalMult = permanentMult * boostMult;

  const baseIncomeNoTempBoosts =
    baseIncome * (1 + rosterIncomePct / 100) * relicIncomeMult * permanentMult;
  const tapValue =
    baseTap *
    (1 + rosterTapPct / 100) *
    challengeTapMult *
    masteryTapMult *
    relicTapMult *
    smokeTapMult *
    globalMult;
  const incomePerSec = baseIncomeNoTempBoosts * boostMult;
  const critChance = Math.min(0.68, 0.06 + rosterCritPct / 100);
  const critMultiplier = research.critMultiplier;
  const extraMatchSec = Math.min(4, rosterMatchSec);
  const matchDurationSec = BASE_MATCH_DURATION_SEC + extraMatchSec;
  const infraLevels = getTotalInfraLevels(state);

  return {
    league,
    research,
    challengePerks,
    masteryBonuses,
    relicEffects,
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
    effectiveShares,
    prestigeMult,
    dynastyMult,
    masteryIncomeMult,
    relicIncomeMult,
    challengeMult: challengeIncomeMult,
    challengeTapMult,
    marketingMult,
    leagueMult,
    adBoostMult,
    invBoostMult,
    apeBoostMult,
    smokeTapMult,
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
  const squadReq = getLeagueMinSquadPower(state, league);
  const squadOk = squadCur >= squadReq;

  const infraCur = stats.infraLevels;
  const infraReq = getLeagueMinInfraLevels(state, league);
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
      const rewardTok = MILESTONE_TOKEN_REWARDS[m] || 0;
      const key = `${upgrade.id}:${m}`;
      if (rewardTok > 0 && !state.claimedCareerMilestones[key]) {
        state.claimedCareerMilestones[key] = true;
        tokensAwarded += rewardTok;
      }
    }
  }
  // v4.5: Milestone ×2 ogni +50 livelli oltre Lv.100 (150, 200, 250...) con 0 🪙
  if (newLevel >= 150) {
    const startStep = Math.max(150, (Math.floor(oldLevel / 50) + 1) * 50);
    for (let m = startStep; m <= newLevel; m += 50) {
      newMilestones.push(m);
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

export function activateApeBoost(state, durationMs = 20000) {
  const now = Date.now();
  const base = (state.apeBoostUntil || 0) > now ? state.apeBoostUntil : now;
  state.apeBoostUntil = Math.min(now + durationMs * 2, base + durationMs);
}

export function activateSmokeTapBoost(state, durationMs = 15000) {
  const now = Date.now();
  const base = (state.smokeTapBoostUntil || 0) > now ? state.smokeTapBoostUntil : now;
  state.smokeTapBoostUntil = Math.min(now + durationMs * 2, base + durationMs);
}

export function canStartSpareggio(state) {
  const league = LEAGUES[state.leagueIndex];
  if (!league) return false;
  return getChecklistStatus(state).allReady;
}

export function awardLeagueVictory(state) {
  const { league, stageIdx, totalRounds, rounds } = getCurrentMatchRound(state);
  if (!league) return { promoted: false, finalCup: false, semifinalWon: false, tokensAwarded: 0 };

  state.stats.matchesWon += 1;

  if (totalRounds > 1 && stageIdx < totalRounds - 1) {
    state.playoffStage = stageIdx + 1;
    return {
      promoted: false,
      finalCup: false,
      semifinalWon: true,
      nextRound: rounds[state.playoffStage],
      newLeague: league,
      trophyName: null,
      tokensAwarded: 0,
    };
  }

  // v4.5: Gettoni promozione 1 sola volta in carriera per categoria
  if (!Array.isArray(state.claimedCareerPromotions)) state.claimedCareerPromotions = [];
  let promoTokens = 0;
  if (!state.claimedCareerPromotions.includes(league.id)) {
    state.claimedCareerPromotions.push(league.id);
    promoTokens = league.promotionTokens || 4;
    addGoldTokens(state, promoTokens);
  }

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

  // v4.5: SUPERLEGA DINASTIA INFINITA (NO RESET!) — resti in Superlega e sali di Dinastia Lv.!
  state.dynastyLevel = (state.dynastyLevel || 0) + 1;
  state.playoffStage = 0;
  state.leagueEarned = 0;

  if (!state.claimedDynastyMilestones) state.claimedDynastyMilestones = {};
  let dynastyTokens = 0;
  const d = state.dynastyLevel;
  const mTok = DYNASTY_MILESTONE_TOKENS[d] || (d >= 20 && d % 5 === 0 ? 25 : 0);
  if (mTok > 0 && !state.claimedDynastyMilestones[String(d)]) {
    state.claimedDynastyMilestones[String(d)] = true;
    dynastyTokens = mTok;
    addGoldTokens(state, dynastyTokens);
  }

  return {
    promoted: false,
    finalCup: true,
    semifinalWon: false,
    dynastyLevel: state.dynastyLevel,
    newLeague: league,
    trophyName: league.trophyName,
    tokensAwarded: promoTokens + dynastyTokens,
    dynastyTokens,
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
    claimedCareerPromotions: [...(state.claimedCareerPromotions || [])],
    claimedDynastyMilestones: { ...(state.claimedDynastyMilestones || {}) },
    masteryTrophies: { ...(state.masteryTrophies || {}) },
    relicInventory: (state.relicInventory || []).map((r) => ({ ...r })),
    equippedRelics: [...(state.equippedRelics || [null, null, null])],
    activeExpedition: state.activeExpedition ? { ...state.activeExpedition } : null,
    completedChallenges: [...(state.completedChallenges || [])],
    cleanSheetStreak: state.cleanSheetStreak || 0,
    research: { ...(state.research || {}) },
    goldTokens: state.goldTokens || 0,
    prestigeCount: state.prestigeCount || 0,
    prestigeShares: state.prestigeShares || 0,
    careerPrestigePeakEarned: Math.max(state.careerPrestigePeakEarned || 0, state.runEarned || 0),
    dynastyLevel: state.dynastyLevel || 0,
    europeanCupWon: Boolean(state.europeanCupWon),
    musicEnabled: state.musicEnabled,
    sfxEnabled: state.sfxEnabled,
    tutorialStep: 6,
    stats: { ...state.stats },
    totalEarned: state.totalEarned,
  };
}

// Applica Eredità del Club post-Prestige: SOLO cassa iniziale + livelli Tap (mai upgrade /s, 100% compatibile con Austerity!)
function _applyClubLegacyStart(state) {
  const { legacyLevel } = getResearchEffects(state);
  if (!legacyLevel || legacyLevel <= 0) return;

  const startCash = Math.floor(500 * Math.pow(4, legacyLevel - 1));
  state.money = startCash;
  state.leagueEarned = startCash;
  state.runEarned = startCash;
  state.upgrades.righe_gesso = legacyLevel * 2;
  if (legacyLevel >= 3) {
    state.upgrades.scarpini_tacchetti = legacyLevel;
  }
  state.boughtIncomeUpgradeThisRun = false;
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
  });
  _applyClubLegacyStart(state);
  return { ok: true, gainedShares, totalShares: nextShares };
}

export function resetStateInPlace(state) {
  const musicEnabled = state.musicEnabled;
  const sfxEnabled = state.sfxEnabled;
  const fresh = createInitialState();
  Object.assign(state, fresh, { musicEnabled, sfxEnabled });
}
