// Modulo dedicato alle 12 Ricerche Permanenti v4.0 (3 gruppi tematici, non si azzerano al Prestige)

export const RESEARCH_GROUPS = [
  { id: 'economia', label: '💰 Economia', accent: '#4ade80' },
  { id: 'rosa', label: '⚽ Rosa & Scouting', accent: '#38bdf8' },
  { id: 'partita', label: '🏆 Partita & Carriera', accent: '#fbbf24' },
];

export const PERMANENT_RESEARCHES = [
  // --- GRUPPO 1: ECONOMIA ---
  {
    id: 'offline_cap',
    category: 'economia',
    name: 'Ritiro H24',
    icon: '🌙',
    maxLevel: 5,
    costs: [3, 6, 10, 16, 24],
    desc: 'Aumenta il tetto dei guadagni offline da 2h fino a 12h (+2h/liv).',
    effectLabel: (lvl) => `Cap offline: ${2 + lvl * 2}h`,
  },
  {
    id: 'upgrade_discount',
    category: 'economia',
    name: 'Sconti in Cassa',
    icon: '🏷️',
    maxLevel: 5,
    costs: [4, 8, 14, 22, 32],
    desc: 'Riduce il costo di tutti i potenziamenti Club del 5% per livello.',
    effectLabel: (lvl) => `Sconto Club: -${lvl * 5}%`,
  },
  {
    id: 'prestige_power',
    category: 'economia',
    name: 'Fondo Speculativo',
    icon: '📈',
    maxLevel: 5,
    costs: [6, 12, 20, 30, 45],
    desc: 'Potenzia il moltiplicatore di ogni Azione del Fondo (+5% extra/liv).',
    effectLabel: (lvl) => `+${25 + lvl * 5}% per Azione`,
  },
  {
    id: 'global_marketing',
    category: 'economia',
    name: 'Marketing Globale',
    icon: '🌍',
    maxLevel: 5,
    costs: [5, 10, 18, 28, 42],
    desc: 'Aumenta permanentemente tutti gli incassi e i tap del +15% per livello.',
    effectLabel: (lvl) => `Incassi globali: +${lvl * 15}%`,
  },

  // --- GRUPPO 2: ROSA & SCOUTING ---
  {
    id: 'scout_luck',
    category: 'rosa',
    name: 'Osservatore Esperto',
    icon: '🔭',
    maxLevel: 5,
    costs: [5, 10, 16, 24, 35],
    desc: 'Aumenta +12%/liv Epico/Leggenda e +6%/liv i rarissimi Segreti.',
    effectLabel: (lvl) => `E/L +${lvl * 12}% • Segreti +${lvl * 6}%`,
  },
  {
    id: 'athletic_prep',
    category: 'rosa',
    name: 'Preparazione Atletica',
    icon: '💪',
    maxLevel: 5,
    costs: [4, 9, 15, 24, 36],
    desc: 'Potenzia permanentemente la Forza Titolari globale del +4% per livello.',
    effectLabel: (lvl) => `Forza Titolari: +${lvl * 4}%`,
  },
  {
    id: 'agent_discount',
    category: 'rosa',
    name: 'Sconto Procuratori',
    icon: '🤝',
    maxLevel: 5,
    costs: [4, 8, 14, 22, 34],
    desc: 'Riduce il costo di tutte le buste Scouting del 4% per livello.',
    effectLabel: (lvl) => `Sconto Buste: -${lvl * 4}%`,
  },
  {
    id: 'club_legacy',
    category: 'rosa',
    name: 'Eredità del Club',
    icon: '🏛️',
    maxLevel: 5,
    costs: [5, 10, 17, 26, 38],
    desc: 'Dopo ogni Prestige inizi con cassa bonus e livelli Tap pronti (compatibile con Austerity!).',
    effectLabel: (lvl) =>
      lvl === 0
        ? 'Inizio standard'
        : `Start €${(500 * Math.pow(4, lvl - 1)).toLocaleString('it-IT')} • +${lvl * 2} Righe${lvl >= 3 ? ` / +${lvl} Scarpini` : ''}`,
  },

  // --- GRUPPO 3: PARTITA & CARRIERA ---
  {
    id: 'crit_power',
    category: 'partita',
    name: 'Tifo Caldo',
    icon: '🔥',
    maxLevel: 5,
    costs: [4, 8, 13, 20, 30],
    desc: 'Aumenta il moltiplicatore dei colpi critici (+0,5x per livello).',
    effectLabel: (lvl) => `Critico: ×${(3 + lvl * 0.5).toFixed(1).replace('.', ',')}`,
  },
  {
    id: 'event_boost',
    category: 'partita',
    name: 'Stadio Magnetico',
    icon: '🧲',
    maxLevel: 5,
    costs: [3, 7, 12, 18, 28],
    desc: 'Potenzia i premi cassa degli Eventi (+25%/liv) e +3s/liv durata boost Eventi.',
    effectLabel: (lvl) => `Eventi +${lvl * 25}% • +${lvl * 3}s boost`,
  },
  {
    id: 'hawk_eye',
    category: 'partita',
    name: 'Occhio di Falco',
    icon: '🦅',
    maxLevel: 5,
    costs: [5, 10, 16, 25, 38],
    desc: 'Allarga la fascia verde di TIRA! e la finestra di parata PARA! (+3%/liv).',
    effectLabel: (lvl) => `TIRA! & PARA!: +${lvl * 3}%`,
  },
  {
    id: 'golden_cabinet',
    category: 'partita',
    name: 'Bacheca d\'Oro',
    icon: '🏅',
    maxLevel: 5,
    costs: [6, 12, 20, 32, 48],
    desc: 'Potenzia l\'efficacia dei perk di tutte le Sfide completate (+15%/liv).',
    effectLabel: (lvl) => `Perk Sfide: ×${(1 + lvl * 0.15).toFixed(2).replace('.', ',')}`,
  },
];

export function getResearchLevel(state, researchId) {
  return (state.research && state.research[researchId]) || 0;
}

export function getResearchCost(state, researchDef) {
  const lvl = getResearchLevel(state, researchDef.id);
  if (lvl >= researchDef.maxLevel) return null;
  return researchDef.costs[lvl] ?? researchDef.costs[researchDef.costs.length - 1];
}

export function getResearchEffects(state) {
  const offlineLvl = getResearchLevel(state, 'offline_cap');
  const discountLvl = getResearchLevel(state, 'upgrade_discount');
  const scoutLvl = getResearchLevel(state, 'scout_luck');
  const prestigeLvl = getResearchLevel(state, 'prestige_power');
  const marketingLvl = getResearchLevel(state, 'global_marketing');
  const athleticLvl = getResearchLevel(state, 'athletic_prep');
  const agentLvl = getResearchLevel(state, 'agent_discount');
  const legacyLvl = getResearchLevel(state, 'club_legacy');
  const critLvl = getResearchLevel(state, 'crit_power');
  const eventLvl = getResearchLevel(state, 'event_boost');
  const hawkLvl = getResearchLevel(state, 'hawk_eye');
  const cabinetLvl = getResearchLevel(state, 'golden_cabinet');

  return {
    offlineCapHours: 2 + offlineLvl * 2,
    offlineCapSec: (2 + offlineLvl * 2) * 3600,
    upgradeCostMult: Math.max(0.75, 1 - discountLvl * 0.05),
    scoutLuckMult: 1 + scoutLvl * 0.12,
    secretLuckMult: 1 + scoutLvl * 0.06,
    shareBonusPct: 25 + prestigeLvl * 5,
    globalIncomeMult: 1 + marketingLvl * 0.15,
    squadPowerMult: 1 + athleticLvl * 0.04,
    packCostMult: Math.max(0.8, 1 - agentLvl * 0.04),
    legacyLevel: legacyLvl,
    critMultiplier: 3 + critLvl * 0.5,
    eventCashMult: 1 + eventLvl * 0.25,
    eventDurationBonusSec: eventLvl * 3,
    matchPrecisionMult: 1 + hawkLvl * 0.03,
    challengePerkMult: 1 + cabinetLvl * 0.15,
  };
}

export function buyResearch(state, researchId) {
  const def = PERMANENT_RESEARCHES.find((r) => r.id === researchId);
  if (!def) return { ok: false };
  const cost = getResearchCost(state, def);
  if (cost === null) return { ok: false, reason: 'Livello massimo' };
  if ((state.goldTokens || 0) < cost) return { ok: false, reason: 'Gettoni insufficienti' };

  state.goldTokens -= cost;
  if (!state.research) state.research = {};
  state.research[def.id] = getResearchLevel(state, def.id) + 1;
  return { ok: true, research: def, cost, newLevel: state.research[def.id] };
}
