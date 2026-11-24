import { UPGRADES, MILESTONE_LEVELS } from './config.js';
import { formatMoney, formatNumber } from './format.js';
import {
  computeStats,
  getChecklistStatus,
  getPendingPrestigeShares,
  canPrestige,
  canStartNewSeason,
  getUpgradeLevel,
  isUpgradeUnlocked,
  addMoney,
  activateBoost,
  activateInvasionBoost,
} from './state.js';
import { PERMANENT_RESEARCHES, getResearchCost } from './research.js';

export const TUTORIAL_DONE_STEP = 6;

// Mini avatar rotondo per il pulsante nella barra superiore dello stadio
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
      <path d="M12 60 C14 47 22 44 32 44 C42 44 50 47 52 60 Z" fill="#1e293b"/>
      <polygon points="27,44 37,44 32,57" fill="#f8fafc"/>
      <polygon points="30,46 34,46 35,58 32,61 29,58" fill="${clubPrimary}"/>
      <path d="M24 46 L32 54 L40 46" fill="none" stroke="#94a3b8" stroke-width="1.6"/>
      <ellipse cx="32" cy="54.5" rx="3.4" ry="2.2" fill="#e2e8f0" stroke="#0f172a" stroke-width="0.9"/>
      <circle cx="32" cy="27" r="14" fill="#fdba74"/>
      <path d="M18 25 C18 14 25 11 32 11 C39 11 46 14 46 25 C43 19 38 17 32 17 C26 17 21 19 18 25 Z" fill="#64748b"/>
      <rect x="21" y="23" width="9.5" height="6.8" rx="2.5" fill="rgba(255,255,255,0.22)" stroke="#0f172a" stroke-width="1.8"/>
      <rect x="33.5" y="23" width="9.5" height="6.8" rx="2.5" fill="rgba(255,255,255,0.22)" stroke="#0f172a" stroke-width="1.8"/>
      <line x1="30.5" y1="26" x2="33.5" y2="26" stroke="#0f172a" stroke-width="1.8"/>
      <circle cx="25.8" cy="26.4" r="1.4" fill="#0f172a"/>
      <circle cx="38.2" cy="26.4" r="1.4" fill="#0f172a"/>
      <path d="M22 35 C25 31.5 29.5 32 32 34 C34.5 32 39 31.5 42 35 C38.5 36.5 34.5 36.2 32 35 C29.5 36.2 25.5 36.5 22 35 Z" fill="#475569"/>
      <path d="M28 37.5 Q32 40 36 37.5" fill="none" stroke="#7c2d12" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  `;
}

/**
 * v4.0: Ritratto illustrato a MEZZO BUSTO animato di Gino il DS (3 espressioni: happy | serious | hype).
 * Animazioni pilotate via CSS (.gino-torso, .gino-head, .gino-eyes, .gino-mouth-group, .gino-hand-board).
 */
export function getGinoBustSvg(clubPrimary = '#dc2626', clubSecondary = '#f8fafc', expression = 'happy') {
  const brows =
    expression === 'serious'
      ? `
        <path d="M51 39 L64 42" stroke="#334155" stroke-width="2.8" stroke-linecap="round"/>
        <path d="M89 39 L76 42" stroke="#334155" stroke-width="2.8" stroke-linecap="round"/>
      `
      : expression === 'hype'
        ? `
          <path d="M50 38 Q57 32 64 36" fill="none" stroke="#334155" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M76 36 Q83 32 90 38" fill="none" stroke="#334155" stroke-width="2.6" stroke-linecap="round"/>
        `
        : `
          <path d="M51 40 Q57 36 63 39" fill="none" stroke="#334155" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M77 39 Q83 36 89 40" fill="none" stroke="#334155" stroke-width="2.4" stroke-linecap="round"/>
        `;

  const mouth =
    expression === 'serious'
      ? `<path d="M64 68 Q70 67 76 68" fill="none" stroke="#7c2d12" stroke-width="2.2" stroke-linecap="round"/>`
      : expression === 'hype'
        ? `
          <path d="M61 65 Q70 76 79 65 Z" fill="#7f1d1d" stroke="#450a0a" stroke-width="1.3"/>
          <path d="M64 66 Q70 69 76 66" fill="#ffffff"/>
        `
        : `<path d="M62 66 Q70 72.5 78 66" fill="none" stroke="#7c2d12" stroke-width="2.3" stroke-linecap="round"/>`;

  const sparkles =
    expression === 'hype'
      ? `
        <g class="gino-hype-stars" fill="#fde047">
          <path d="M22 22 L24 27 L29 29 L24 31 L22 36 L20 31 L15 29 L20 27 Z"/>
          <path d="M114 26 L115.5 30 L119.5 31.5 L115.5 33 L114 37 L112.5 33 L108.5 31.5 L112.5 30 Z"/>
        </g>
      `
      : '';

  return `
    <svg viewBox="0 0 132 146" class="gino-bust-svg expr-${expression}" aria-hidden="true">
      <defs>
        <linearGradient id="ginoSuit" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#334155"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="ginoSkin" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#fed7aa"/>
          <stop offset="100%" stop-color="#f59e6b"/>
        </linearGradient>
      </defs>

      ${sparkles}

      <!-- TORSO & GIACCA (respiro morbido CSS) -->
      <g class="gino-torso">
        <!-- Spalle e giacca da DS -->
        <path d="M24 146 C26 105 42 86 70 86 C98 86 116 105 118 146 Z" fill="url(#ginoSuit)" stroke="#020617" stroke-width="2.2"/>
        <!-- Risvolti giacca -->
        <path d="M51 87 L68 124 L56 127 L44 96 Z" fill="#1e293b"/>
        <path d="M89 87 L72 124 L84 127 L96 96 Z" fill="#1e293b"/>
        <!-- Camicia bianca -->
        <polygon points="56,86 84,86 70,122" fill="#f8fafc"/>
        <!-- Cravatta nei colori del club -->
        <polygon points="66,89 74,89 76,120 70,130 64,120" fill="${clubPrimary}" stroke="#0f172a" stroke-width="1"/>
        <polygon points="65.5,98 74.5,95 75,101 65,104" fill="${clubSecondary}" opacity="0.92"/>
        <polygon points="65,110 75,107 75.5,113 64.5,116" fill="${clubSecondary}" opacity="0.92"/>
        <!-- Fazzoletto nel taschino nei colori del club -->
        <polygon points="91,111 101,106 104,114 91,115" fill="${clubPrimary}"/>
        <!-- Laccio e fischietto d'argento -->
        <path d="M55 88 Q70 107 85 88" fill="none" stroke="#cbd5e1" stroke-width="2"/>
        <g transform="translate(70 106)">
          <ellipse cx="0" cy="0" rx="5.5" ry="3.8" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.3"/>
          <rect x="3" y="-2" width="5" height="3.2" rx="1" fill="#cbd5e1" stroke="#0f172a" stroke-width="1"/>
          <circle cx="-1.2" cy="0" r="1.3" fill="#475569"/>
        </g>

        <!-- TESTA ESPRESSIVA -->
        <g class="gino-head">
          <!-- Collo -->
          <rect x="61" y="73" width="18" height="16" rx="6" fill="#eab38c"/>
          <!-- Orecchie -->
          <circle cx="43" cy="51" r="6" fill="#f59e6b" stroke="#7c2d12" stroke-width="1"/>
          <circle cx="97" cy="51" r="6" fill="#f59e6b" stroke="#7c2d12" stroke-width="1"/>
          <!-- Viso -->
          <ellipse cx="70" cy="50" rx="26" ry="27" fill="url(#ginoSkin)" stroke="#7c2d12" stroke-width="1.3"/>
          <!-- Guanciotte calde -->
          <ellipse cx="52" cy="57" rx="4.8" ry="2.8" fill="#fb7185" opacity="0.28"/>
          <ellipse cx="88" cy="57" rx="4.8" ry="2.8" fill="#fb7185" opacity="0.28"/>

          <!-- Capelli brizzolati da DS d'esperienza -->
          <path d="M43 46 C42 25 54 18 70 18 C86 18 98 25 97 46 C93 34 83 29 70 29 C57 29 47 34 43 46 Z" fill="#64748b" stroke="#1e293b" stroke-width="1.3"/>
          <path d="M52 24 Q64 20 75 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" opacity="0.7"/>

          ${brows}

          <!-- Occhi + battito ciglia -->
          <g class="gino-eyes">
            <circle cx="58" cy="49" r="3.1" fill="#0f172a"/>
            <circle cx="82" cy="49" r="3.1" fill="#0f172a"/>
            <circle cx="56.8" cy="47.8" r="1.1" fill="#ffffff"/>
            <circle cx="80.8" cy="47.8" r="1.1" fill="#ffffff"/>
          </g>

          <!-- Occhiali iconici con riflesso -->
          <g>
            <rect x="48" y="42.5" width="19" height="13" rx="4.2" fill="rgba(224,242,254,0.22)" stroke="#0f172a" stroke-width="2.2"/>
            <rect x="73" y="42.5" width="19" height="13" rx="4.2" fill="rgba(224,242,254,0.22)" stroke="#0f172a" stroke-width="2.2"/>
            <line x1="67" y1="48.5" x2="73" y2="48.5" stroke="#0f172a" stroke-width="2.2"/>
            <line x1="51" y1="45" x2="55" y2="45" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.75"/>
            <line x1="76" y1="45" x2="80" y2="45" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.75"/>
          </g>

          <!-- Naso -->
          <path d="M70 50 Q73 55 68 57" fill="none" stroke="#c26d3d" stroke-width="1.8" stroke-linecap="round"/>

          <!-- Bocca e baffi folti (si muovono quando parla!) -->
          <g class="gino-mouth-group">
            ${mouth}
            <path d="M51 62.5 C56 56.5 64.5 57.2 70 60.5 C75.5 57.2 84 56.5 89 62.5 C83 66 75 65.2 70 62.8 C65 65.2 57 66 51 62.5 Z" fill="#475569" stroke="#1e293b" stroke-width="1.1"/>
          </g>
        </g>

        <!-- MANO & LAVAGNETTA TATTICA CHE GESTICOLA -->
        <g class="gino-hand-board">
          <!-- Lavagnetta tattica verde -->
          <g transform="translate(8 78) rotate(-10)">
            <rect x="0" y="0" width="32" height="40" rx="4" fill="#14532d" stroke="#e2e8f0" stroke-width="2.2"/>
            <rect x="9" y="-4" width="14" height="6" rx="2" fill="#94a3b8" stroke="#0f172a" stroke-width="1"/>
            <!-- Schemino tattico X/O -->
            <line x1="4" y1="20" x2="28" y2="20" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>
            <circle cx="16" cy="20" r="4.5" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>
            <circle cx="10" cy="11" r="2.2" fill="#fde047"/>
            <circle cx="22" cy="12" r="2.2" fill="#fde047"/>
            <path d="M12 28 Q17 22 22 15" fill="none" stroke="#38bdf8" stroke-width="1.6" stroke-dasharray="2 2"/>
          </g>
          <!-- Mano che regge la lavagnetta -->
          <ellipse cx="32" cy="112" rx="7.5" ry="6.2" fill="#fdba74" stroke="#7c2d12" stroke-width="1.2"/>
        </g>
      </g>
    </svg>
  `;
}

export const TUTORIAL_STEPS = [
  {
    step: 0,
    expression: 'happy',
    title: 'Passo 1/6 — Incassa sul Campo!',
    text: 'Benvenuto Presidente! Sono Gino il DS. Tocca il prato 5 volte per far rimbalzare il pallone e raccogliere i primi fondi (e guarda Polpetta a bordocampo)!',
    targetTab: null,
    manualAdvance: false,
  },
  {
    step: 1,
    expression: 'happy',
    title: 'Passo 2/6 — Club & Milestone ×2',
    text: 'Ottimo tocco! Apri la tab Club e compra il tuo primo potenziamento: comparirà sullo stadio! Ricorda: a Lv.10, 25, 50 e 100 ogni upgrade raddoppia (×2)!',
    targetTab: 'club',
    manualAdvance: false,
  },
  {
    step: 2,
    expression: 'hype',
    title: 'Passo 3/6 — Scouting & Buste',
    text: 'Appena hai €250, apri Scouting e spacchetta la tua prima Busta Oratorio: puoi pescare campioni fino a Leggenda e persino 4 rarissime Leggende Segrete!',
    targetTab: 'scouting',
    manualAdvance: false,
  },
  {
    step: 3,
    expression: 'serious',
    title: 'Passo 4/6 — Formazione 5 Titolari',
    text: 'Occhio alla tattica: SOLO i 5 titolari schierati (POR, DIF, CEN, 2 ATT) danno bonus e Forza Rosa! In Panchina puoi Fondere i doppioni (★+1) o Venderli.',
    targetTab: 'scouting',
    manualAdvance: true,
    manualBtnLabel: 'Chiaro! Avanti →',
  },
  {
    step: 4,
    expression: 'hype',
    title: 'Passo 5/6 — Spareggio 0\'–90\'',
    text: 'Nella tab Spareggio completa la Checklist 3/3 (Incassi, Forza Titolari, Infrastrutture) e gioca il match da 28s: ferma l\'anello TIRA! sul verde e para PARA!!',
    targetTab: 'spareggio',
    manualAdvance: true,
    manualBtnLabel: 'Pronto! Ultimo passo →',
  },
  {
    step: 5,
    expression: 'happy',
    title: 'Passo 6/6 — Sfide, Gettoni & Prestige',
    text: 'I Gettoni d\'Oro (🪙) sono rari e preziosi: completare le 8 Sfide del Presidente è il modo migliore per ottenerli e sbloccare le 12 Ricerche Permanenti in Società!',
    targetTab: 'societa',
    manualAdvance: true,
    manualBtnLabel: 'Iniziamo Presidente! 🏆',
  },
];

export function evaluateTutorialProgress(state) {
  if ((state.tutorialStep ?? TUTORIAL_DONE_STEP) >= TUTORIAL_DONE_STEP) return false;
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
  return changed;
}

/**
 * Risolve elemento DOM bersaglio + micro-etichetta per Spotlight & Freccia animata (pointer-events: none).
 */
export function getTutorialPointerTarget(state, activeTab) {
  const step = state.tutorialStep ?? TUTORIAL_DONE_STEP;
  if (step >= TUTORIAL_DONE_STEP) return null;

  if (step === 0) {
    return {
      id: 'step0_canvas',
      el: document.getElementById('stadium-canvas'),
      label: 'Tocca 5 volte!',
      anchor: 'center',
      inScroll: false,
    };
  }

  if (step === 1) {
    if (activeTab !== 'club') {
      return {
        id: 'step1_tab_club',
        el: document.querySelector('.tab-btn[data-tab="club"]'),
        label: 'Apri Club!',
        anchor: 'top',
        inScroll: false,
      };
    }
    const firstBuyBtn = document.querySelector('#tab-content button[data-upgrade-id]');
    return firstBuyBtn
      ? { id: 'step1_buy_upg', el: firstBuyBtn, label: 'Compra!', anchor: 'top', inScroll: true }
      : null;
  }

  if (step === 2) {
    if (activeTab !== 'scouting') {
      return {
        id: 'step2_tab_scouting',
        el: document.querySelector('.tab-btn[data-tab="scouting"]'),
        label: 'Apri Scouting!',
        anchor: 'top',
        inScroll: false,
      };
    }
    const packBtn = document.querySelector('#tab-content button[data-pack-id="oratorio"]');
    return packBtn
      ? { id: 'step2_open_pack', el: packBtn, label: 'Apri Busta!', anchor: 'top', inScroll: true }
      : null;
  }

  if (step === 3) {
    if (activeTab !== 'scouting') {
      return {
        id: 'step3_tab_scouting',
        el: document.querySelector('.tab-btn[data-tab="scouting"]'),
        label: 'Vedi Formazione!',
        anchor: 'top',
        inScroll: false,
      };
    }
    const formCard = document.querySelector('#tab-content .formation-card');
    return formCard
      ? { id: 'step3_formation', el: formCard, label: '5 Titolari!', anchor: 'top', inScroll: true }
      : null;
  }

  if (step === 4) {
    if (activeTab !== 'spareggio') {
      return {
        id: 'step4_tab_spareggio',
        el: document.querySelector('.tab-btn[data-tab="spareggio"]'),
        label: 'Vai in Spareggio!',
        anchor: 'top',
        inScroll: false,
      };
    }
    const startBtn = document.getElementById('btn-start-match');
    if (startBtn && !startBtn.disabled) {
      return { id: 'step4_start', el: startBtn, label: 'Gioca!', anchor: 'top', inScroll: true };
    }
    const checklist = document.querySelector('#tab-content .checklist-box');
    return checklist
      ? { id: 'step4_checklist', el: checklist, label: 'Checklist 3/3!', anchor: 'top', inScroll: true }
      : null;
  }

  if (step === 5) {
    if (activeTab !== 'societa') {
      return {
        id: 'step5_tab_societa',
        el: document.querySelector('.tab-btn[data-tab="societa"]'),
        label: 'Scopri Ricerche!',
        anchor: 'top',
        inScroll: false,
      };
    }
    const resCard = document.querySelector('#tab-content .research-group-title');
    return resCard
      ? { id: 'step5_research', el: resCard, label: '12 Ricerche!', anchor: 'top', inScroll: true }
      : null;
  }

  return null;
}

const LEAGUE_BANTER = [
  'In Terza Categoria il pallone pesa tre chili quando piove, ma il cuore non si bagna mai!',
  'Con la tribunetta in cemento di Promozione il paninaro fa gli straordinari!',
  'Serie C: qui iniziano i numeri seri. Se il salto verso la Serie A è ripido, pensa al Prestige!',
  'Serie A! Riflettori accesi, Food Lounge VIP e il Fondo Estero che ci corteggia.',
  'Notte Europea: siamo tra i giganti del continente! Punta al Mondiale per Club!',
  'Mondiale per Club! Tutto il pianeta guarda il nostro stadio dorato e Polpetta impazzisce!',
  'Superlega Galattica: siamo nell\'olimpo cosmico del calcio! Conquista la Coppa per la Stella d\'Oro ★!',
];

export function getGinoDynamicTip(state) {
  const stats = computeStats(state);
  const check = getChecklistStatus(state);

  if (canStartNewSeason(state)) {
    return {
      urgent: true,
      expression: 'hype',
      title: `Stagione ${(state.seasonNumber || 1) + 1} Sbloccata!`,
      text: 'Presidente, abbiamo vinto la Superlega Galattica! Vai in Spareggio per avviare la Nuova Stagione con +1 ★ Stella d\'Oro (×2 permanente) e +25 🪙!',
      ctaTab: 'spareggio',
      ctaLabel: 'Nuova Stagione ★',
    };
  }

  if (check.allReady && !state.seasonCompleted) {
    return {
      urgent: true,
      expression: 'hype',
      title: 'Spareggio Sbloccato!',
      text: 'Presidente, la Checklist 3/3 è completa! Vai in Spareggio, scegli la tattica e scendi in campo!',
      ctaTab: 'spareggio',
      ctaLabel: 'Vai allo Spareggio',
    };
  }

  if (canPrestige(state)) {
    const pending = getPendingPrestigeShares(state);
    if (pending >= 4 && state.leagueIndex >= 2) {
      const gainPct = pending * stats.research.shareBonusPct;
      return {
        urgent: true,
        expression: 'serious',
        title: 'Mossa da Tycoon: Prestige!',
        text: `Puoi vendere al Fondo Estero per +${pending} Azioni (+${gainPct}% permanente)! Ripartirai come un razzo sfondando il muro.`,
        ctaTab: 'societa',
        ctaLabel: 'Vedi Prestige',
      };
    }
  }

  const affordableRes = PERMANENT_RESEARCHES.find((r) => {
    const cost = getResearchCost(state, r);
    return cost !== null && (state.goldTokens || 0) >= cost;
  });
  if (affordableRes) {
    return {
      urgent: true,
      expression: 'happy',
      title: 'Gettoni d\'Oro da Investire!',
      text: `Hai ${state.goldTokens} 🪙! In Società → Ricerche Permanenti puoi potenziare "${affordableRes.name}" per sempre.`,
      ctaTab: 'societa',
      ctaLabel: 'Apri Ricerche',
    };
  }

  for (const upg of UPGRADES) {
    if (!isUpgradeUnlocked(state, upg)) continue;
    const lvl = getUpgradeLevel(state, upg.id);
    if (lvl <= 0) continue;
    for (const m of MILESTONE_LEVELS) {
      if (lvl >= m - 2 && lvl < m) {
        return {
          urgent: false,
          expression: 'happy',
          title: 'Milestone ×2 Vicina!',
          text: `Porta "${upg.name}" a Lv.${m} (mancano ${m - lvl} liv.) per raddoppiare (×2) subito la sua resa!`,
          ctaTab: 'club',
          ctaLabel: 'Vai al Club',
        };
      }
    }
  }

  if (!check.squadPower.done) {
    return {
      urgent: false,
      expression: 'serious',
      title: 'Serve Forza Titolari!',
      text: `Per lo Spareggio ti manca Forza Titolari (⚡${formatNumber(check.squadPower.current)} / ⚡${formatNumber(check.squadPower.target)}). Apri buste o fondi in panchina!`,
      ctaTab: 'scouting',
      ctaLabel: 'Vai in Scouting',
    };
  }
  if (!check.infra.done) {
    return {
      urgent: false,
      expression: 'serious',
      title: 'Potenzia le Infrastrutture',
      text: `Mancano ${check.infra.target - check.infra.current} livelli upgrade Club per sbloccare il prossimo Spareggio!`,
      ctaTab: 'club',
      ctaLabel: 'Vai al Club',
    };
  }
  if (!check.cash.done) {
    return {
      urgent: false,
      expression: 'happy',
      title: 'Obiettivo Cassa Categoria',
      text: `Accumula ancora ${formatMoney(check.cash.target - check.cash.current)} per sbloccare il match promozione!`,
      ctaTab: null,
      ctaLabel: null,
    };
  }

  return {
    urgent: false,
    expression: 'happy',
    title: 'Parola di Gino il DS',
    text: LEAGUE_BANTER[state.leagueIndex] || LEAGUE_BANTER[0],
    ctaTab: null,
    ctaLabel: null,
  };
}

// Dilemmi Lampo A/B di Gino il DS (v4.0: zero 🪙 per scarsità reale -> cassa/boost/buste potenziati!)
export const PRESIDENT_DILEMMAS = [
  {
    id: 'salamelle_emergency',
    title: 'Emergenza Salamelle!',
    desc: 'Il paninaro ha finito il pane a metà partita ma la fila è chilometrica. Come reagiamo Presidente?',
    optionA: {
      label: 'A) Alza i prezzi "Edizione Limitata"',
      sub: 'Maxi incasso immediato in cassa',
      apply(state, stats) {
        const cash = Math.floor(
          Math.max(stats.incomePerSec * 38, stats.tapValue * 60, 420 * stats.leagueMult) *
            stats.research.eventCashMult
        );
        addMoney(state, cash);
        return `Tifosi affamati pagano oro! +${formatMoney(cash)} in cassa!`;
      },
    },
    optionB: {
      label: 'B) Offri birretta gratis alla Curva',
      sub: 'Hype Curva ×3 incassi per 22s!',
      apply(state, stats) {
        const durSec = 22 + (stats.research.eventDurationBonusSec || 0);
        activateInvasionBoost(state, durSec * 1000);
        return `La Curva impazzisce d'amore! Incassi ×3 per ${durSec}s!`;
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
        const cash = Math.floor(
          Math.max(stats.incomePerSec * 48, stats.tapValue * 75, 560 * stats.leagueMult) *
            stats.research.eventCashMult
        );
        addMoney(state, cash);
        return `Valigetta incassata al volo! +${formatMoney(cash)}!`;
      },
    },
    optionB: {
      label: 'B) Rifiuta con stile da Lord',
      sub: 'Boost ×2 per 50s (+bonus durata)',
      apply(state, stats) {
        const durSec = 50 + (stats.research.eventDurationBonusSec || 0);
        activateBoost(state, durSec * 1000);
        return `La stampa ti applaude! Boost ×2 attivo per ${durSec}s!`;
      },
    },
  },
  {
    id: 'tv_interview',
    title: 'Diretta TV Lampo',
    desc: 'TeleProvincia ti mette un microfono sotto il naso. Che dichiarazione sganci?',
    optionA: {
      label: 'A) "Puntiamo allo Scudetto!"',
      sub: 'Hype ×3 incassi per 25s',
      apply(state, stats) {
        const durSec = 25 + (stats.research.eventDurationBonusSec || 0);
        activateInvasionBoost(state, durSec * 1000);
        return `Biglietti polverizzati dall'entusiasmo! Incassi ×3 per ${durSec}s!`;
      },
    },
    optionB: {
      label: 'B) "Chiediamo contributi al Comune"',
      sub: 'Busta Scouting Gratis + cassa!',
      apply(state, stats) {
        const packId = state.leagueIndex >= 2 ? 'osservatore' : 'oratorio';
        state.freePacks[packId] = (state.freePacks[packId] || 0) + 1;
        const cash = Math.floor(
          Math.max(stats.incomePerSec * 20, stats.tapValue * 30, 260 * stats.leagueMult) *
            stats.research.eventCashMult
        );
        addMoney(state, cash);
        return `Il Sindaco firma! +1 Busta ${packId === 'osservatore' ? 'Osservatore' : 'Oratorio'} GRATIS e +${formatMoney(cash)}!`;
      },
    },
  },
  {
    id: 'friendly_match',
    title: 'Amichevole di Beneficenza',
    desc: 'Una squadra di vecchie glorie locali chiede di giocare sul nostro campo.',
    optionA: {
      label: 'A) Incasso biglietti al botteghino',
      sub: 'Premio cassa + Boost ×2 (30s)',
      apply(state, stats) {
        const cash = Math.floor(
          Math.max(stats.incomePerSec * 30, stats.tapValue * 48, 360 * stats.leagueMult) *
            stats.research.eventCashMult
        );
        const durSec = 30 + (stats.research.eventDurationBonusSec || 0);
        addMoney(state, cash);
        activateBoost(state, durSec * 1000);
        return `Stadio in festa! +${formatMoney(cash)} e Boost ×2 per ${durSec}s!`;
      },
    },
    optionB: {
      label: 'B) Chiedi consigli segreti agli osservatori',
      sub: '+1 Busta Oratorio Gratis & cassa',
      apply(state, stats) {
        state.freePacks.oratorio = (state.freePacks.oratorio || 0) + 1;
        const cash = Math.floor(
          Math.max(stats.incomePerSec * 16, stats.tapValue * 24, 200 * stats.leagueMult) *
            stats.research.eventCashMult
        );
        addMoney(state, cash);
        return `Che dritta! +1 Busta Oratorio GRATIS e +${formatMoney(cash)}!`;
      },
    },
  },
];

export function pickRandomDilemma() {
  return PRESIDENT_DILEMMAS[Math.floor(Math.random() * PRESIDENT_DILEMMAS.length)];
}
