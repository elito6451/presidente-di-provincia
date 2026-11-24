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

export function generateProceduralPlayer(rarityId) {
  const rarity = RARITIES[rarityId] || RARITIES.comune;
  const role = pickRandom(ROLES);
  const bonusDef = pickRandom(BONUS_TYPES);

  const firstName = pickRandom(FIRST_NAMES);
  const nickname = pickRandom(NICKNAMES);
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
  // Se manca 1 segreto su 2, leggera priorità (65%) a pescare quello mancante
  if (unowned.length === 1 && Math.random() < 0.65) {
    return unowned[0];
  }
  return pickRandom(SECRET_PLAYERS);
}

/**
 * Apre una busta (a pagamento o gratis) e gestisce:
 * - tiro segreto Easter Egg (0.2% / 0.8% / 2.2%) prima dei pesi normali
 * - costo scalare (base * 1.12^n) solo per gli acquisti pagati
 * - fusione automatica duplicati fino a 5★ + rimborso cassa oltre 5★
 * - registrazione permanente in state.discoveredSecrets
 */
export function openPack(state, packId, { getPackCostFn, stats }) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) return { ok: false, reason: 'Busta non trovata' };

  const freeCount = (state.freePacks && state.freePacks[pack.id]) || 0;
  const paidCost = getPackCostFn(state, pack);
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
  const { scoutLuckMult } = getResearchEffects(state);

  // 1. Tiro Easter Egg Segreto (potenziato dalla ricerca Osservatore Esperto)
  const effectiveSecretChance = (pack.secretChance || 0) * scoutLuckMult;
  if (effectiveSecretChance > 0 && Math.random() < effectiveSecretChance) {
    const secretTpl = pickSecretCandidate(state);
    pulled = createSecretPlayerInstance(secretTpl.secretId);
    existing = state.roster.find((p) => p.secretId === secretTpl.secretId) || null;
    if (!state.discoveredSecrets) state.discoveredSecrets = [];
    if (!state.discoveredSecrets.includes(secretTpl.secretId)) {
      state.discoveredSecrets.push(secretTpl.secretId);
    }
  } else {
    // 2. Tiro procedurale normale (Epico & Leggenda potenziati da Osservatore Esperto)
    const boostedWeights = {
      comune: pack.weights.comune,
      raro: pack.weights.raro,
      epico: pack.weights.epico * scoutLuckMult,
      leggenda: pack.weights.leggenda * scoutLuckMult,
    };
    const rarityId = rollRarity(boostedWeights);
    const sameRarityOwned = state.roster.filter(
      (p) => p.rarity === rarityId && !p.secretId
    );

    if (sameRarityOwned.length > 0 && Math.random() < 0.28) {
      existing = pickRandom(sameRarityOwned);
      pulled = { ...existing };
    } else {
      pulled = generateProceduralPlayer(rarityId);
      existing = state.roster.find(
        (p) => p.name === pulled.name && p.role === pulled.role
      );
    }
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
        Math.floor((stats?.incomePerSec || 0) * 12),
        250
      );
      refundAmount = baseRefund;
      state.money += refundAmount;
      state.leagueEarned += refundAmount;
      state.totalEarned += refundAmount;
    }
  } else {
    state.roster.push(pulled);
    resultPlayer = pulled;
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

export function getTopFivePlayers(roster) {
  if (!roster || roster.length === 0) return [];
  return [...roster]
    .sort((a, b) => getPlayerEffectivePower(b) - getPlayerEffectivePower(a))
    .slice(0, 5);
}
