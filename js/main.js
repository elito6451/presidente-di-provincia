import { AUTO_SAVE_INTERVAL_MS } from './config.js';
import { formatMoney, escapeHTML } from './format.js';
import {
  addMoney,
  computeStats,
  performTap,
  buyUpgradeBulk,
  activateBoost,
  performPrestige,
  resetStateInPlace,
  getPackCost,
  getPendingPrestigeShares,
  setSelectedTactic,
  setClubCustomization,
} from './state.js';
import { buyResearch } from './research.js';
import {
  loadGame,
  saveGame,
  exportSaveBase64,
  importSaveBase64,
  clearSavedGame,
} from './storage.js';
import { audio } from './audio.js';
import { openPack, getTopFivePlayers } from './gacha.js';
import { SpareggioController } from './match.js';
import { FlashEventManager } from './events.js';
import {
  getGinoAvatarSvg,
  TUTORIAL_STEPS,
  evaluateTutorialProgress,
  getTutorialPointerTarget,
  getGinoDynamicTip,
} from './assistant.js';
import { CutsceneManager } from './cutscenes.js';
import { StadiumCanvas } from './canvas/stadium.js';
import { HudController } from './ui/hud.js';
import { TabsController } from './ui/tabs.js';
import { ModalManager } from './ui/modals.js';

// 1. Carica salvataggio (migrazione trasparente v1/v2/v2.5 -> v3.0)
const { state, offline } = loadGame();
audio.setMusicEnabled(state.musicEnabled);
audio.setSfxEnabled(state.sfxEnabled);

const matchCtrl = new SpareggioController();
const flashEvents = new FlashEventManager();
const modals = new ModalManager();
const cutscenes = new CutsceneManager();
const hud = new HudController();

let stadium = null;
let tabs = null;
let ginoTipOpen = false;
let tutorialBubbleDismissedStep = -1;

const elAppShell = document.getElementById('app-shell');
const elGinoTopBtn = document.getElementById('btn-gino-top');
const elGinoTopAvatar = document.getElementById('gino-top-avatar');
const elGinoDot = document.getElementById('gino-dot');
const elGinoBubble = document.getElementById('gino-bubble');
const elTutorialPointer = document.getElementById('tutorial-pointer');

const POINTER_ARROW_SVG = `<svg class="tutorial-pointer-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21 4.5 12h4.7V3h5.6v9h4.7L12 21Z"/></svg>`;

function getClubInfo() {
  return {
    name: state.clubName,
    primary: state.clubColors.primary,
    secondary: state.clubColors.secondary,
  };
}

function syncSquadOnPitch() {
  if (stadium) {
    stadium.syncTopPlayers(getTopFivePlayers(state.roster));
  }
}

function updateTutorialPointer() {
  if (!elTutorialPointer || !elAppShell) return;
  const inTutorial = (state.tutorialStep ?? 4) < 4;
  const bubbleVisible = elGinoBubble && !elGinoBubble.classList.contains('hidden');

  // Mostra la freccia animata SOLO durante il tutorial dopo aver chiuso il fumetto (e fuori partita)
  if (!inTutorial || bubbleVisible || matchCtrl.active || !tabs) {
    elTutorialPointer.classList.add('hidden');
    return;
  }

  const target = getTutorialPointerTarget(state, tabs.activeTab);
  if (!target || !target.el) {
    elTutorialPointer.classList.add('hidden');
    return;
  }

  const shellRect = elAppShell.getBoundingClientRect();
  const rect = target.el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    elTutorialPointer.classList.add('hidden');
    return;
  }

  // Nascondi se l'elemento target è fuori dalla viewport visibile dello scroll
  if (rect.bottom < shellRect.top + 20 || rect.top > shellRect.bottom - 10) {
    elTutorialPointer.classList.add('hidden');
    return;
  }

  let relX = rect.left + rect.width * 0.5 - shellRect.left;
  let relY = target.anchor === 'center'
    ? rect.top + rect.height * 0.54 - shellRect.top
    : rect.top - shellRect.top - 4;

  // Clamp orizzontale comodo per non uscire mai dai bordi su 390px
  relX = Math.max(54, Math.min(shellRect.width - 54, relX));

  let below = false;
  if (relY < 58) {
    relY = rect.bottom - shellRect.top + 4;
    below = true;
  }

  elTutorialPointer.classList.toggle('below', below);
  elTutorialPointer.style.left = `${relX.toFixed(1)}px`;
  elTutorialPointer.style.top = `${relY.toFixed(1)}px`;

  if (elTutorialPointer.dataset.label !== target.label) {
    elTutorialPointer.dataset.label = target.label;
    elTutorialPointer.innerHTML = `
      <span class="tutorial-pointer-pill">${escapeHTML(target.label)}</span>
      ${POINTER_ARROW_SVG}
    `;
  }
  elTutorialPointer.classList.remove('hidden');
}

function renderGinoAssistant() {
  if (elGinoTopAvatar) {
    elGinoTopAvatar.innerHTML = getGinoAvatarSvg(state.clubColors.primary);
  }

  if (matchCtrl.active) {
    elGinoBubble?.classList.add('hidden');
    elTutorialPointer?.classList.add('hidden');
    return;
  }

  const inTutorial = (state.tutorialStep ?? 4) < 4;
  if (inTutorial) {
    elGinoDot?.classList.remove('hidden');
    const shouldShowBubble = tutorialBubbleDismissedStep !== state.tutorialStep;

    if (shouldShowBubble) {
      const stepDef = TUTORIAL_STEPS[state.tutorialStep] || TUTORIAL_STEPS[0];
      elGinoBubble.innerHTML = `
        <div class="gino-bubble-head">
          <span class="gino-bubble-mini">${getGinoAvatarSvg(state.clubColors.primary)}</span>
          <div class="gino-dock-title">${escapeHTML(stepDef.title)}</div>
        </div>
        <div class="gino-dock-text">${escapeHTML(stepDef.text)}</div>
        <div class="gino-dock-actions">
          <button type="button" class="mini-btn primary" id="btn-gino-ok">Capito!</button>
          <button type="button" class="mini-btn" id="btn-gino-skip">Salta Tutorial</button>
        </div>
      `;
      elGinoBubble.classList.remove('hidden');

      const dismissBubble = () => {
        tutorialBubbleDismissedStep = state.tutorialStep;
        elGinoBubble.classList.add('hidden');
        updateTutorialPointer();
      };

      elGinoBubble.onclick = (e) => {
        if (e.target.closest('#btn-gino-skip')) return;
        dismissBubble();
      };
      elGinoBubble.querySelector('#btn-gino-ok')?.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissBubble();
      });
      elGinoBubble.querySelector('#btn-gino-skip')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.tutorialStep = 4;
        tutorialBubbleDismissedStep = 4;
        saveGame(state);
        renderGinoAssistant();
      });
    } else {
      elGinoBubble.classList.add('hidden');
    }

    updateTutorialPointer();
    return;
  }

  // Post-tutorial: avatar in barra alta + pallino luminoso quando Gino ha un consiglio mirato
  const tip = getGinoDynamicTip(state);
  elGinoDot?.classList.toggle('hidden', !tip.urgent);
  elTutorialPointer?.classList.add('hidden');

  if (ginoTipOpen) {
    elGinoBubble.innerHTML = `
      <div class="gino-bubble-head">
        <span class="gino-bubble-mini">${getGinoAvatarSvg(state.clubColors.primary)}</span>
        <div class="gino-dock-title">Gino il DS — ${escapeHTML(tip.title)}</div>
      </div>
      <div class="gino-dock-text">${escapeHTML(tip.text)}</div>
      <div class="gino-dock-actions">
        ${tip.ctaTab ? `<button type="button" class="mini-btn primary" id="btn-gino-cta" data-goto="${tip.ctaTab}">${escapeHTML(tip.ctaLabel)}</button>` : ''}
        <button type="button" class="mini-btn" id="btn-gino-close">Capito!</button>
      </div>
    `;
    elGinoBubble.classList.remove('hidden');

    const closeTip = () => {
      ginoTipOpen = false;
      elGinoBubble.classList.add('hidden');
    };

    elGinoBubble.onclick = (e) => {
      if (e.target.closest('#btn-gino-cta')) return;
      closeTip();
    };
    elGinoBubble.querySelector('#btn-gino-cta')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ginoTipOpen = false;
      tabs.switchTo(e.currentTarget.dataset.goto);
      renderGinoAssistant();
    });
    elGinoBubble.querySelector('#btn-gino-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTip();
    });
  } else {
    elGinoBubble.classList.add('hidden');
  }
}

elGinoTopBtn?.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  if ((state.tutorialStep ?? 4) < 4) {
    // Riapri o richiudi il fumetto del passo tutorial corrente
    if (tutorialBubbleDismissedStep === state.tutorialStep) {
      tutorialBubbleDismissedStep = -1;
    } else {
      tutorialBubbleDismissedStep = state.tutorialStep;
    }
  } else {
    ginoTipOpen = !ginoTipOpen;
  }
  renderGinoAssistant();
});

function refreshFullUI() {
  evaluateTutorialProgress(state);
  hud.update(state, matchCtrl);
  tabs.render(state, matchCtrl);
  syncSquadOnPitch();
  renderGinoAssistant();
}

function finalizeMatchOutcome(outcome) {
  modals.hidePenaltyDock();
  audio.stopStadiumAmbience();
  audio.fadeMusicForMatch(false);
  audio.playWhistle('fulltime');

  if (outcome.won) {
    audio.playGoal();
    stadium.celebratePromotion(state.leagueIndex === 4 || outcome.finalCup);
  } else {
    audio.playMiss();
  }
  saveGame(state);

  const showResult = () => {
    modals.showMatchResult(outcome, state.clubName, () => refreshFullUI());
    refreshFullUI();
  };

  // Prima Pagina "Gazzetta della Provincia" su promozione o Coppa Europea!
  if (outcome.won && (outcome.promoted || outcome.finalCup)) {
    const headline = outcome.finalCup
      ? `${state.clubName.toUpperCase()} SUL TETTO D'EUROPA!`
      : `STORICO! ${state.clubName.toUpperCase()} VOLA IN ${outcome.newLeague.name.toUpperCase()}!`;
    const subline = outcome.finalCup
      ? `Battuto ${outcome.opponent} (${outcome.myGoals}-${outcome.oppGoals})! Il Sindaco dichiara festa patronale fino a martedì!`
      : `Travolto ${outcome.opponent} (${outcome.myGoals}-${outcome.oppGoals})! Paninaro preso d'assalto, città bloccata dai clacson!`;

    cutscenes.playGazzettaFrontPage(
      { clubName: state.clubName, headline, subline, tag: 'PROMOZIONE STORICA' },
      showResult
    );
  } else {
    showResult();
  }
}

function mountPenaltyControls() {
  if (!matchCtrl.isPenalties) return;
  audio.setAmbienceIntensity(0.75);
  modals.renderPenaltyDock(matchCtrl, state, {
    onSelectCorner(corner) {
      matchCtrl.setPenaltyCorner(corner);
      mountPenaltyControls();
    },
    onShoot() {
      audio.unlock();
      const res = matchCtrl.shootPlayerPenalty(state);
      if (!res) return;
      stadium.triggerPenaltyVisual(true, res.corner, res.scored, state.leagueIndex);
      if (res.scored) audio.playGoal();
      else audio.playMiss();
      mountPenaltyControls();

      setTimeout(() => {
        if (res.matchOutcome) {
          finalizeMatchOutcome(res.matchOutcome);
        } else if (matchCtrl.isPenalties) {
          matchCtrl.advancePenaltyAfterPlayer();
          mountPenaltyControls();
        }
      }, 950);
    },
    onDive(diveCorner) {
      audio.unlock();
      const res = matchCtrl.diveForOpponentPenalty(diveCorner, state);
      if (!res) return;
      stadium.triggerPenaltyVisual(false, res.oppCorner, res.scored, state.leagueIndex);
      if (res.saved) audio.playSave();
      else if (res.scored) audio.playMiss();
      else audio.playCrossbar();
      mountPenaltyControls();

      setTimeout(() => {
        if (res.matchOutcome) {
          finalizeMatchOutcome(res.matchOutcome);
        } else if (matchCtrl.isPenalties) {
          matchCtrl.advancePenaltyAfterOpponent();
          mountPenaltyControls();
        }
      }, 950);
    },
  });
}

// 2. Canvas Stadio Vivo 2.5D
const canvasEl = document.getElementById('stadium-canvas');
stadium = new StadiumCanvas(canvasEl, {
  onPointerDown({ clickX, clickY, stageNormX, stageNormY, pitchNormX, pitchNormY, projectFn }) {
    audio.unlock();

    if (matchCtrl.isPenalties || matchCtrl.paused) return;

    // Priorità 1 durante il match: Azione Chiave (TIRA! anello precisione / PARA!)
    if (matchCtrl.isPlaying) {
      const actionHit = matchCtrl.tryHitKeyActionPx(clickX, clickY, projectFn);
      if (actionHit) {
        if (actionHit.type === 'player_goal') {
          audio.playGoal();
          audio.setAmbienceIntensity(0.9);
          stadium.triggerMatchGoal(true, state.leagueIndex);

          // Raro (~15%, max 1 volta a partita): Finto VAR comico con pausa del cronometro!
          if (!matchCtrl.varTriggeredThisMatch && matchCtrl.minute < 84 && Math.random() < 0.15) {
            matchCtrl.varTriggeredThisMatch = true;
            matchCtrl.setPaused(true);
            const stats = computeStats(state);
            const bonusCash = Math.floor(Math.max(stats.incomePerSec * 12, stats.tapValue * 25, 250 * stats.leagueMult));
            cutscenes.playComicVar({
              bonusCash,
              onGrantBonus: (cash) => addMoney(state, cash),
              onDone: () => {
                matchCtrl.setPaused(false);
                hud.update(state, matchCtrl);
              },
            });
          }
        } else if (actionHit.type === 'player_saved') {
          audio.playSave();
          audio.setAmbienceIntensity(0.2);
          stadium.triggerMatchSavedByOpponent(actionHit.nx, actionHit.ny, state.leagueIndex);
        } else if (actionHit.type === 'player_crossbar') {
          audio.playCrossbar();
          audio.setAmbienceIntensity(0.25);
          stadium.triggerMatchCrossbar(state.leagueIndex);
        } else if (actionHit.type === 'player_save') {
          audio.playSave();
          audio.setAmbienceIntensity(0.3);
          stadium.triggerMatchSave(actionHit.nx, actionHit.ny);
        }
        hud.update(state, matchCtrl);
        return;
      }
    }

    // Priorità 2 (fuori partita): Eventi Casuali sul Canvas (Flash / Invasione / Blackout)
    if (!matchCtrl.active) {
      const hit = flashEvents.tryHit({ stageNormX, stageNormY, pitchNormX, pitchNormY }, state);
      if (hit) {
        if (hit.partial) {
          audio.playTap(true);
          stadium.triggerShake(3.2, 0.1);
          stadium.entities.spawnFloatingText(pitchNormX, pitchNormY, `ANCORA ${hit.remaining}!`, {
            color: '#fde047',
            scale: 1.05,
          });
          return;
        }
        if (hit.event.kind === 'blackout') audio.playPowerOn();
        else if (hit.event.kind === 'invasion') audio.playWhistle('short');
        else audio.playFlashEvent(true);

        const parts = [];
        if (hit.label) parts.push(hit.label);
        else {
          if (hit.freePackId) parts.push('🏅 +1 Busta Gratis');
          if (hit.cash > 0) parts.push(`+${formatMoney(hit.cash)}`);
          if (hit.tokens > 0) parts.push(`+${hit.tokens} 🪙`);
        }
        const msg = parts.join(' • ');
        stadium.triggerEventHitFeedback(stageNormX, stageNormY, msg);
        modals.toast(`${hit.event.title} ${msg}`);
        refreshFullUI();
        return;
      }
    }

    // Priorità 3: Tap normale sul campo
    const { amount, isCrit } = performTap(state, {
      extraCritPct: matchCtrl.getExtraCritPct(),
    });
    audio.playTap(isCrit);

    if (matchCtrl.isPlaying) {
      const tapEv = matchCtrl.registerTap(isCrit);
      if (tapEv?.type === 'spawn_chance') {
        audio.playFlashEvent(false);
        audio.setAmbienceIntensity(0.85);
      }
    }

    const label = isCrit ? `CRIT! +${formatMoney(amount)}` : `+${formatMoney(amount)}`;
    stadium.triggerTapFeedback(pitchNormX, pitchNormY, label, isCrit, state.leagueIndex);

    if (evaluateTutorialProgress(state)) {
      renderGinoAssistant();
    }
  },
});

// 3. Tabs Controller
tabs = new TabsController({
  onTabChanged() {
    tabs.render(state, matchCtrl);
    updateTutorialPointer();
  },

  onSetBuyMode(mode) {
    state.buyMode = mode;
    saveGame(state);
    tabs.render(state, matchCtrl);
  },

  onBuyUpgrade(upgradeId) {
    audio.unlock();
    const res = buyUpgradeBulk(state, upgradeId, state.buyMode || '1x');
    if (!res.ok) return;
    audio.playBuy();
    if (res.newMilestones.length > 0) {
      const tokMsg = res.tokensAwarded > 0 ? ` e +${res.tokensAwarded} 🪙!` : '!';
      modals.toast(`🔥 Milestone Lv.${res.newMilestones.join('/')} su ${res.upgrade.name}: produzione ×2${tokMsg}`, 2800);
      stadium.entities.spawnCrowdBubble('UPGRADE ×2!', { color: '#fde047' });
    }
    evaluateTutorialProgress(state);
    saveGame(state);
    refreshFullUI();
  },

  onBuyResearch(researchId) {
    audio.unlock();
    const res = buyResearch(state, researchId);
    if (!res.ok) return;
    audio.playBuy();
    modals.toast(`🧪 ${res.research.name} salita a Lv.${res.newLevel}!`);
    saveGame(state);
    refreshFullUI();
  },

  onOpenPack(packId) {
    audio.unlock();
    const stats = computeStats(state);
    const wasDiscoveredBefore = new Set(state.discoveredSecrets || []);
    const res = openPack(state, packId, {
      getPackCostFn: getPackCost,
      stats,
    });
    if (!res.ok) return;
    saveGame(state);

    // Walkout Epico dedicato per Francesco Porcotrio & Loma!
    if (res.player.rarity === 'segreto') {
      const isFirstTime = !wasDiscoveredBefore.has(res.player.secretId);
      cutscenes.playSecretWalkout(res, {
        onShake: (i, d) => stadium.triggerShake(i, d),
        onDone: () => {
          if (isFirstTime) {
            cutscenes.playGazzettaFrontPage(
              {
                clubName: state.clubName,
                tag: 'COLPO DEL SECOLO',
                headline: `CLAMOROSO! ${res.player.name.toUpperCase()} FIRMA!`,
                subline: `Il DS Gino sviene in conferenza stampa: "${res.player.abilityName}" cambia per sempre il destino del club!`,
              },
              () => refreshFullUI()
            );
          } else {
            refreshFullUI();
          }
        },
      });
      return;
    }

    modals.showPackOpening(res, () => {
      refreshFullUI();
    });
  },

  onSelectTactic(tacticId) {
    audio.unlock();
    if (setSelectedTactic(state, tacticId)) {
      saveGame(state);
      tabs.render(state, matchCtrl);
    }
  },

  onUpdateClub({ name, primary, secondary, silentRender }) {
    setClubCustomization(state, { name, primary, secondary });
    hud.update(state, matchCtrl);
    renderGinoAssistant();
    saveGame(state);
    if (!silentRender) {
      tabs.render(state, matchCtrl);
    }
  },

  onStartMatch() {
    audio.unlock();
    if (!matchCtrl.start(state)) return;
    ginoTipOpen = false;
    audio.playWhistle('short');
    audio.fadeMusicForMatch(true);
    audio.startStadiumAmbience();
    audio.setAmbienceIntensity(0.25);
    stadium.entities.spawnCrowdBubble('DAI RAGAZZI!', { color: '#7dd3fc' });
    modals.toast(`Calcio d'inizio vs ${matchCtrl.opponent}! Ferma l'anello TIRA! sul verde!`);
    refreshFullUI();
  },

  onPrestige() {
    audio.unlock();
    const stats = computeStats(state);
    const gainedShares = getPendingPrestigeShares(state);
    const totalShares = (state.prestigeShares || 0) + gainedShares;
    const sharePct = stats.research.shareBonusPct;
    const nextMult = 1 + (totalShares * sharePct) / 100;

    modals.showPrestigeConfirm({ gainedShares, totalShares, nextMult, sharePct }, () => {
      cutscenes.playHelicopterPrestige({
        gainedShares,
        totalShares,
        stadium,
        onMidFlash: () => {
          const res = performPrestige(state);
          if (res.ok) {
            audio.playGoal();
            saveGame(state);
            refreshFullUI();
          }
        },
        onDone: () => {
          modals.toast(`🚁 Cessione completata! +${gainedShares} Azioni (Totale: ${totalShares})!`, 3000);
          refreshFullUI();
        },
      });
    });
  },

  onToggleMusic() {
    audio.unlock();
    state.musicEnabled = !state.musicEnabled;
    audio.setMusicEnabled(state.musicEnabled);
    saveGame(state);
    refreshFullUI();
  },

  onToggleSfx() {
    audio.unlock();
    state.sfxEnabled = !state.sfxEnabled;
    audio.setSfxEnabled(state.sfxEnabled);
    if (state.sfxEnabled) {
      audio.playBuy();
      if (matchCtrl.active) audio.startStadiumAmbience();
    }
    saveGame(state);
    refreshFullUI();
  },

  onExport() {
    const b64 = exportSaveBase64(state);
    modals.showExportSave(b64);
  },

  onImport() {
    modals.showImportSave((b64) => {
      try {
        const imported = importSaveBase64(b64);
        Object.assign(state, imported);
        audio.setMusicEnabled(state.musicEnabled);
        audio.setSfxEnabled(state.sfxEnabled);
        saveGame(state);
        modals.toast('Salvataggio importato (compatibile v1–v3)!');
        refreshFullUI();
        return true;
      } catch (err) {
        modals.toast(`Errore importazione: ${err.message}`);
        return false;
      }
    });
  },

  onReset() {
    modals.showResetConfirm(() => {
      audio.stopStadiumAmbience();
      audio.fadeMusicForMatch(false);
      tutorialBubbleDismissedStep = -1;
      ginoTipOpen = false;
      resetStateInPlace(state);
      clearSavedGame();
      saveGame(state);
      modals.toast('Partita azzerata.');
      refreshFullUI();
    });
  },
});

// Micro-toggle rapidi Musica & Effetti nell'intestazione Stadio
document.getElementById('btn-quick-music')?.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  state.musicEnabled = !state.musicEnabled;
  audio.setMusicEnabled(state.musicEnabled);
  saveGame(state);
  hud.update(state, matchCtrl);
  if (tabs.activeTab === 'societa') tabs.render(state, matchCtrl);
});

document.getElementById('btn-quick-sfx')?.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  state.sfxEnabled = !state.sfxEnabled;
  audio.setSfxEnabled(state.sfxEnabled);
  if (state.sfxEnabled) audio.playBuy();
  saveGame(state);
  hud.update(state, matchCtrl);
  if (tabs.activeTab === 'societa') tabs.render(state, matchCtrl);
});

// 4. Pulsante Boost x2 (Demo 5s)
document.getElementById('btn-boost')?.addEventListener('click', () => {
  audio.unlock();
  modals.showRewardedVideoDemo({
    title: 'Boost x2 — Demo Video 5s',
    rewardLabel: 'Incassi e Tap raddoppiati per 60 secondi',
    onComplete: () => {
      activateBoost(state);
      audio.playBuy();
      modals.toast('Boost x2 attivo per 60 secondi!');
      hud.update(state, matchCtrl);
    },
  });
});

// Sblocca Web Audio + avvia musica lo-fi al primo tocco
const unlockOnce = () => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
  window.removeEventListener('touchstart', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce, { passive: true });
window.addEventListener('touchstart', unlockOnce, { passive: true });

document.getElementById('tab-content')?.addEventListener(
  'scroll',
  () => updateTutorialPointer(),
  { passive: true }
);

// 5. Render iniziale & modale guadagni offline
refreshFullUI();
if (offline && offline.amount > 0) {
  modals.showOfflineEarnings(offline, {
    onClaim: (amount) => {
      audio.unlock();
      addMoney(state, amount);
      audio.playBuy();
      saveGame(state);
      refreshFullUI();
    },
    onDoubleWithAd: (doubled) => {
      audio.unlock();
      addMoney(state, doubled);
      audio.playGoal();
      saveGame(state);
      modals.toast(`Incassi offline raddoppiati: +${formatMoney(doubled)}!`);
      refreshFullUI();
    },
  });
}

// 6. Auto-save ogni 5s + chiusura scheda
setInterval(() => {
  saveGame(state);
}, AUTO_SAVE_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    audio.stopStadiumAmbience();
    audio.stopMusic();
    saveGame(state);
  } else if (state.musicEnabled) {
    audio.unlock();
  }
});
window.addEventListener('pagehide', () => {
  audio.stopStadiumAmbience();
  audio.stopMusic();
  saveGame(state);
});

// 7. Registrazione silenziosa Service Worker v4
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// 8. Game Loop principale (requestAnimationFrame)
let lastTime = performance.now();
let uiThrottle = 0;

function tick(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const tSec = now / 1000;

  const stats = computeStats(state);
  if (stats.incomePerSec > 0) {
    addMoney(state, stats.incomePerSec * dt);
  }

  // Aggiornamento Spareggio (28s realistici o Calci di Rigore — pausabile dal VAR!)
  if (matchCtrl.active) {
    const matchEvents = matchCtrl.update(dt, state);
    for (const ev of matchEvents) {
      if (ev.type === 'spawn_chance') {
        audio.playFlashEvent(false);
        audio.setAmbienceIntensity(0.85);
      } else if (ev.type === 'spawn_danger') {
        audio.playWhistle('short');
        audio.setAmbienceIntensity(0.75);
      } else if (ev.type === 'chance_expired') {
        audio.playMiss();
        audio.setAmbienceIntensity(0.2);
        stadium.triggerMatchSavedByOpponent(ev.nx, ev.ny, state.leagueIndex);
      } else if (ev.type === 'enemy_goal') {
        audio.playMiss();
        audio.setAmbienceIntensity(0.2);
        stadium.triggerMatchGoal(false, state.leagueIndex);
      } else if (ev.type === 'enter_penalties') {
        audio.playWhistle('fulltime');
        modals.toast('Pareggio al 90°! Si va ai CALCI DI RIGORE!', 2600);
        mountPenaltyControls();
      } else if (ev.type === 'match_finished') {
        finalizeMatchOutcome(ev);
      }
    }

    if (matchCtrl.isPlaying && !matchCtrl.paused && !matchCtrl.goalChance && !matchCtrl.enemyDanger) {
      audio.setAmbienceIntensity(0.18 + matchCtrl.getPossessionRatio() * 0.28);
    }

    if (matchCtrl.isPenalties && matchCtrl.penalties) {
      modals.updatePenaltyCursor(matchCtrl.penalties.cursor);
    }
  }

  // Eventi Casuali fuori partita (Flash / Invasione / Blackout / Dilemmi A-B di Gino)
  const spawned = flashEvents.update(dt, {
    isMatchActive: matchCtrl.active,
    leagueIndex: state.leagueIndex,
  });
  if (spawned) {
    if (spawned.kind === 'dilemma') {
      audio.playFlashEvent(false);
      modals.showDilemmaModal(spawned.dilemma, {
        clubPrimary: state.clubColors.primary,
        onChoice: (choice) => {
          const opt = choice === 'A' ? spawned.dilemma.optionA : spawned.dilemma.optionB;
          const msg = opt.apply(state, computeStats(state));
          audio.playBuy();
          modals.toast(msg, 3000);
          flashEvents.setDilemmaOpen(false);
          saveGame(state);
          refreshFullUI();
        },
        onDismiss: () => {
          flashEvents.setDilemmaOpen(false);
        },
      });
    } else {
      audio.playFlashEvent(false);
      const hint =
        spawned.kind === 'invasion'
          ? 'Toccalo 4 volte per placcarlo (×3 incassi + 🪙)!'
          : spawned.kind === 'blackout'
            ? 'Tocca il quadro elettrico 5 volte per riaccendere!'
            : 'Toccalo entro 7s!';
      modals.toast(`${spawned.icon} ${spawned.title} ${hint}`, 2800);
    }
  }

  stadium.update(dt, tSec, {
    leagueIndex: state.leagueIndex,
    isMatchActive: matchCtrl.active,
    onMiniGoal: () => {
      if (stats.incomePerSec > 0) {
        const bonus = Math.max(1, Math.floor(stats.incomePerSec * 1.2));
        addMoney(state, bonus);
        stadium.entities.spawnFloatingText(0.84, 0.45, `GOL! +${formatMoney(bonus)}`, {
          color: '#86efac',
          scale: 0.92,
        });
      }
    },
  });

  stadium.render(state.leagueIndex, tSec, {
    flashEvent: matchCtrl.active ? null : flashEvents.activeEvent,
    matchActions: matchCtrl.isPlaying ? matchCtrl.getActiveKeyActions() : [],
    clubInfo: getClubInfo(),
    upgrades: state.upgrades,
    isMatchActive: matchCtrl.active,
    oppColors: matchCtrl.oppColors,
  });

  uiThrottle += dt;
  if (uiThrottle >= 0.1) {
    uiThrottle = 0;
    hud.update(state, matchCtrl);
    tabs.updateAffordability(state, matchCtrl);
    updateTutorialPointer();
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
