import {
  RARITIES,
  PACKS,
  ROLES,
  BONUS_TYPES,
  FIRST_NAMES,
  NICKNAMES,
  LAST_NAMES,
  MAX_PLAYER_STARS,
  SECRET_PLAYERS,
} from './config.js';
import { getResearchEffects } from './research.js';

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function extractNickname(name = '') {
  const m = String(name).match(/"([^"]+)"/);
  return m ? m[1] : '';
}

export function rollRarity(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [rarityId, weight] of entries) {
    r -= weight;
    if (r <= 0) return rarityId;
  }
  return 'comune';
}

export function getStarMultiplier(stars) {
  return 1 + (Math.max(1, stars) - 1) * 0.25;
}

export function getPlayerEffectiveBonus(player) {
  const raw = player.bonusValue * getStarMultiplier(player.stars || 1);
  return Math.round(raw * 10) / 10;
}

export function getPlayerSecondaryBonus(player) {
  if (!player.secondaryBonusType || !player.secondaryBonusValue) return 0;
  const raw = player.secondaryBonusValue * getStarMultiplier(player.stars || 1);
  return Math.round(raw * 10) / 10;
}

export function getPlayerEffectivePower(player) {
  return Math.round(player.power * getStarMultiplier(player.stars || 1));
}

function formatSingleBonus(type, val) {
  const valStr = Number.isInteger(val) ? String(val) : val.toFixed(1).replace('.', ',');
  switch (type) {
    case 'tapPct':
      return `+${valStr}% Tap`;
    case 'incomePct':
      return `+${valStr}% Incassi`;
    case 'critPct':
      return `+${valStr}% Critico`;
    case 'matchSec':
      return `+${valStr}s Spareggio`;
    case 'squadPowerPct':
      return `+${valStr}% Forza Rosa`;
    default:
      return `+${valStr}`;
  }
}

export function formatPlayerBonus(player) {
  const main = formatSingleBonus(player.bonusType, getPlayerEffectiveBonus(player));
  if (player.secondaryBonusType && player.secondaryBonusValue) {
    const sec = formatSingleBonus(
      player.secondaryBonusType,
      getPlayerSecondaryBonus(player)
    );
    return `${main} • ${sec}`;
  }
  return main;
}

export function getSecretTemplate(secretId) {
  return SECRET_PLAYERS.find((s) => s.secretId === secretId) || null;
}

export function createSecretPlayerInstance(secretId) {
  const tpl = getSecretTemplate(secretId);
  if (!tpl) return null;
  return { ...tpl, stars: 1 };
}

// Generazione procedurale con controllo rigido anti-duplicato soprannomi nella rosa attuale
export function generateProceduralPlayer(rarityId, existingRoster = []) {
  const rarity = RARITIES[rarityId] || RARITIES.comune;
  const role = pickRandom(ROLES);
  const bonusDef = pickRandom(BONUS_TYPES);

  const usedNicks = new Set();
  for (const p of existingRoster) {
    const nick = p.nickname || extractNickname(p.name);
    if (nick) usedNicks.add(nick);
  }
  const availableNicks = NICKNAMES.filter((n) => !usedNicks.has(n));
  const nickname =
    availableNicks.length > 0 ? pickRandom(availableNicks) : pickRandom(NICKNAMES);

  const firstName = pickRandom(FIRST_NAMES);
  const lastName = pickRandom(LAST_NAMES);
  const fullName = `${firstName} "${nickname}" ${lastName}`;

  const variance = 0.88 + Math.random() * 0.28;
  const bonusValue =
    Math.round(bonusDef.baseValue * rarity.bonusMult * variance * 10) / 10;
  const power = Math.round(rarity.powerBase * variance);
  const jerseyNumber =
    role.code === 'POR'
      ? pickRandom([1, 12, 22, 88, 99])
      : Math.floor(2 + Math.random() * 97);

  return {
    id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: fullName,
    nickname,
    shortName: lastName,
    role: role.code,
    jerseyColor: role.jerseyColor,
    jerseyNumber,
    rarity: rarity.id,
    stars: 1,
    bonusType: bonusDef.id,
    bonusValue,
    power,
  };
}

function pickSecretCandidate(state) {
  const ownedIds = new Set(
    state.roster.filter((p) => p.secretId).map((p) => p.secretId)
  );
  const unowned = SECRET_PLAYERS.filter((s) => !ownedIds.has(s.secretId));
  if (unowned.length > 0 && unowned.length < SECRET_PLAYERS.length && Math.random() < 0.72) {
    return pickRandom(unowned);
  }
  return pickRandom(SECRET_PLAYERS);
}

// Calcola valore di vendita di un giocatore in panchina (+1 🪙 per Epici, Leggende e Segreti!)
export function getBenchSellValue(player, state, stats) {
  const rar = RARITIES[player.rarity] || RARITIES.comune;
  const stars = player.stars || 1;
  const mults = { comune: 6, raro: 16, epico: 38, leggenda: 80, segreto: 140 };
  const baseFloor = { comune: 60, raro: 350, epico: 2800, leggenda: 25000, segreto: 65000 };
  const baseIncome = Math.max(stats?.baseIncomeNoTempBoosts || 0, state?.runPeakBaseIncome || 0);
  const cash = Math.floor(
    Math.max(baseFloor[rar.id] || 60, baseIncome * (mults[rar.id] || 6)) * (0.7 + stars * 0.3)
  );
  const tokens = rar.rank >= 3 ? 1 : 0; // +1 🪙 per Epici, Leggende e Segreti
  return { cash, tokens };
}

// Regola anti-exploit fusione panchina -> titolare: stesso ruolo, < 5★, rarità >= titolare (o stesso segreto)
export function canFuseBenchIntoStarter(benchPlayer, starterPlayer) {
  if (!benchPlayer || !starterPlayer) return false;
  if (benchPlayer.id === starterPlayer.id) return false;
  if (benchPlayer.role !== starterPlayer.role) return false;
  if ((starterPlayer.stars || 1) >= MAX_PLAYER_STARS) return false;
  if (benchPlayer.secretId && benchPlayer.secretId === starterPlayer.secretId) return true;
  const bRank = RARITIES[benchPlayer.rarity]?.rank || 1;
  const sRank = RARITIES[starterPlayer.rarity]?.rank || 1;
  return bRank >= sRank;
}

/**
 * Apre una busta Scouting:
 * - costo doppia formula gestito da getPackCostFn(state, pack, stats)
 * - drop Segreti 0.05% / 0.15% / 0.50% con scaling ridotto (+6%/liv)
 * - i nuovi giocatori vanno in rosa (e vengono auto-schierati solo se lo slot ruolo è vuoto!)
 */
export function openPack(state, packId, { getPackCostFn, stats, autoFillEmptySlotFn }) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: 'Busta non trovata' };

  const freeCount = (state.freePacks && state.freePacks[pack.id]) || 0;
  const paidCost = getPackCostFn(state, pack, stats);
  const isFree = freeCount > 0;

  if (!isFree && state.money < paidCost) {
    return { ok: false, reason: 'Fondi insufficienti' };
  }

  if (isFree) {
    state.freePacks[pack.id] = freeCount - 1;
  } else {
    state.money -= paidCost;
    state.packPurchases[pack.id] = (state.packPurchases[pack.id] || 0) + 1;
  }

  let pulled = null;
  let existing = null;
  const { scoutLuckMult, secretLuckMult } = getResearchEffects(state);

  // 1. Tiro Easter Egg Segreto (0.05% / 0.15% / 0.50% * secretLuckMult)
  const effectiveSecretChance = (pack.secretChance || 0) * secretLuckMult;
  if (effectiveSecretChance > 0 && Math.random() < effectiveSecretChance) {
    const secretTpl = pickSecretCandidate(state);
    pulled = createSecretPlayerInstance(secretTpl.secretId);
    existing = state.roster.find((p) => p.secretId === secretTpl.secretId) || null;
    if (!state.discoveredSecrets) state.discoveredSecrets = [];
    if (!state.discoveredSecrets.includes(secretTpl.secretId)) {
      state.discoveredSecrets.push(secretTpl.secretId);
    }
  } else {
    // 2. Tiro procedurale normale (anti-duplicato soprannome!)
    const boostedWeights = {
      comune: pack.weights.comune,
      raro: pack.weights.raro,
      epico: pack.weights.epico * scoutLuckMult,
      leggenda: pack.weights.leggenda * scoutLuckMult,
    };
    const rarityId = rollRarity(boostedWeights);
    pulled = generateProceduralPlayer(rarityId, state.roster);
    existing = state.roster.find(
      (p) => p.name === pulled.name && p.role === pulled.role
    );
  }

  let outcome = 'new'; // 'new' | 'fused' | 'maxed_refund'
  let refundAmount = 0;
  let resultPlayer = pulled;

  if (existing) {
    if ((existing.stars || 1) < MAX_PLAYER_STARS) {
      existing.stars = (existing.stars || 1) + 1;
      outcome = 'fused';
      resultPlayer = existing;
    } else {
      outcome = 'maxed_refund';
      resultPlayer = existing;
      const baseRefund = Math.max(
        Math.floor(paidCost * 0.65),
        Math.floor((stats?.baseIncomeNoTempBoosts || 0) * 12),
        250
      );
      refundAmount = baseRefund;
      state.money += refundAmount;
      state.leagueEarned += refundAmount;
      state.runEarned = (state.runEarned || 0) + refundAmount;
      state.totalEarned += refundAmount;
    }
  } else {
    state.roster.push(pulled);
    resultPlayer = pulled;
    if (autoFillEmptySlotFn) {
      autoFillEmptySlotFn(state, pulled);
    }
  }

  sortRosterInPlace(state.roster);
  state.stats.packsOpened += 1;

  return {
    ok: true,
    pack,
    isFree,
    paidCost: isFree ? 0 : paidCost,
    player: resultPlayer,
    outcome,
    refundAmount,
  };
}

export function sortRosterInPlace(roster) {
  roster.sort((a, b) => {
    const pa = getPlayerEffectivePower(a);
    const pb = getPlayerEffectivePower(b);
    if (pb !== pa) return pb - pa;
    const ra = RARITIES[a.rarity]?.rank || 0;
    const rb = RARITIES[b.rarity]?.rank || 0;
    return rb - ra;
  });
}
