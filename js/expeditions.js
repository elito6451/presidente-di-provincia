// Modulo v4.5: Spedizioni Scouting in tempo reale (Date.now()) & 8 Cimeli Equipaggiabili (3 slot permanenti al Prestige)

export const RELIC_RARITIES = {
  comune: { id: 'comune', label: 'Comune', color: '#94a3b8', bg: 'rgba(148,163,184,0.18)', rank: 1, next: 'raro' },
  raro: { id: 'raro', label: 'Raro', color: '#38bdf8', bg: 'rgba(56,189,248,0.18)', rank: 2, next: 'epico' },
  epico: { id: 'epico', label: 'Epico', color: '#c084fc', bg: 'rgba(192,132,252,0.20)', rank: 3, next: 'leggendario' },
  leggendario: { id: 'leggendario', label: 'Leggendario', color: '#fbbf24', bg: 'rgba(251,191,36,0.24)', rank: 4, next: null },
};

export const RELIC_DEFS = [
  {
    id: 'super_tele',
    name: 'Super Tele Bucato',
    icon: '⚽',
    desc: 'Vola a caso col vento ma sui tiri al volo fa miracoli.',
    values: { comune: 12, raro: 24, epico: 45, leggendario: 80 },
    formatEffect: (r) => `+${RELIC_DEFS[0].values[r]}% valore Tap`,
  },
  {
    id: 'fischietto_truccato',
    name: 'Fischietto Truccato',
    icon: '📣',
    desc: 'L\'arbitro chiude un occhio: fasce di precisione più generose.',
    values: { comune: 4, raro: 8, epico: 13, leggendario: 20 },
    formatEffect: (r) => `+${RELIC_DEFS[1].values[r]}% fascia TIRA! & PARA!`,
  },
  {
    id: 'scarpini_78',
    name: 'Scarpini Chiodati del \'78',
    icon: '🥾',
    desc: 'Pesano 4 chili l\'uno ma incutono terrore in spogliatoio.',
    values: { comune: 6, raro: 12, epico: 22, leggendario: 35 },
    formatEffect: (r) => `+${RELIC_DEFS[2].values[r]}% Forza Titolari`,
  },
  {
    id: 'lavagnetta_mister',
    name: 'Lavagnetta Unta del Mister',
    icon: '📋',
    desc: 'Schemi scritti con la maionese del paninaro: incassi anche mentre dormi.',
    values: {
      comune: { hours: 1, pct: 10 },
      raro: { hours: 2, pct: 20 },
      epico: { hours: 4, pct: 35 },
      leggendario: { hours: 6, pct: 55 },
    },
    formatEffect: (r) => {
      const v = RELIC_DEFS[3].values[r];
      return `+${v.hours}h cap & +${v.pct}% Offline`;
    },
  },
  {
    id: 'megafono_curva',
    name: 'Megafono della Curva',
    icon: '📢',
    desc: 'Si sente fino al comune vicino: abbonamenti alle stelle.',
    values: { comune: 10, raro: 22, epico: 40, leggendario: 70 },
    formatEffect: (r) => `+${RELIC_DEFS[4].values[r]}% Incassi/s`,
  },
  {
    id: 'valigetta_procuratore',
    name: 'Valigetta del Procuratore',
    icon: '💼',
    desc: 'Sconti misteriosi sulle buste Scouting in contanti.',
    values: { comune: 5, raro: 10, epico: 16, leggendario: 24 },
    formatEffect: (r) => `-${RELIC_DEFS[5].values[r]}% costo Buste`,
  },
  {
    id: 'borraccia_sospetta',
    name: 'Borraccia "Sospetta"',
    icon: '🧪',
    desc: 'Tè al limone della nonna... oppure carburante per il possesso.',
    values: { comune: 8, raro: 15, epico: 24, leggendario: 35 },
    formatEffect: (r) => `+${RELIC_DEFS[6].values[r]}% velocità Possesso`,
  },
  {
    id: 'croccantino_polpetta',
    name: 'Croccantino d\'Oro di Polpetta',
    icon: '🐹',
    desc: 'Lo snack preferito della mascotte: morale esplosivo e riposo lampo!',
    values: {
      comune: { mult: 1.35, cdSec: 40 },
      raro: { mult: 1.45, cdSec: 35 },
      epico: { mult: 1.60, cdSec: 28 },
      leggendario: { mult: 1.80, cdSec: 20 },
    },
    formatEffect: (r) => {
      const v = RELIC_DEFS[7].values[r];
      return `Polpetta ×${v.mult.toFixed(2).replace('.', ',')} • ${v.cdSec}s CD`;
    },
  },
];

export const RELIC_BY_ID = Object.fromEntries(RELIC_DEFS.map((r) => [r.id, r]));

export const EXPEDITION_DEFS = [
  {
    id: 'gita_pulmino',
    name: 'Gita in Pulmino',
    icon: '🚐',
    durationSec: 120, // 2 min
    unlockLeague: 1,  // Promozione
    unlockLabel: 'Sblocca: Promozione',
    minDrops: 1,
    maxDrops: 1,
    weights: { comune: 72, raro: 28, epico: 0, leggendario: 0 },
    desc: 'Spedizione lampo nei campetti vicini (1 Cimelio Comune/Raro).',
  },
  {
    id: 'volo_lowcost',
    name: 'Volo Low Cost con Scalo',
    icon: '✈️',
    durationSec: 600, // 10 min
    unlockLeague: 2,  // Serie C
    unlockLabel: 'Sblocca: Serie C',
    minDrops: 1,
    maxDrops: 2,
    weights: { comune: 38, raro: 44, epico: 18, leggendario: 0 },
    desc: 'Bagaglio a mano e fiuto da osservatore (1–2 Cimeli fino a Epico).',
  },
  {
    id: 'tour_polverosi',
    name: 'Tour Campi Polverosi',
    icon: '🚌',
    durationSec: 1800, // 30 min
    unlockLeague: 3,   // Serie A
    unlockLabel: 'Sblocca: Serie A',
    minDrops: 2,
    maxDrops: 2,
    weights: { comune: 10, raro: 38, epico: 38, leggendario: 14 },
    desc: 'Caccia ai cimeli storici (2 Cimeli, alta chance Epico/Leggendario).',
  },
  {
    id: 'missione_galattica',
    name: 'Missione Intergalattica',
    icon: '🚀',
    durationSec: 3600, // 60 min
    unlockLeague: 4,   // Notte Europea+
    unlockLabel: 'Sblocca: Notte Europea',
    minDrops: 2,
    maxDrops: 3,
    weights: { comune: 0, raro: 22, epico: 48, leggendario: 30 },
    desc: 'Spedizione stellare (2–3 Cimeli, miglior chance Leggendario!).',
  },
];

function rollWeighted(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'comune';
}

export function createRelicInstance(relicId, rarity = 'comune') {
  return {
    uid: `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    relicId,
    rarity: RELIC_RARITIES[rarity] ? rarity : 'comune',
  };
}

export function isExpeditionUnlocked(state, expDef) {
  return (state.leagueIndex || 0) >= expDef.unlockLeague;
}

export function getExpeditionStatus(state, now = Date.now()) {
  const act = state.activeExpedition;
  if (!act) return null;
  const def = EXPEDITION_DEFS.find((e) => e.id === act.id);
  if (!def) return null;
  const totalMs = Math.max(1000, act.endsAt - act.startedAt);
  const remMs = Math.max(0, act.endsAt - now);
  const pct = Math.min(100, ((totalMs - remMs) / totalMs) * 100);
  return {
    def,
    startedAt: act.startedAt,
    endsAt: act.endsAt,
    remainingSec: Math.ceil(remMs / 1000),
    pct,
    ready: remMs <= 0,
  };
}

export function startExpedition(state, expId, now = Date.now()) {
  if (state.activeExpedition) return { ok: false, reason: 'Spedizione già in corso' };
  const def = EXPEDITION_DEFS.find((e) => e.id === expId);
  if (!def || !isExpeditionUnlocked(state, def)) {
    return { ok: false, reason: 'Categoria non ancora raggiunta' };
  }
  state.activeExpedition = {
    id: def.id,
    startedAt: now,
    endsAt: now + def.durationSec * 1000,
  };
  return { ok: true, def };
}

export function claimExpedition(state, now = Date.now()) {
  const status = getExpeditionStatus(state, now);
  if (!status || !status.ready) return { ok: false };
  const def = status.def;
  const dropCount =
    def.minDrops + Math.floor(Math.random() * (def.maxDrops - def.minDrops + 1));

  if (!Array.isArray(state.relicInventory)) state.relicInventory = [];
  const drops = [];
  for (let i = 0; i < dropCount; i++) {
    const relicDef = RELIC_DEFS[Math.floor(Math.random() * RELIC_DEFS.length)];
    const rarity = rollWeighted(def.weights);
    const inst = createRelicInstance(relicDef.id, rarity);
    state.relicInventory.push(inst);
    drops.push(inst);
  }
  state.activeExpedition = null;
  sortRelicInventory(state);
  return { ok: true, def, drops };
}

export function sortRelicInventory(state) {
  if (!Array.isArray(state.relicInventory)) return;
  const eqSet = new Set((state.equippedRelics || []).filter(Boolean));
  state.relicInventory.sort((a, b) => {
    const aEq = eqSet.has(a.uid) ? 1 : 0;
    const bEq = eqSet.has(b.uid) ? 1 : 0;
    if (bEq !== aEq) return bEq - aEq;
    const ra = RELIC_RARITIES[a.rarity]?.rank || 0;
    const rb = RELIC_RARITIES[b.rarity]?.rank || 0;
    if (rb !== ra) return rb - ra;
    return String(a.relicId).localeCompare(String(b.relicId));
  });
}

export function getEquippedRelics(state) {
  const invMap = new Map((state.relicInventory || []).map((r) => [r.uid, r]));
  const slots = Array.isArray(state.equippedRelics) ? state.equippedRelics : [null, null, null];
  const out = [];
  const seenTypes = new Set();
  for (let i = 0; i < 3; i++) {
    const uid = slots[i];
    const item = uid ? invMap.get(uid) || null : null;
    if (item && RELIC_BY_ID[item.relicId] && !seenTypes.has(item.relicId)) {
      seenTypes.add(item.relicId);
      out.push({ slotIdx: i, item, def: RELIC_BY_ID[item.relicId] });
    } else {
      out.push({ slotIdx: i, item: null, def: null });
    }
  }
  return out;
}

export function equipRelic(state, uid, preferredSlotIdx = null) {
  if (!Array.isArray(state.equippedRelics) || state.equippedRelics.length !== 3) {
    state.equippedRelics = [null, null, null];
  }
  const item = (state.relicInventory || []).find((r) => r.uid === uid);
  if (!item) return { ok: false };

  // Se già equipaggiato, non fare nulla
  if (state.equippedRelics.includes(uid)) return { ok: false, reason: 'Già equipaggiato' };

  // Regola v4.5: non puoi equipaggiare 2 Cimeli dello stesso tipo contemporaneamente!
  // Se lo stesso tipo è già in uno slot, lo sostituiamo direttamente in quello slot (upgrade comodo!)
  const invMap = new Map((state.relicInventory || []).map((r) => [r.uid, r]));
  const sameTypeSlot = state.equippedRelics.findIndex((otherUid) => {
    const other = otherUid ? invMap.get(otherUid) : null;
    return other && other.relicId === item.relicId;
  });

  if (sameTypeSlot !== -1) {
    state.equippedRelics[sameTypeSlot] = uid;
    sortRelicInventory(state);
    return { ok: true, slotIdx: sameTypeSlot, replacedSameType: true };
  }

  let targetIdx =
    preferredSlotIdx !== null && preferredSlotIdx >= 0 && preferredSlotIdx < 3
      ? preferredSlotIdx
      : state.equippedRelics.findIndex((s) => !s);
  if (targetIdx === -1) targetIdx = 0;

  state.equippedRelics[targetIdx] = uid;
  sortRelicInventory(state);
  return { ok: true, slotIdx: targetIdx, replacedSameType: false };
}

export function unequipRelicSlot(state, slotIdx) {
  if (!Array.isArray(state.equippedRelics) || slotIdx < 0 || slotIdx > 2) return false;
  if (!state.equippedRelics[slotIdx]) return false;
  state.equippedRelics[slotIdx] = null;
  sortRelicInventory(state);
  return true;
}

export function getRelicFusionGroups(state) {
  const eqSet = new Set((state.equippedRelics || []).filter(Boolean));
  const counts = new Map();
  for (const r of state.relicInventory || []) {
    const rar = RELIC_RARITIES[r.rarity];
    if (!rar || !rar.next) continue;
    const key = `${r.relicId}:${r.rarity}`;
    if (!counts.has(key)) counts.set(key, { relicId: r.relicId, rarity: r.rarity, items: [], equippedCount: 0 });
    const g = counts.get(key);
    g.items.push(r);
    if (eqSet.has(r.uid)) g.equippedCount += 1;
  }
  const fusable = [];
  for (const g of counts.values()) {
    if (g.items.length >= 3) fusable.push(g);
  }
  return fusable;
}

// Fusione 3 Cimeli identici -> 1 Cimelio di rarità superiore (mantiene lo slot equipaggiato se uno dei 3 era equipaggiato!)
export function fuseRelics(state, relicId, rarity) {
  const rar = RELIC_RARITIES[rarity];
  if (!rar || !rar.next) return { ok: false, reason: 'Già Leggendario' };
  const matching = (state.relicInventory || []).filter(
    (r) => r.relicId === relicId && r.rarity === rarity
  );
  if (matching.length < 3) return { ok: false, reason: 'Servono 3 Cimeli identici' };

  // Preferisci consumare prima quelli non equipaggiati, ma se 1 è equipaggiato trasferisci lo slot al nuovo Cimelio potenziato!
  const eqSlots = Array.isArray(state.equippedRelics) ? state.equippedRelics : [null, null, null];
  const eqSet = new Set(eqSlots.filter(Boolean));
  matching.sort((a, b) => (eqSet.has(a.uid) ? 1 : 0) - (eqSet.has(b.uid) ? 1 : 0));
  const consumed = matching.slice(0, 3);
  const consumedIds = new Set(consumed.map((c) => c.uid));

  const upgraded = createRelicInstance(relicId, rar.next);
  state.relicInventory = state.relicInventory.filter((r) => !consumedIds.has(r.uid));
  state.relicInventory.push(upgraded);

  for (let i = 0; i < eqSlots.length; i++) {
    if (consumedIds.has(eqSlots[i])) {
      eqSlots[i] = upgraded.uid;
    }
  }
  sortRelicInventory(state);
  return { ok: true, upgraded, def: RELIC_BY_ID[relicId] };
}

// Riciclo doppione per sola cassa (0 🪙 per rispettare la scarsità v4.0!)
export function getRelicRecycleCash(relic, state, stats) {
  const rank = RELIC_RARITIES[relic.rarity]?.rank || 1;
  const multSec = [0, 15, 35, 75, 160][rank] || 15;
  const floorCash = [0, 500, 3500, 25000, 180000][rank] || 500;
  const baseInc = Math.max(stats?.baseIncomeNoTempBoosts || 0, state?.runPeakBaseIncome || 0);
  return Math.floor(Math.max(floorCash, baseInc * multSec));
}

export function recycleRelic(state, uid, stats) {
  const eqSet = new Set((state.equippedRelics || []).filter(Boolean));
  if (eqSet.has(uid)) return { ok: false, reason: 'Togli il Cimelio dallo slot prima di riciclarlo' };
  const idx = (state.relicInventory || []).findIndex((r) => r.uid === uid);
  if (idx === -1) return { ok: false };
  const item = state.relicInventory[idx];
  const cash = getRelicRecycleCash(item, state, stats);
  state.relicInventory.splice(idx, 1);
  return { ok: true, item, def: RELIC_BY_ID[item.relicId], cash };
}

export function getRelicEffects(state) {
  const equipped = getEquippedRelics(state);
  const fx = {
    tapPct: 0,
    incomePct: 0,
    squadPowerPct: 0,
    matchPrecisionPct: 0,
    packDiscountPct: 0,
    possessionPct: 0,
    offlineExtraHours: 0,
    offlineBonusPct: 0,
    polpettaMult: 1.25,
    polpettaCooldownMs: 45 * 1000,
  };

  for (const { item, def } of equipped) {
    if (!item || !def) continue;
    const val = def.values[item.rarity];
    if (!val) continue;
    if (item.relicId === 'super_tele') fx.tapPct += val;
    else if (item.relicId === 'fischietto_truccato') fx.matchPrecisionPct += val;
    else if (item.relicId === 'scarpini_78') fx.squadPowerPct += val;
    else if (item.relicId === 'lavagnetta_mister') {
      fx.offlineExtraHours += val.hours;
      fx.offlineBonusPct += val.pct;
    } else if (item.relicId === 'megafono_curva') fx.incomePct += val;
    else if (item.relicId === 'valigetta_procuratore') fx.packDiscountPct += val;
    else if (item.relicId === 'borraccia_sospetta') fx.possessionPct += val;
    else if (item.relicId === 'croccantino_polpetta') {
      fx.polpettaMult = Math.max(fx.polpettaMult, val.mult);
      fx.polpettaCooldownMs = Math.min(fx.polpettaCooldownMs, val.cdSec * 1000);
    }
  }
  return fx;
}
