import {
  SAVE_KEY,
  SAVE_VERSION,
  OFFLINE_MIN_SECONDS,
  LEAGUES,
  MAX_PLAYER_STARS,
  DEFAULT_CLUB_NAME,
  DEFAULT_CLUB_COLORS,
  TACTICS,
  SECRET_PLAYERS,
  MILESTONE_LEVELS,
  FORMATION_SLOTS_DEF,
  PRESTIGE_UNLOCK_RUN_CASH,
  PRESTIGE_SHARES_EXPONENT,
  MASTERY_TIERS,
} from './config.js';
import {
  createInitialState,
  createEmptyLineup,
  autoAssignLineup,
  computeStats,
} from './state.js';
import { encodeBase64UTF8, decodeBase64UTF8 } from './format.js';
import { sortRosterInPlace, getSecretTemplate, extractNickname } from './gacha.js';
import { PERMANENT_RESEARCHES, getResearchEffects } from './research.js';
import { PRESIDENT_CHALLENGES } from './challenges.js';
import {
  RELIC_BY_ID,
  RELIC_RARITIES,
  EXPEDITION_DEFS,
  getRelicEffects,
} from './expeditions.js';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_SECRET_IDS = new Set(SECRET_PLAYERS.map((s) => s.secretId));
const VALID_BUY_MODES = new Set(['1x', '10x', '100x', 'MAX']);
const VALID_CHALLENGES = new Set(PRESIDENT_CHALLENGES.map((c) => c.id));

function sanitizeNumber(val, fallback = 0, min = 0) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

/**
 * Migrazione 100% retrocompatibile v1 / v2 / v2.5 / v3.0.1 -> v3.5 (SAVE_VERSION 5).
 */
export function sanitizeState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;

  const isPreV3 = !raw.version || raw.version < 4;
  const leagueIndex = Math.min(
    LEAGUES.length - 1,
    Math.floor(sanitizeNumber(raw.leagueIndex, 0, 0))
  );
  const maxStage = Math.max(0, (LEAGUES[leagueIndex]?.rounds?.length || 1) - 1);

  const clubName =
    typeof raw.clubName === 'string' && raw.clubName.trim().length > 0
      ? raw.clubName.trim().replace(/\s+/g, ' ').slice(0, 22)
      : DEFAULT_CLUB_NAME;

  const primary =
    typeof raw.clubColors?.primary === 'string' && HEX_COLOR_RE.test(raw.clubColors.primary)
      ? raw.clubColors.primary
      : DEFAULT_CLUB_COLORS.primary;
  const secondary =
    typeof raw.clubColors?.secondary === 'string' && HEX_COLOR_RE.test(raw.clubColors.secondary)
      ? raw.clubColors.secondary
      : DEFAULT_CLUB_COLORS.secondary;

  const selectedTactic =
    typeof raw.selectedTactic === 'string' && TACTICS[raw.selectedTactic]
      ? raw.selectedTactic
      : 'contropiede';

  const discoveredSet = new Set(
    Array.isArray(raw.discoveredSecrets)
      ? raw.discoveredSecrets.filter((id) => VALID_SECRET_IDS.has(id))
      : []
  );

  const trophies = Array.isArray(raw.trophies)
    ? raw.trophies.filter((t) => typeof t === 'string')
    : [];

  const prestigeCount = Math.floor(sanitizeNumber(raw.prestigeCount, 0, 0));

  let prestigeShares = Math.floor(sanitizeNumber(raw.prestigeShares, 0, 0));
  if (isPreV3 && prestigeShares === 0 && prestigeCount > 0) {
    prestigeShares = prestigeCount * 8;
  }

  let goldTokens = Math.floor(sanitizeNumber(raw.goldTokens, 0, 0));
  if (isPreV3 && raw.goldTokens === undefined) {
    goldTokens = trophies.length * 4 + prestigeCount * 10;
  }

  const legacyAudio = raw.audioEnabled !== undefined ? Boolean(raw.audioEnabled) : true;
  const musicEnabled = raw.musicEnabled !== undefined ? Boolean(raw.musicEnabled) : legacyAudio;
  const sfxEnabled = raw.sfxEnabled !== undefined ? Boolean(raw.sfxEnabled) : legacyAudio;

  const totalTaps = Math.floor(sanitizeNumber(raw.stats?.totalTaps, 0, 0));
  const isPreV4 = !raw.version || raw.version < 6;
  let tutorialStep;
  if (raw.tutorialStep !== undefined) {
    const rawStep = Math.floor(sanitizeNumber(raw.tutorialStep, 0, 0));
    // Migrazione v3.5 -> v4.0: chi aveva già finito il vecchio tutorial (>= 4) passa direttamente a 6 (completato)
    tutorialStep = isPreV4 && rawStep >= 4 ? 6 : Math.min(6, rawStep);
  } else {
    tutorialStep = totalTaps >= 5 || leagueIndex > 0 ? 6 : 0;
  }

  // Migrazione claimedCareerPromotions (da claimedSeasonPromotions v4.0 o leghe già superate)
  const validLeagueIds = new Set(LEAGUES.map((l) => l.id));
  const rawPromos = Array.isArray(raw.claimedCareerPromotions)
    ? raw.claimedCareerPromotions
    : Array.isArray(raw.claimedSeasonPromotions)
      ? raw.claimedSeasonPromotions
      : null;
  let claimedCareerPromotions = [];
  if (rawPromos) {
    claimedCareerPromotions = rawPromos.filter((id) => validLeagueIds.has(id));
  } else if (isPreV4) {
    for (let i = 0; i < leagueIndex; i++) {
      if (LEAGUES[i]) claimedCareerPromotions.push(LEAGUES[i].id);
    }
    if (raw.seasonCompleted && LEAGUES[LEAGUES.length - 1]) {
      claimedCareerPromotions.push(LEAGUES[LEAGUES.length - 1].id);
    }
  }

  const leagueEarned = sanitizeNumber(raw.leagueEarned, 0, 0);
  const totalEarned = sanitizeNumber(raw.totalEarned, 0, 0);
  const runEarned =
    raw.runEarned !== undefined
      ? sanitizeNumber(raw.runEarned, 0, 0)
      : Math.max(leagueEarned, totalEarned);

  // Migrazione v4.0 -> v4.5: vecchie seasonStars + seasonCompleted diventano dynastyLevel!
  const legacyDynasty =
    Math.floor(sanitizeNumber(raw.seasonStars, 0, 0)) + (raw.seasonCompleted ? 1 : 0);
  const dynastyLevel = Math.max(
    Math.floor(sanitizeNumber(raw.dynastyLevel, 0, 0)),
    legacyDynasty
  );

  // Migrazione anti-double-dip careerPrestigePeakEarned!
  const rawSharesFloor =
    prestigeShares > 0
      ? PRESTIGE_UNLOCK_RUN_CASH * Math.pow(prestigeShares, 1 / PRESTIGE_SHARES_EXPONENT)
      : 0;
  const safeSharesFloor = Number.isFinite(rawSharesFloor) ? Math.min(rawSharesFloor, 1e300) : 1e300;
  const careerPrestigePeakEarned = Math.max(
    sanitizeNumber(raw.careerPrestigePeakEarned, 0, 0),
    raw.version && raw.version >= 7 ? 0 : runEarned,
    safeSharesFloor
  );

  // Sanitizza 28 Trofei di Maestria
  const validMasteryTiers = new Set(MASTERY_TIERS.map((t) => t.id));
  const masteryTrophies = {};
  if (raw.masteryTrophies && typeof raw.masteryTrophies === 'object') {
    for (const [k, v] of Object.entries(raw.masteryTrophies)) {
      if (!v) continue;
      const [lgId, tId] = k.split(':');
      if (validLeagueIds.has(lgId) && validMasteryTiers.has(tId)) {
        masteryTrophies[k] = true;
      }
    }
  }

  // Sanitizza Inventario Cimeli, 3 Slot & Spedizione attiva
  const relicInventory = [];
  const validRelicUids = new Set();
  if (Array.isArray(raw.relicInventory)) {
    for (const r of raw.relicInventory) {
      if (!r || typeof r !== 'object' || !RELIC_BY_ID[r.relicId]) continue;
      const uid = typeof r.uid === 'string' && !validRelicUids.has(r.uid)
        ? r.uid
        : `rel_${Math.random().toString(36).slice(2, 9)}`;
      validRelicUids.add(uid);
      relicInventory.push({
        uid,
        relicId: r.relicId,
        rarity: RELIC_RARITIES[r.rarity] ? r.rarity : 'comune',
      });
    }
  }
  const equippedRelics = [null, null, null];
  if (Array.isArray(raw.equippedRelics)) {
    const usedTypes = new Set();
    const invMap = new Map(relicInventory.map((r) => [r.uid, r]));
    for (let i = 0; i < 3; i++) {
      const uid = raw.equippedRelics[i];
      const item = uid ? invMap.get(uid) : null;
      if (item && !usedTypes.has(item.relicId)) {
        equippedRelics[i] = uid;
        usedTypes.add(item.relicId);
      }
    }
  }
  let activeExpedition = null;
  if (raw.activeExpedition && typeof raw.activeExpedition === 'object') {
    const expDef = EXPEDITION_DEFS.find((e) => e.id === raw.activeExpedition.id);
    if (expDef) {
      activeExpedition = {
        id: expDef.id,
        startedAt: sanitizeNumber(raw.activeExpedition.startedAt, Date.now(), 0),
        endsAt: sanitizeNumber(raw.activeExpedition.endsAt, Date.now(), 0),
      };
    }
  }

  const claimedDynastyMilestones = {};
  if (raw.claimedDynastyMilestones && typeof raw.claimedDynastyMilestones === 'object') {
    for (const [k, v] of Object.entries(raw.claimedDynastyMilestones)) {
      if (v) claimedDynastyMilestones[k] = true;
    }
  }

  const state = {
    ...base,
    version: SAVE_VERSION,
    clubName,
    clubColors: { primary, secondary },
    selectedTactic,
    buyMode: VALID_BUY_MODES.has(raw.buyMode) ? raw.buyMode : '1x',
    playoffStage: Math.min(maxStage, Math.floor(sanitizeNumber(raw.playoffStage, 0, 0))),
    money: sanitizeNumber(raw.money, 0, 0),
    leagueEarned,
    runEarned,
    careerPrestigePeakEarned,
    runPeakBaseIncome: sanitizeNumber(raw.runPeakBaseIncome, 0, 0),
    totalEarned,
    leagueIndex,
    dynastyLevel,
    claimedDynastyMilestones,
    europeanCupWon: Boolean(raw.europeanCupWon),
    upgrades: {},
    roster: [],
    lineup: createEmptyLineup(),
    discoveredSecrets: [],
    claimedCareerMilestones: {},
    claimedCareerPromotions,
    masteryTrophies,
    relicInventory,
    equippedRelics,
    activeExpedition,
    completedChallenges: Array.isArray(raw.completedChallenges)
      ? raw.completedChallenges.filter((id) => VALID_CHALLENGES.has(id))
      : [],
    cleanSheetStreak: Math.floor(sanitizeNumber(raw.cleanSheetStreak, 0, 0)),
    boughtIncomeUpgradeThisRun: Boolean(raw.boughtIncomeUpgradeThisRun),
    packPurchases: { oratorio: 0, osservatore: 0, vip: 0 },
    freePacks: { oratorio: 0, osservatore: 0, vip: 0 },
    trophies,
    prestigeCount,
    prestigeShares,
    goldTokens,
    research: {},
    musicEnabled,
    sfxEnabled,
    boostUntil: sanitizeNumber(raw.boostUntil, 0, 0),
    invasionBoostUntil: sanitizeNumber(raw.invasionBoostUntil, 0, 0),
    polpettaBoostUntil: sanitizeNumber(raw.polpettaBoostUntil, 0, 0),
    polpettaCooldownUntil: sanitizeNumber(raw.polpettaCooldownUntil, 0, 0),
    apeBoostUntil: sanitizeNumber(raw.apeBoostUntil, 0, 0),
    smokeTapBoostUntil: sanitizeNumber(raw.smokeTapBoostUntil, 0, 0),
    tutorialStep,
    stats: {
      totalTaps,
      packsOpened: Math.floor(sanitizeNumber(raw.stats?.packsOpened, 0, 0)),
      matchesWon: Math.floor(sanitizeNumber(raw.stats?.matchesWon, 0, 0)),
      flashEventsHit: Math.floor(sanitizeNumber(raw.stats?.flashEventsHit, 0, 0)),
      maxIncomePerSec: sanitizeNumber(raw.stats?.maxIncomePerSec, 0, 0),
    },
    lastSavedAt: sanitizeNumber(raw.lastSavedAt, Date.now(), 0),
  };

  if (raw.upgrades && typeof raw.upgrades === 'object') {
    for (const [k, v] of Object.entries(raw.upgrades)) {
      const lvl = Math.floor(sanitizeNumber(v, 0, 0));
      if (lvl > 0) state.upgrades[k] = lvl;
    }
  }

  if (raw.claimedCareerMilestones && typeof raw.claimedCareerMilestones === 'object') {
    for (const [k, v] of Object.entries(raw.claimedCareerMilestones)) {
      if (v) state.claimedCareerMilestones[k] = true;
    }
  } else if (isPreV3) {
    for (const [upgId, lvl] of Object.entries(state.upgrades)) {
      for (const m of MILESTONE_LEVELS) {
        if (lvl >= m) state.claimedCareerMilestones[`${upgId}:${m}`] = true;
      }
    }
  }

  if (raw.research && typeof raw.research === 'object') {
    for (const def of PERMANENT_RESEARCHES) {
      const lvl = Math.min(
        def.maxLevel,
        Math.floor(sanitizeNumber(raw.research[def.id], 0, 0))
      );
      if (lvl > 0) state.research[def.id] = lvl;
    }
  }

  for (const packId of ['oratorio', 'osservatore', 'vip']) {
    state.packPurchases[packId] = Math.floor(
      sanitizeNumber(raw.packPurchases?.[packId], 0, 0)
    );
    state.freePacks[packId] = Math.floor(
      sanitizeNumber(raw.freePacks?.[packId], 0, 0)
    );
  }

  if (Array.isArray(raw.roster)) {
    for (const p of raw.roster) {
      if (!p || typeof p !== 'object' || typeof p.name !== 'string') continue;

      if (typeof p.secretId === 'string' && VALID_SECRET_IDS.has(p.secretId)) {
        const tpl = getSecretTemplate(p.secretId);
        if (tpl) {
          discoveredSet.add(p.secretId);
          state.roster.push({
            ...tpl,
            stars: Math.min(
              MAX_PLAYER_STARS,
              Math.max(1, Math.floor(sanitizeNumber(p.stars, 1, 1)))
            ),
          });
          continue;
        }
      }

      const cleanName = p.name.slice(0, 80);
      state.roster.push({
        id: typeof p.id === 'string' ? p.id : `pl_${Math.random().toString(36).slice(2)}`,
        name: cleanName,
        nickname: typeof p.nickname === 'string' ? p.nickname : extractNickname(cleanName),
        shortName: typeof p.shortName === 'string' ? p.shortName.slice(0, 24) : cleanName.split(' ').pop(),
        role: ['POR', 'DIF', 'CEN', 'ATT'].includes(p.role) ? p.role : 'ATT',
        jerseyColor: typeof p.jerseyColor === 'string' ? p.jerseyColor : '#ef4444',
        jerseyNumber: Math.min(99, Math.max(1, Math.floor(sanitizeNumber(p.jerseyNumber, 10, 1)))),
        rarity: ['comune', 'raro', 'epico', 'leggenda', 'segreto'].includes(p.rarity) ? p.rarity : 'comune',
        stars: Math.min(MAX_PLAYER_STARS, Math.max(1, Math.floor(sanitizeNumber(p.stars, 1, 1)))),
        bonusType: ['tapPct', 'incomePct', 'critPct', 'matchSec', 'squadPowerPct'].includes(p.bonusType)
          ? p.bonusType
          : 'incomePct',
        bonusValue: sanitizeNumber(p.bonusValue, 5, 0.1),
        power: sanitizeNumber(p.power, 10, 1),
      });
    }
    sortRosterInPlace(state.roster);
  }

  // Migrazione Formazione a 5 Ruoli: conserva lineup valida o auto-schiera i migliori da salvataggi v3.0.1!
  const rosterById = new Map(state.roster.map((p) => [p.id, p]));
  let hasAnyAssigned = false;
  if (raw.lineup && typeof raw.lineup === 'object') {
    const used = new Set();
    for (const slot of FORMATION_SLOTS_DEF) {
      const pid = raw.lineup[slot.key];
      const pl = pid ? rosterById.get(pid) : null;
      if (pl && pl.role === slot.role && !used.has(pid)) {
        state.lineup[slot.key] = pid;
        used.add(pid);
        hasAnyAssigned = true;
      }
    }
  }
  if (!hasAnyAssigned && state.roster.length > 0) {
    autoAssignLineup(state);
  }

  state.discoveredSecrets = Array.from(discoveredSet);

  // Sincronizza runPeakBaseIncome sui vecchi salvataggi
  const curStats = computeStats(state);
  if (curStats.baseIncomeNoTempBoosts > state.runPeakBaseIncome) {
    state.runPeakBaseIncome = curStats.baseIncomeNoTempBoosts;
  }

  return state;
}

export function saveGame(state) {
  try {
    state.lastSavedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Salvataggio localStorage fallito:', err);
    return false;
  }
}

export function loadGame() {
  try {
    const rawStr = localStorage.getItem(SAVE_KEY);
    if (!rawStr) {
      return { state: createInitialState(), offline: null };
    }
    const parsed = JSON.parse(rawStr);
    const state = sanitizeState(parsed);
    const offline = calculateOfflineEarnings(state);
    return { state, offline };
  } catch (err) {
    console.warn('Caricamento salvataggio fallito, avvio nuova partita:', err);
    return { state: createInitialState(), offline: null };
  }
}

export function calculateOfflineEarnings(state, now = Date.now()) {
  if (!state.lastSavedAt || now <= state.lastSavedAt) return null;
  const rawElapsedSec = (now - state.lastSavedAt) / 1000;
  if (rawElapsedSec < OFFLINE_MIN_SECONDS) return null;

  const stats = computeStats(
    {
      ...state,
      boostUntil: 0,
      invasionBoostUntil: 0,
      apeBoostUntil: 0,
      smokeTapBoostUntil: 0,
      polpettaBoostUntil: 0,
    },
    now
  );
  if (stats.incomePerSec <= 0) return null;

  const { offlineCapHours } = getResearchEffects(state);
  const relicFx = getRelicEffects(state);
  const totalCapHours = offlineCapHours + (relicFx.offlineExtraHours || 0);
  const totalCapSec = totalCapHours * 3600;
  const offlineBonusMult = 1 + (relicFx.offlineBonusPct || 0) / 100;
  const cappedSec = Math.min(rawElapsedSec, totalCapSec);
  const earned = Math.floor(stats.incomePerSec * cappedSec * offlineBonusMult);
  if (earned <= 0) return null;

  return {
    elapsedSec: Math.floor(cappedSec),
    wasCapped: rawElapsedSec > totalCapSec,
    capHours: totalCapHours,
    amount: earned,
  };
}

export function exportSaveBase64(state) {
  state.lastSavedAt = Date.now();
  return encodeBase64UTF8(JSON.stringify(state));
}

export function importSaveBase64(base64Str) {
  if (!base64Str || typeof base64Str !== 'string') {
    throw new Error('Stringa di salvataggio vuota.');
  }
  const decoded = decodeBase64UTF8(base64Str);
  const parsed = JSON.parse(decoded);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.money !== 'number') {
    throw new Error('Formato salvataggio non valido.');
  }
  return sanitizeState(parsed);
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
