// Modulo dedicato all'Endgame Meta: 4 Sfide del Presidente, Livello Presidente, Album & Scheda WhatsApp
import { LEAGUES, SECRET_PLAYERS } from './config.js';
import { formatMoney, formatNumber } from './format.js';

export const PRESIDENT_CHALLENGES = [
  {
    id: 'austerity',
    name: 'Austerity',
    icon: '🪙',
    desc: 'Vinci lo Spareggio di Terza Categoria senza aver comprato nessun upgrade /s in questa run.',
    tokenReward: 10,
    globalPct: 5,
  },
  {
    id: 'clean_sheet_3',
    name: 'Catenaccio Puro',
    icon: '🧱',
    desc: 'Vinci 3 partite di fila senza subire gol (clean sheet).',
    tokenReward: 12,
    globalPct: 5,
  },
  {
    id: 'youth_only',
    name: 'Solo Giovani',
    icon: '🌱',
    desc: 'Vinci uno Spareggio schierando solo titolari Comuni o Rari (almeno 1 titolare).',
    tokenReward: 10,
    globalPct: 5,
  },
  {
    id: 'sprint_3_goals',
    name: 'Sprint Finale',
    icon: '⚡',
    desc: 'Segna almeno 3 gol nei 90\' regolamentari di una singola partita.',
    tokenReward: 12,
    globalPct: 5,
  },
];

export function evaluateMatchChallenges(state, { won, myGoals, oppGoals, leagueIndex, starters }) {
  if (!state.completedChallenges) state.completedChallenges = [];
  const completed = new Set(state.completedChallenges);
  const newlyCompleted = [];

  // Aggiorna striscia vittorie senza subire gol
  if (won && oppGoals === 0) {
    state.cleanSheetStreak = (state.cleanSheetStreak || 0) + 1;
  } else {
    state.cleanSheetStreak = 0;
  }

  const unlock = (id) => {
    if (completed.has(id)) return;
    const def = PRESIDENT_CHALLENGES.find((c) => c.id === id);
    if (!def) return;
    completed.add(id);
    state.completedChallenges.push(id);
    state.goldTokens = (state.goldTokens || 0) + def.tokenReward;
    newlyCompleted.push(def);
  };

  if (won) {
    // 1. Austerity: promozione da Terza Categoria senza aver comprato upgrade /s nella run
    if (leagueIndex === 0 && !state.boughtIncomeUpgradeThisRun) {
      unlock('austerity');
    }
    // 2. Catenaccio Puro: 3 vittorie di fila senza subire gol
    if ((state.cleanSheetStreak || 0) >= 3) {
      unlock('clean_sheet_3');
    }
    // 3. Solo Giovani: vittoria con solo titolari Comuni/Rari
    if (
      Array.isArray(starters) &&
      starters.length >= 1 &&
      starters.every((p) => p.rarity === 'comune' || p.rarity === 'raro')
    ) {
      unlock('youth_only');
    }
  }

  // 4. Sprint Finale: almeno 3 gol nei 90' regolamentari (anche in caso di vittoria o pareggio)
  if (myGoals >= 3) {
    unlock('sprint_3_goals');
  }

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

  // XP infiniti dalla carriera
  const xp =
    trophies * 120 +
    secrets * 200 +
    challenges * 180 +
    (seasons + stars) * 350 +
    prestiges * 100 +
    wins * 35;

  // Livello infinito con curva quadratica morbida: Lv 1 = 0 XP, Lv 2 = 100, Lv 3 = 260...
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
