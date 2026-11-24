import { UPGRADES, MILESTONE_LEVELS } from './config.js';
import { formatMoney, formatNumber } from './format.js';
import {
  computeStats,
  getChecklistStatus,
  getPendingPrestigeShares,
  canPrestige,
  getUpgradeLevel,
  isUpgradeUnlocked,
  addMoney,
  addGoldTokens,
  activateBoost,
  activateInvasionBoost,
} from './state.js';
import { PERMANENT_RESEARCHES, getResearchCost } from './research.js';

// Ritratto SVG simpatico di Gino il DS (occhiali, baffi, fischietto e cravatta sociale!)
export function getGinoAvatarSvg(clubPrimary = '#dc2626') {
  return `
    <svg viewBox="0 0 64 64" class="gino-svg" aria-hidden="true">
      <defs>
        <radialGradient id="ginoBg" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#1e3a5f"/>
          <stop offset="100%" stop-color="#0b1324"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#ginoBg)" stroke="#fbbf24" stroke-width="2"/>
      <!-- Giacca e camicia -->
      <path d="M12 60 C14 47 22 44 32 44 C42 44 50 47 52 60 Z" fill="#1e293b"/>
      <polygon points="27,44 37,44 32,57" fill="#f8fafc"/>
      <polygon points="30,46 34,46 35,58 32,61 29,58" fill="${clubPrimary}"/>
      <!-- Laccio e fischietto -->
      <path d="M24 46 L32 54 L40 46" fill="none" stroke="#94a3b8" stroke-width="1.6"/>
      <ellipse cx="32" cy="54.5" rx="3.4" ry="2.2" fill="#e2e8f0" stroke="#0f172a" stroke-width="0.9"/>
      <!-- Testa e capelli brizzolati -->
      <circle cx="32" cy="27" r="14" fill="#fdba74"/>
      <path d="M18 25 C18 14 25 11 32 11 C39 11 46 14 46 25 C43 19 38 17 32 17 C26 17 21 19 18 25 Z" fill="#64748b"/>
      <!-- Occhiali -->
      <rect x="21" y="23" width="9.5" height="6.8" rx="2.5" fill="rgba(255,255,255,0.22)" stroke="#0f172a" stroke-width="1.8"/>
      <rect x="33.5" y="23" width="9.5" height="6.8" rx="2.5" fill="rgba(255,255,255,0.22)" stroke="#0f172a" stroke-width="1.8"/>
      <line x1="30.5" y1="26" x2="33.5" y2="26" stroke="#0f172a" stroke-width="1.8"/>
      <circle cx="25.8" cy="26.4" r="1.4" fill="#0f172a"/>
      <circle cx="38.2" cy="26.4" r="1.4" fill="#0f172a"/>
      <!-- Baffi folti da DS -->
      <path d="M22 35 C25 31.5 29.5 32 32 34 C34.5 32 39 31.5 42 35 C38.5 36.5 34.5 36.2 32 35 C29.5 36.2 25.5 36.5 22 35 Z" fill="#475569"/>
      <!-- Sorriso -->
      <path d="M28 37.5 Q32 40 36 37.5" fill="none" stroke="#7c2d12" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  `;
}

export const TUTORIAL_STEPS = [
  {
    step: 0,
    title: 'Passo 1/4 — Incassa sul Campo!',
    text: 'Benvenuto Presidente! Sono Gino il DS. Tocca il prato 5 volte per far rimbalzare il pallone e raccogliere i primi fondi!',
    targetTab: null,
  },
  {
    step: 1,
    title: 'Passo 2/4 — Costruisci il Club',
    text: 'Ottimo tocco! Ora compra il tuo primo potenziamento nella tab Club (es. Righe di Gesso o Paninaro Fuori Stadio: lo vedrai comparire sul campo!).',
    targetTab: 'club',
  },
  {
    step: 2,
    title: 'Passo 3/4 — Scouting & Rosa',
    text: 'Appena hai €250, apri la tab Scouting e spacchetta la tua prima Busta Oratorio: i tuoi 5 migliori giocatori scenderanno subito sul prato!',
    targetTab: 'scouting',
  },
  {
    step: 3,
    title: 'Passo 4/4 — Checklist & Spareggio',
    text: 'Perfetto! Nella tab Spareggio trovi la Checklist 3/3 (Incassi, Forza Rosa, Infrastrutture). Completala e gioca la partita 0\'–90\' per la promozione!',
    targetTab: 'spareggio',
  },
];

export function evaluateTutorialProgress(state) {
  if ((state.tutorialStep ?? 4) >= 4) return false;
  let changed = false;
  const stats = computeStats(state);

  if (state.tutorialStep === 0 && state.stats.totalTaps >= 5) {
    state.tutorialStep = 1;
    changed = true;
  }
  if (state.tutorialStep === 1 && stats.infraLevels >= 1) {
    state.tutorialStep = 2;
    changed = true;
  }
  if (state.tutorialStep === 2 && state.roster.length >= 1) {
    state.tutorialStep = 3;
    changed = true;
  }
  if (state.tutorialStep === 3 && state.stats.matchesWon >= 1) {
    state.tutorialStep = 4;
    changed = true;
  }
  return changed;
}

/**
 * Risolve l'elemento DOM target e la micro-etichetta per la freccia animata
 * del passo corrente del tutorial (sempre pointer-events: none).
 */
export function getTutorialPointerTarget(state, activeTab) {
  const step = state.tutorialStep ?? 4;
  if (step >= 4) return null;

  if (step === 0) {
    return {
      el: document.getElementById('stadium-canvas'),
      label: 'Tocca qui!',
      anchor: 'center',
    };
  }

  if (step === 1) {
    if (activeTab !== 'club') {
      return {
        el: document.querySelector('.tab-btn[data-tab="club"]'),
        label: 'Apri Club!',
        anchor: 'top',
      };
    }
    const firstBuyBtn = document.querySelector('#tab-content button[data-upgrade-id]');
    return firstBuyBtn
      ? { el: firstBuyBtn, label: 'Compra!', anchor: 'top' }
      : null;
  }

  if (step === 2) {
    if (activeTab !== 'scouting') {
      return {
        el: document.querySelector('.tab-btn[data-tab="scouting"]'),
        label: 'Apri Scouting!',
        anchor: 'top',
      };
    }
    const packBtn = document.querySelector('#tab-content button[data-pack-id="oratorio"]');
    return packBtn
      ? { el: packBtn, label: 'Apri Busta!', anchor: 'top' }
      : null;
  }

  if (step === 3) {
    if (activeTab !== 'spareggio') {
      return {
        el: document.querySelector('.tab-btn[data-tab="spareggio"]'),
        label: 'Vai in Spareggio!',
        anchor: 'top',
      };
    }
    const startBtn = document.getElementById('btn-start-match');
    if (startBtn && !startBtn.disabled) {
      return { el: startBtn, label: 'Gioca!', anchor: 'top' };
    }
    const checklist = document.querySelector('#tab-content .checklist-box');
    return checklist
      ? { el: checklist, label: 'Completa 3/3!', anchor: 'top' }
      : null;
  }

  return null;
}

const LEAGUE_BANTER = [
  'In Terza Categoria il pallone pesa tre chili quando piove, ma il cuore non si bagna mai!',
  'Con la tribunetta in cemento di Promozione il paninaro fa gli straordinari!',
  'Serie C: qui iniziano i numeri seri. Se il salto verso la Serie A è ripido, pensa al Prestige!',
  'Serie A! Riflettori accesi, telecamere ovunque e il Fondo Estero che ci corteggia.',
  'Notte Europea: siamo nell\'olimpo del calcio! Punta al Fondo Sovrano e alle 5★!',
];

export function getGinoDynamicTip(state) {
  const stats = computeStats(state);
  const check = getChecklistStatus(state);

  // 1. Spareggio pronto!
  if (check.allReady && !(state.leagueIndex === 4 && state.europeanCupWon)) {
    return {
      urgent: true,
      title: 'Spareggio Sbloccato!',
      text: 'Presidente, la Checklist 3/3 è completa! Vai in Spareggio, scegli la tattica e scendi in campo!',
      ctaTab: 'spareggio',
      ctaLabel: 'Vai allo Spareggio',
    };
  }

  // 2. Consiglio Prestige strategico sul muro morbido (Serie C+)
  if (canPrestige(state)) {
    const pending = getPendingPrestigeShares(state);
    if (pending >= 4 && state.leagueIndex >= 2) {
      const gainPct = pending * stats.research.shareBonusPct;
      return {
        urgent: true,
        title: 'Mossa da Tycoon: Prestige!',
        text: `Puoi vendere al Fondo Estero per +${pending} Azioni (+${gainPct}% permanente)! Ripartirai come un razzo sfondando il muro.`,
        ctaTab: 'societa',
        ctaLabel: 'Vedi Prestige',
      };
    }
  }

  // 3. Ricerca Permanente acquistabile con Gettoni d'Oro
  const affordableRes = PERMANENT_RESEARCHES.find((r) => {
    const cost = getResearchCost(state, r);
    return cost !== null && (state.goldTokens || 0) >= cost;
  });
  if (affordableRes) {
    return {
      urgent: true,
      title: 'Gettoni d\'Oro da Spendere!',
      text: `Hai ${state.goldTokens} 🪙! In Società → Ricerche Permanenti puoi potenziare "${affordableRes.name}" per sempre.`,
      ctaTab: 'societa',
      ctaLabel: 'Apri Ricerche',
    };
  }

  // 4. Upgrade vicino a una Milestone ×2
  for (const upg of UPGRADES) {
    if (!isUpgradeUnlocked(state, upg)) continue;
    const lvl = getUpgradeLevel(state, upg.id);
    if (lvl <= 0) continue;
    for (const m of MILESTONE_LEVELS) {
      if (lvl >= m - 2 && lvl < m) {
        return {
          urgent: false,
          title: 'Milestone ×2 Vicina!',
          text: `Porta "${upg.name}" a Lv.${m} (mancano ${m - lvl} liv.) per raddoppiare (×2) subito la sua resa!`,
          ctaTab: 'club',
          ctaLabel: 'Vai al Club',
        };
      }
    }
  }

  // 5. Cosa manca per lo Spareggio
  if (!check.squadPower.done) {
    return {
      urgent: false,
      title: 'Serve Forza Rosa!',
      text: `Per lo Spareggio ti manca Forza Rosa (⚡${formatNumber(check.squadPower.current)} / ⚡${formatNumber(check.squadPower.target)}). Apri qualche busta in Scouting!`,
      ctaTab: 'scouting',
      ctaLabel: 'Vai in Scouting',
    };
  }
  if (!check.infra.done) {
    return {
      urgent: false,
      title: 'Potenzia le Infrastrutture',
      text: `Mancano ${check.infra.target - check.infra.current} livelli upgrade Club per sbloccare il prossimo Spareggio!`,
      ctaTab: 'club',
      ctaLabel: 'Vai al Club',
    };
  }
  if (!check.cash.done) {
    return {
      urgent: false,
      title: 'Obiettivo Cassa Categoria',
      text: `Accumula ancora ${formatMoney(check.cash.target - check.cash.current)} per sbloccare il match promozione!`,
      ctaTab: null,
      ctaLabel: null,
    };
  }

  return {
    urgent: false,
    title: 'Parola di Gino il DS',
    text: LEAGUE_BANTER[state.leagueIndex] || LEAGUE_BANTER[0],
    ctaTab: null,
    ctaLabel: null,
  };
}

// Dilemmi Lampo A/B da Presidente proposti da Gino il DS
export const PRESIDENT_DILEMMAS = [
  {
    id: 'salamelle_emergency',
    title: 'Emergenza Salamelle!',
    desc: 'Il paninaro ha finito il pane a metà partita ma la fila è chilometrica. Come reagiamo Presidente?',
    optionA: {
      label: 'A) Alza i prezzi "Edizione Limitata"',
      sub: 'Incasso cassa immediato',
      apply(state, stats) {
        const cash = Math.floor(Math.max(stats.incomePerSec * 28, stats.tapValue * 45, 300 * stats.leagueMult) * stats.research.eventCashMult);
        addMoney(state, cash);
        return `Tifosi affamati pagano oro! +${formatMoney(cash)} in cassa!`;
      },
    },
    optionB: {
      label: 'B) Offri birretta gratis alla Curva',
      sub: '+2 🪙 Gettoni d\'Oro & morale',
      apply(state, stats) {
        const tok = 2 + stats.research.eventExtraTokens;
        addGoldTokens(state, tok);
        return `La Curva impazzisce d'amore! +${tok} 🪙 Gettoni d'Oro!`;
      },
    },
  },
  {
    id: 'dubious_sponsor',
    title: 'Sponsor "Crypto-Polenta"',
    desc: 'Un imprenditore in pelliccia vuole mettere il suo logo sugli spalti per oggi.',
    optionA: {
      label: 'A) Firma subito in contanti',
      sub: 'Grossa iniezione di cassa',
      apply(state, stats) {
        const cash = Math.floor(Math.max(stats.incomePerSec * 36, stats.tapValue * 55, 420 * stats.leagueMult) * stats.research.eventCashMult);
        addMoney(state, cash);
        return `Valigetta incassata al volo! +${formatMoney(cash)}!`;
      },
    },
    optionB: {
      label: 'B) Rifiuta con stile da Lord',
      sub: '+2 🪙 & Boost ×2 per 35s',
      apply(state, stats) {
        const tok = 2 + stats.research.eventExtraTokens;
        addGoldTokens(state, tok);
        activateBoost(state, 35 * 1000);
        return `La stampa ti applaude! +${tok} 🪙 e Boost ×2 per 35s!`;
      },
    },
  },
  {
    id: 'tv_interview',
    title: 'Diretta TV Lampo',
    desc: 'TeleProvincia ti mette un microfono sotto il naso. Che dichiarazione sganci?',
    optionA: {
      label: 'A) "Puntiamo allo Scudetto!"',
      sub: 'Hype ×3 incassi per 20s',
      apply(state) {
        activateInvasionBoost(state, 20 * 1000);
        return 'Biglietti polverizzati dall\'entusiasmo! Incassi ×3 per 20s!';
      },
    },
    optionB: {
      label: 'B) "Chiediamo contributi al Comune"',
      sub: '+3 🪙 Gettoni d\'Oro',
      apply(state, stats) {
        const tok = 3 + stats.research.eventExtraTokens;
        addGoldTokens(state, tok);
        return `Il Sindaco si commuove e firma! +${tok} 🪙 Gettoni d'Oro!`;
      },
    },
  },
  {
    id: 'friendly_match',
    title: 'Amichevole di Beneficenza',
    desc: 'Una squadra di vecchie glorie locali chiede di giocare sul nostro campo.',
    optionA: {
      label: 'A) Incasso biglietti al botteghino',
      sub: 'Premio cassa + 1 🪙',
      apply(state, stats) {
        const cash = Math.floor(Math.max(stats.incomePerSec * 22, stats.tapValue * 35, 260 * stats.leagueMult) * stats.research.eventCashMult);
        const tok = 1 + stats.research.eventExtraTokens;
        addMoney(state, cash);
        addGoldTokens(state, tok);
        return `Stadio in festa! +${formatMoney(cash)} e +${tok} 🪙!`;
      },
    },
    optionB: {
      label: 'B) Chiedi consigli segreti agli osservatori',
      sub: '+1 Busta Oratorio Gratis & +1 🪙',
      apply(state, stats) {
        state.freePacks.oratorio = (state.freePacks.oratorio || 0) + 1;
        const tok = 1 + stats.research.eventExtraTokens;
        addGoldTokens(state, tok);
        return `Che dritta! +1 Busta Oratorio GRATIS e +${tok} 🪙!`;
      },
    },
  },
];

export function pickRandomDilemma() {
  return PRESIDENT_DILEMMAS[Math.floor(Math.random() * PRESIDENT_DILEMMAS.length)];
}
