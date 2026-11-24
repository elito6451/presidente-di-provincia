// Modulo dedicato alle 6 Ricerche Permanenti acquistabili con Gettoni d'Oro (non si azzerano al Prestige)

export const PERMANENT_RESEARCHES = [
  {
    id: 'offline_cap',
    name: 'Ritiro H24',
    icon: '🌙',
    maxLevel: 5,
    costs: [3, 6, 10, 16, 24],
    desc: 'Aumenta il tetto dei guadagni offline da 2h fino a 12h (+2h/liv).',
    effectLabel: (lvl) => `Cap offline: ${2 + lvl * 2}h`,
  },
  {
    id: 'upgrade_discount',
    name: 'Sconti in Cassa',
    icon: '🏷️',
    maxLevel: 5,
    costs: [4, 8, 14, 22, 32],
    desc: 'Riduce il costo di tutti i potenziamenti Club del 5% per livello.',
    effectLabel: (lvl) => `Sconto Club: -${lvl * 5}%`,
  },
  {
    id: 'scout_luck',
    name: 'Osservatore Esperto',
    icon: '🔭',
    maxLevel: 5,
    costs: [5, 10, 16, 24, 35],
    desc: 'Aumenta +12%/liv Epico/Leggenda e +6%/liv i rarissimi Segreti.',
    effectLabel: (lvl) => `E/L +${lvl * 12}% • Segreti +${lvl * 6}%`,
  },
  {
    id: 'prestige_power',
    name: 'Fondo Speculativo',
    icon: '📈',
    maxLevel: 5,
    costs: [6, 12, 20, 30, 45],
    desc: 'Potenzia il moltiplicatore di ogni Azione del Fondo (+5% extra/liv).',
    effectLabel: (lvl) => `+${25 + lvl * 5}% per Azione`,
  },
  {
    id: 'crit_power',
    name: 'Tifo Caldo',
    icon: '🔥',
    maxLevel: 5,
    costs: [4, 8, 13, 20, 30],
    desc: 'Aumenta il moltiplicatore dei colpi critici (+0,5x per livello).',
    effectLabel: (lvl) => `Critico: ×${(3 + lvl * 0.5).toFixed(1).replace('.', ',')}`,
  },
  {
    id: 'event_boost',
    name: 'Stadio Magnetico',
    icon: '🧲',
    maxLevel: 5,
    costs: [3, 7, 12, 18, 28],
    desc: 'Aumenta i premi cassa degli Eventi Casuali (+20%/liv) e +1 🪙 da Lv.3.',
    effectLabel: (lvl) =>
      `Eventi +${lvl * 20}%${lvl >= 3 ? ' • +1 🪙' : ''}`,
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
  const critLvl = getResearchLevel(state, 'crit_power');
  const eventLvl = getResearchLevel(state, 'event_boost');

  return {
    offlineCapHours: 2 + offlineLvl * 2,
    offlineCapSec: (2 + offlineLvl * 2) * 3600,
    upgradeCostMult: Math.max(0.75, 1 - discountLvl * 0.05),
    scoutLuckMult: 1 + scoutLvl * 0.12,
    secretLuckMult: 1 + scoutLvl * 0.06,
    shareBonusPct: 25 + prestigeLvl * 5,
    critMultiplier: 3 + critLvl * 0.5,
    eventCashMult: 1 + eventLvl * 0.2,
    eventExtraTokens: eventLvl >= 3 ? 1 : 0,
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
