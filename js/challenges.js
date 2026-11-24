// Modulo v4.0 dedicato alle 8 Sfide del Presidente (con perk unici potenziati da Bacheca d'Oro),
// Livello Presidente infinito, Album & Scheda WhatsApp
import { LEAGUES, SECRET_PLAYERS, RARITIES, FORMATION_SLOTS_DEF, MAX_PLAYER_STARS } from './config.js';
import { formatMoney, formatNumber } from './format.js';

export const PRESIDENT_CHALLENGES = [
  {
    id: 'austerity',
    name: 'Austerity',
    icon: '🪙',
    desc: 'Vinci Terza Categoria senza aver comprato nessun upgrade /s in questa run.',
    tokenReward: 10,
    perkType: 'tapPct',
    perkValue: 8,
    perkLabel: (mult = 1) => `+${formatPerkNum(8 * mult)}% valore Tap`,
  },
  {
    id: 'clean_sheet_3',
    name: 'Catenaccio Puro',
    icon: '🧱',
    desc: 'Vinci 3 partite di fila senza subire gol (clean sheet).',
    tokenReward: 12,
    perkType: 'squadPowerPct',
    perkValue: 8,
    perkLabel: (mult = 1) => `+${formatPerkNum(8 * mult)}% Forza Titolari`,
  },
  {
    id: 'youth_only',
    name: 'Solo Giovani',
    icon: '🌱',
    desc: 'Vinci uno Spareggio schierando solo titolari Comuni o Rari (almeno 1 titolare).',
    tokenReward: 10,
    perkType: 'packDiscountPct',
    perkValue: 6,
    perkLabel: (mult = 1) => `-${formatPerkNum(6 * mult)}% costo Buste`,
  },
  {
    id: 'sprint_3_goals',
    name: 'Sprint Finale',
    icon: '⚡',
    desc: 'Segna almeno 3 gol nei 90\' regolamentari di una singola partita.',
    tokenReward: 10,
    perkType: 'possessionPct',
    perkValue: 8,
    perkLabel: (mult = 1) => `+${formatPerkNum(8 * mult)}% velocità Possesso`,
  },
  {
    id: 'nerves_of_steel',
    name: 'Nervi d\'Acciaio',
    icon: '🧤',
    desc: 'Vinci una partita decisiva ai Calci di Rigore.',
    tokenReward: 12,
    perkType: 'penaltyBarPct',
    perkValue: 10,
    perkLabel: (mult = 1) => `+${formatPerkNum(10 * mult)}% barra Rigori`,
  },
  {
    id: 'perfect_market',
    name: 'Mercato Perfetto',
    icon: '⭐',
    desc: 'Porta almeno un giocatore titolare a 5★.',
    tokenReward: 12,
    perkType: 'squadPowerPct',
    perkValue: 10,
    perkLabel: (mult = 1) => `+${formatPerkNum(10 * mult)}% Forza Titolari`,
  },
  {
    id: 'collector',
    name: 'Collezionista',
    icon: '💎',
    desc: 'Schiera tutti e 5 i titolari di rarità almeno Epica (Epico, Leggenda o Segreto).',
    tokenReward: 14,
    perkType: 'globalIncomePct',
    perkValue: 10,
    perkLabel: (mult = 1) => `+${formatPerkNum(10 * mult)}% Incassi globali`,
  },
  {
    id: 'provincial_empire',
    name: 'Impero Provinciale',
    icon: '🌌',
    desc: 'Completa una Stagione intera vincendo la Superlega Galattica.',
    tokenReward: 25,
    perkType: 'globalIncomePct',
    perkValue: 20,
    perkLabel: (mult = 1) => `+${formatPerkNum(20 * mult)}% Incassi globali`,
  },
];

function formatPerkNum(val) {
  const rounded = Math.round(val * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

export function getChallengePerks(state, challengePerkMult = 1) {
  const perks = {
    tapPct: 0,
    squadPowerPct: 0,
    packDiscountPct: 0,
    possessionPct: 0,
    penaltyBarPct: 0,
    globalIncomePct: 0,
  };
  const completed = new Set(state.completedChallenges || []);
  for (const ch of PRESIDENT_CHALLENGES) {
    if (!completed.has(ch.id)) continue;
    perks[ch.perkType] = (perks[ch.perkType] || 0) + ch.perkValue * challengePerkMult;
  }
  return perks;
}

function unlockChallenge(state, id, newlyCompleted) {
  if (!state.completedChallenges) state.completedChallenges = [];
  if (state.completedChallenges.includes(id)) return;
  const def = PRESIDENT_CHALLENGES.find((c) => c.id === id);
  if (!def) return;
  state.completedChallenges.push(id);
  state.goldTokens = (state.goldTokens || 0) + def.tokenReward;
  newlyCompleted.push(def);
}

// Valuta le sfide legate a formazione/rosa/stagione (anche retroattivamente al caricamento!)
export function evaluateRosterChallenges(state) {
  const newlyCompleted = [];
  const map = new Map((state.roster || []).map((p) => [p.id, p]));
  const starters = [];
  const used = new Set();

  for (const slot of FORMATION_SLOTS_DEF) {
    const pid = state.lineup?.[slot.key];
    if (pid && !used.has(pid) && map.has(pid)) {
      const pl = map.get(pid);
      if (pl.role === slot.role) {
        used.add(pid);
        starters.push(pl);
      }
    }
  }

  // 6. Mercato Perfetto: almeno 1 titolare a 5★
  if (starters.some((p) => (p.stars || 1) >= MAX_PLAYER_STARS)) {
    unlockChallenge(state, 'perfect_market', newlyCompleted);
  }

  // 7. Collezionista: 5 titolari tutti di rarità almeno Epica (rank >= 3)
  if (
    starters.length >= FORMATION_SLOTS_DEF.length &&
    starters.every((p) => (RARITIES[p.rarity]?.rank || 1) >= 3)
  ) {
    unlockChallenge(state, 'collector', newlyCompleted);
  }

  // 8. Impero Provinciale (controllo retroattivo se ha già completato una stagione!)
  if (
    state.seasonCompleted ||
    (state.seasonStars || 0) >= 1 ||
    (state.trophies || []).includes('coppa_superlega')
  ) {
    unlockChallenge(state, 'provincial_empire', newlyCompleted);
  }

  return newlyCompleted;
}

export function evaluateMatchChallenges(
  state,
  { won, byPenalties = false, finalCup = false, myGoals, oppGoals, leagueIndex, starters }
) {
  if (!state.completedChallenges) state.completedChallenges = [];
  const newlyCompleted = [];

  // Aggiorna striscia vittorie senza subire gol
  if (won && oppGoals === 0) {
    state.cleanSheetStreak = (state.cleanSheetStreak || 0) + 1;
  } else {
    state.cleanSheetStreak = 0;
  }

  if (won) {
    // 1. Austerity: promozione da Terza Categoria senza aver comprato upgrade /s nella run
    if (leagueIndex === 0 && !state.boughtIncomeUpgradeThisRun) {
      unlockChallenge(state, 'austerity', newlyCompleted);
    }
    // 2. Catenaccio Puro: 3 vittorie di fila senza subire gol
    if ((state.cleanSheetStreak || 0) >= 3) {
      unlockChallenge(state, 'clean_sheet_3', newlyCompleted);
    }
    // 3. Solo Giovani: vittoria con solo titolari Comuni/Rari
    if (
      Array.isArray(starters) &&
      starters.length >= 1 &&
      starters.every((p) => p.rarity === 'comune' || p.rarity === 'raro')
    ) {
      unlockChallenge(state, 'youth_only', newlyCompleted);
    }
    // 5. Nervi d'Acciaio: vittoria ai Calci di Rigore
    if (byPenalties) {
      unlockChallenge(state, 'nerves_of_steel', newlyCompleted);
    }
    // 8. Impero Provinciale: conquista della Superlega Galattica
    if (finalCup || state.seasonCompleted) {
      unlockChallenge(state, 'provincial_empire', newlyCompleted);
    }
  }

  // 4. Sprint Finale: almeno 3 gol nei 90' regolamentari
  if (myGoals >= 3) {
    unlockChallenge(state, 'sprint_3_goals', newlyCompleted);
  }

  // Valuta anche eventuali sfide rosa
  const extraRoster = evaluateRosterChallenges(state);
  for (const ch of extraRoster) newlyCompleted.push(ch);

  return newlyCompleted;
}

const PRESIDENT_TITLES = [
  'Presidente di Bar Sport',
  'Patron di Provincia',
  'Mago delle Plusvalenze',
  'Direttore Generale',
  'Magnate Federale',
  'Re delle Coppe',
  'Tycoon Continentale',
  'Imperatore Galattico',
];

export function computePresidentProfile(state) {
  const trophies = (state.trophies || []).length;
  const secrets = (state.discoveredSecrets || []).length;
  const challenges = (state.completedChallenges || []).length;
  const seasons = Math.max(0, (state.seasonNumber || 1) - 1);
  const stars = state.seasonStars || 0;
  const prestiges = state.prestigeCount || 0;
  const wins = state.stats?.matchesWon || 0;

  const xp =
    trophies * 120 +
    secrets * 200 +
    challenges * 180 +
    (seasons + stars) * 350 +
    prestiges * 100 +
    wins * 35;

  let level = 1;
  let threshold = 0;
  let step = 100;
  while (xp >= threshold + step) {
    threshold += step;
    level += 1;
    step = Math.floor(100 + (level - 1) * 65);
  }

  const inLevelXp = xp - threshold;
  const pct = Math.min(100, (inLevelXp / Math.max(1, step)) * 100);
  const titleIdx = Math.min(PRESIDENT_TITLES.length - 1, Math.floor((level - 1) / 3));

  return {
    level,
    title: PRESIDENT_TITLES[titleIdx],
    xp,
    inLevelXp,
    stepXp: step,
    pct,
    trophies,
    totalTrophies: LEAGUES.length,
    secrets,
    totalSecrets: SECRET_PLAYERS.length,
    challenges,
    totalChallenges: PRESIDENT_CHALLENGES.length,
    stars,
  };
}

// Scheda Carriera compatta per WhatsApp (zero spoiler sui nomi dei Segreti!)
export function buildWhatsAppCard(state, stats) {
  const profile = computePresidentProfile(state);
  const starsStr = profile.stars > 0 ? ` ${'★'.repeat(Math.min(10, profile.stars))}` : '';
  const league = LEAGUES[state.leagueIndex] || LEAGUES[0];
  const peakIncome = Math.max(state.stats?.maxIncomePerSec || 0, stats.incomePerSec || 0);
  const hasChampions = (state.trophies || []).includes('coppa_europa');
  const hasSuperlega = (state.trophies || []).includes('coppa_superlega');

  const lines = [
    `⚽ *PRESIDENTE DI PROVINCIA* 🏆`,
    `🏟️ *${state.clubName}*${starsStr}`,
    `👔 Lv.${profile.level} — _${profile.title}_`,
    `📅 Stagione ${state.seasonNumber || 1} • Lega: *${league.name}*`,
    `🏆 Trofei: *${profile.trophies}/${profile.totalTrophies}*${hasChampions ? ' (⭐ Champions!)' : ''}${hasSuperlega ? ' (🌌 Galattica!)' : ''}`,
    `💼 Prestige: *${state.prestigeCount || 0}* (${formatNumber(state.prestigeShares || 0)} Azioni)`,
    `💸 Record incassi: *${formatMoney(peakIncome)}/s*`,
    `🕵️ Leggende Segrete: *${profile.secrets}/${profile.totalSecrets}*`,
    `🎯 Sfide Presidente: *${profile.challenges}/${profile.totalChallenges}*`,
    `🐹 Mascotte ufficiale: *Polpetta*`,
  ];
  return lines.join('\n');
}
