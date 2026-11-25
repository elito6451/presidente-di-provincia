import {
  AUTO_SAVE_INTERVAL_MS,
  FORMATION_SLOTS_DEF,
  PRESTIGE_SOFTCAP_EXPONENT,
} from './config.js';
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
  getStarters,
  getBenchPlayers,
  autoAssignLineup,
  autoFillEmptySlot,
  assignSlotPlayer,
  sellBenchPlayer,
  fuseBenchIntoStarter,
  petPolpetta,
  isPolpettaReady,
  syncPeakIncomeTracking,
  evaluateMasteryTrophies,
} from './state.js';
import { buyResearch } from './research.js';
import {
  startExpedition,
  claimExpedition,
  equipRelic,
  unequipRelicSlot,
  fuseRelics,
  recycleRelic,
  RELIC_RARITIES,
} from './expeditions.js';
import {
  loadGame,
  saveGame,
  exportSaveBase64,
  importSaveBase64,
  clearSavedGame,
} from './storage.js';
import { audio } from './audio.js';
import { openPack } from './gacha.js';
import {
  evaluateMatchChallenges,
  evaluateRosterChallenges,
  buildWhatsAppCard,
} from './challenges.js';
import { SpareggioController } from './match.js';
import { FlashEventManager } from './events.js';
import {
  TUTORIAL_DONE_STEP,
  getGinoAvatarSvg,
  getGinoBustSvg,
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

// 1. Carica salvataggio (migrazione trasparente v1..v4.0 -> v4.5)
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
let ginoTypeTimer = null;
let ginoTypeFullText = '';
let ginoTypeDone = true;
let lastSpotlightTargetId = null;
let lastGinoRenderKey = '';

const elAppShell = document.getElementById('app-shell');
const elGinoTopBtn = document.getElementById('btn-gino-top');
const elGinoTopAvatar = document.getElementById('gino-top-avatar');
const elGinoDot = document.getElementById('gino-dot');
const elGinoDock = document.getElementById('gino-stage-dock');
const elGinoBubble = document.getElementById('gino-bubble');
const elGinoBustWrap = document.getElementById('gino-bust-wrap');
const elTutorialSpotlight = document.getElementById('tutorial-spotlight');
const elTutorialPointer = document.getElementById('tutorial-pointer');

const POINTER_ARROW_SVG = `<svg class="tutorial-pointer-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21 4.5 12h4.7V3h5.6v9h4.7L12 21Z"/></svg>`;

function stopGinoTypewriter(completeNow = false) {
  if (ginoTypeTimer) {
    clearInterval(ginoTypeTimer);
    ginoTypeTimer = null;
  }
  ginoTypeDone = true;
  elGinoBustWrap?.classList.remove('talking');
  if (completeNow) {
    const textEl = document.getElementById('gino-type-text');
    if (textEl) textEl.textContent = ginoTypeFullText;
  }
}

function startGinoTypewriter(fullText) {
  stopGinoTypewriter(false);
  ginoTypeFullText = String(fullText || '');
  const textEl = document.getElementById('gino-type-text');
  if (!textEl) return;

  let idx = 0;
  ginoTypeDone = false;
  textEl.textContent = '';
  elGinoBustWrap?.classList.add('talking');

  ginoTypeTimer = setInterval(() => {
    idx += 2;
    if (idx >= ginoTypeFullText.length) {
      textEl.textContent = ginoTypeFullText;
      stopGinoTypewriter(false);
    } else {
      textEl.textContent = ginoTypeFullText.slice(0, idx);
    }
  }, 24);
}

function closeGinoDock() {
  stopGinoTypewriter(false);
  elGinoDock?.classList.remove('visible');
  lastGinoRenderKey = '';
}

function checkRosterChallengesAndNotify() {
  const newly = evaluateRosterChallenges(state);
  if (newly.length > 0) {
    for (const ch of newly) {
      modals.toast(`🏅 Sfida "${ch.name}" completata! +${ch.tokenReward} 🪙 & ${ch.perkLabel(1)}!`, 3200);
    }
    saveGame(state);
  }
}

function checkMasteryAndNotify() {
  const unlocked = evaluateMasteryTrophies(state);
  if (unlocked.length > 0) {
    for (const u of unlocked) {
      const tokPart = u.tokens > 0 ? `+${u.tokens} 🪙 & ` : '';
      modals.toast(
        `🏆 Maestria ${u.league.shortName} ${u.tier.icon} ${u.tier.label}! ${tokPart}+${u.tier.incomePct}% permanente!`,
        3400
      );
    }
    audio.playBuy();
    saveGame(state);
    return true;
  }
  return false;
}

function getClubInfo() {
  return {
    name: state.clubName,
    primary: state.clubColors.primary,
    secondary: state.clubColors.secondary,
  };
}

function syncSquadOnPitch() {
  if (stadium) {
    stadium.syncTopPlayers(getStarters(state));
  }
}

function updateTutorialPointer() {
  if (!elTutorialPointer || !elAppShell) return;
  const inTutorial = (state.tutorialStep ?? TUTORIAL_DONE_STEP) < TUTORIAL_DONE_STEP;
  const dockVisible = elGinoDock && elGinoDock.classList.contains('visible');

  if (!inTutorial || dockVisible || matchCtrl.active || !tabs) {
    elTutorialPointer.classList.add('hidden');
    elTutorialSpotlight?.classList.add('hidden');
    return;
  }

  // Assicura che la subtab di Scouting corrisponda al passo del tutorial (Passo 3 -> Buste, Passo 4 -> Formazione)
  const stepDef = TUTORIAL_STEPS[state.tutorialStep];
  if (stepDef?.subtab && tabs.activeTab === 'scouting' && tabs.scoutingSubtab !== stepDef.subtab) {
    tabs.setScoutingSubtab(stepDef.subtab, false);
  }

  const target = getTutorialPointerTarget(state, tabs.activeTab);
  if (!target || !target.el) {
    elTutorialPointer.classList.add('hidden');
    elTutorialSpotlight?.classList.add('hidden');
    return;
  }

  if (target.inScroll && lastSpotlightTargetId !== target.id) {
    lastSpotlightTargetId = target.id;
    try {
      target.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      // ignore
    }
  } else if (!target.inScroll) {
    lastSpotlightTargetId = target.id;
  }

  const shellRect = elAppShell.getBoundingClientRect();
  const rect = target.el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    elTutorialPointer.classList.add('hidden');
    elTutorialSpotlight?.classList.add('hidden');
    return;
  }

  if (rect.bottom < shellRect.top + 20 || rect.top > shellRect.bottom - 10) {
    elTutorialPointer.classList.add('hidden');
    elTutorialSpotlight?.classList.add('hidden');
    return;
  }

  if (elTutorialSpotlight) {
    const pad = 4;
    const sLeft = Math.max(2, rect.left - shellRect.left - pad);
    const sTop = Math.max(2, rect.top - shellRect.top - pad);
    const sWidth = Math.min(shellRect.width - sLeft - 2, rect.width + pad * 2);
    const sHeight = Math.min(shellRect.height - sTop - 2, rect.height + pad * 2);
    elTutorialSpotlight.style.left = `${sLeft.toFixed(1)}px`;
    elTutorialSpotlight.style.top = `${sTop.toFixed(1)}px`;
    elTutorialSpotlight.style.width = `${sWidth.toFixed(1)}px`;
    elTutorialSpotlight.style.height = `${sHeight.toFixed(1)}px`;
    elTutorialSpotlight.classList.remove('hidden');
  }

  let relX = rect.left + rect.width * 0.5 - shellRect.left;
  let relY = target.anchor === 'center'
    ? rect.top + rect.height * 0.54 - shellRect.top
    : rect.top - shellRect.top - 4;

  relX = Math.max(58, Math.min(shellRect.width - 58, relX));

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
    closeGinoDock();
    elTutorialPointer?.classList.add('hidden');
    elTutorialSpotlight?.classList.add('hidden');
    return;
  }

  const inTutorial = (state.tutorialStep ?? TUTORIAL_DONE_STEP) < TUTORIAL_DONE_STEP;
  if (inTutorial) {
    elGinoDot?.classList.remove('hidden');
    const shouldShowDock = tutorialBubbleDismissedStep !== state.tutorialStep;

    if (shouldShowDock) {
      const stepDef = TUTORIAL_STEPS[state.tutorialStep] || TUTORIAL_STEPS[0];
      const renderKey = `tut:${state.tutorialStep}:${state.clubColors.primary}:${state.clubColors.secondary}`;

      if (lastGinoRenderKey !== renderKey || !elGinoDock.classList.contains('visible')) {
        lastGinoRenderKey = renderKey;
        elGinoBustWrap.innerHTML = getGinoBustSvg(
          state.clubColors.primary,
          state.clubColors.secondary,
          stepDef.expression || 'happy'
        );
        const primaryBtnHtml = stepDef.manualAdvance
          ? `<button type="button" class="mini-btn primary" id="btn-gino-next">${escapeHTML(stepDef.manualBtnLabel || 'Avanti →')}</button>
             <button type="button" class="mini-btn" id="btn-gino-ok">Mostrami</button>`
          : `<button type="button" class="mini-btn primary" id="btn-gino-ok">Capito!</button>`;

        elGinoBubble.innerHTML = `
          <div class="gino-dock-title">${escapeHTML(stepDef.title)}</div>
          <div class="gino-dock-text" id="gino-type-text"></div>
          <div class="gino-dock-actions">
            ${primaryBtnHtml}
            <button type="button" class="mini-btn" id="btn-gino-skip">Salta</button>
          </div>
        `;
        elGinoDock.classList.add('visible');
        startGinoTypewriter(stepDef.text);

        const dismissDock = () => {
          tutorialBubbleDismissedStep = state.tutorialStep;
          closeGinoDock();
          if (stepDef.subtab && tabs) {
            tabs.setScoutingSubtab(stepDef.subtab, true);
          }
          if (stepDef.targetTab && tabs) {
            if (tabs.activeTab !== stepDef.targetTab) {
              tabs.switchTo(stepDef.targetTab);
            } else {
              tabs.render(state, matchCtrl);
            }
          }
          updateTutorialPointer();
        };

        const advanceStep = () => {
          stopGinoTypewriter(false);
          state.tutorialStep = Math.min(TUTORIAL_DONE_STEP, state.tutorialStep + 1);
          tutorialBubbleDismissedStep = -1;
          lastSpotlightTargetId = null;
          saveGame(state);
          const nextDef = TUTORIAL_STEPS[state.tutorialStep];
          if (nextDef?.subtab && tabs) {
            tabs.setScoutingSubtab(nextDef.subtab, true);
          }
          if (nextDef?.targetTab && tabs) {
            if (tabs.activeTab !== nextDef.targetTab) {
              tabs.switchTo(nextDef.targetTab);
            } else {
              tabs.render(state, matchCtrl);
            }
          }
          renderGinoAssistant();
        };

        elGinoBubble.onclick = (e) => {
          if (e.target.closest('button')) return;
          if (!ginoTypeDone) {
            stopGinoTypewriter(true);
            return;
          }
          dismissDock();
        };
        elGinoBubble.querySelector('#btn-gino-ok')?.addEventListener('click', (e) => {
          e.stopPropagation();
          dismissDock();
        });
        elGinoBubble.querySelector('#btn-gino-next')?.addEventListener('click', (e) => {
          e.stopPropagation();
          advanceStep();
        });
        elGinoBubble.querySelector('#btn-gino-skip')?.addEventListener('click', (e) => {
          e.stopPropagation();
          state.tutorialStep = TUTORIAL_DONE_STEP;
          tutorialBubbleDismissedStep = TUTORIAL_DONE_STEP;
          saveGame(state);
          closeGinoDock();
          renderGinoAssistant();
        });
      }
    } else {
      closeGinoDock();
    }

    updateTutorialPointer();
    return;
  }

  const tip = getGinoDynamicTip(state);
  elGinoDot?.classList.toggle('hidden', !tip.urgent);
  elTutorialPointer?.classList.add('hidden');
  elTutorialSpotlight?.classList.add('hidden');

  if (ginoTipOpen) {
    const renderKey = `tip:${tip.title}:${tip.text}:${state.clubColors.primary}:${state.clubColors.secondary}`;
    if (lastGinoRenderKey !== renderKey || !elGinoDock.classList.contains('visible')) {
      lastGinoRenderKey = renderKey;
      elGinoBustWrap.innerHTML = getGinoBustSvg(
        state.clubColors.primary,
        state.clubColors.secondary,
        tip.expression || 'happy'
      );
      elGinoBubble.innerHTML = `
        <div class="gino-dock-title">Gino il DS — ${escapeHTML(tip.title)}</div>
        <div class="gino-dock-text" id="gino-type-text"></div>
        <div class="gino-dock-actions">
          ${tip.ctaTab ? `<button type="button" class="mini-btn primary" id="btn-gino-cta" data-goto="${tip.ctaTab}" data-subtab="${tip.ctaSubtab || ''}">${escapeHTML(tip.ctaLabel)}</button>` : ''}
          <button type="button" class="mini-btn" id="btn-gino-close">Capito!</button>
        </div>
      `;
      elGinoDock.classList.add('visible');
      startGinoTypewriter(tip.text);

      const closeTip = () => {
        ginoTipOpen = false;
        closeGinoDock();
      };

      elGinoBubble.onclick = (e) => {
        if (e.target.closest('button')) return;
        if (!ginoTypeDone) {
          stopGinoTypewriter(true);
          return;
        }
        closeTip();
      };
      elGinoBubble.querySelector('#btn-gino-cta')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const gotoTab = e.currentTarget.dataset.goto;
        const gotoSub = e.currentTarget.dataset.subtab;
        ginoTipOpen = false;
        closeGinoDock();
        if (gotoSub) tabs.setScoutingSubtab(gotoSub, true);
        if (tabs.activeTab !== gotoTab) tabs.switchTo(gotoTab);
        else tabs.render(state, matchCtrl);
        renderGinoAssistant();
      });
      elGinoBubble.querySelector('#btn-gino-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTip();
      });
    }
  } else {
    closeGinoDock();
  }
}

elGinoTopBtn?.addEventListener('click', (ev) => {
  ev.stopPropagation();
  audio.unlock();
  if ((state.tutorialStep ?? TUTORIAL_DONE_STEP) < TUTORIAL_DONE_STEP) {
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
  matchCtrl.finishPenalties();
  modals.hidePenaltyDock();
  audio.stopStadiumAmbience();
  audio.fadeMusicForMatch(false);
  audio.playWhistle('fulltime');

  const newChallenges = evaluateMatchChallenges(state, {
    won: outcome.won,
    byPenalties: Boolean(outcome.byPenalties),
    finalCup: Boolean(outcome.finalCup),
    myGoals: outcome.myGoals,
    oppGoals: outcome.oppGoals,
    leagueIndex: outcome.leagueIndex ?? state.leagueIndex,
    starters: outcome.starters || [],
  });
  outcome.newChallenges = newChallenges;
  for (const ch of newChallenges) {
    modals.toast(`🏅 Sfida "${ch.name}" completata! +${ch.tokenReward} 🪙 & ${ch.perkLabel(1)}!`, 3200);
  }
  checkMasteryAndNotify();

  if (outcome.won) {
    audio.playGoal();
    stadium.celebratePromotion(state.leagueIndex >= 4 || outcome.finalCup);
  } else {
    audio.playMiss();
  }
  saveGame(state);

  const showResult = () => {
    modals.showMatchResult(outcome, state.clubName, () => refreshFullUI());
    refreshFullUI();
  };

  if (outcome.won && (outcome.promoted || outcome.dynastyUp)) {
    const headline = outcome.dynastyUp
      ? `${state.clubName.toUpperCase()} — DINASTIA LV.${outcome.dynastyLevel}!`
      : `STORICO! ${state.clubName.toUpperCase()} VOLA IN ${outcome.newLeague.name.toUpperCase()}!`;
    const subline = outcome.dynastyUp
      ? `Battuto ${outcome.opponent} (${outcome.myGoals}-${outcome.oppGoals})! Corona di Dinastia Lv.${outcome.dynastyLevel} e +20% incassi per sempre!`
      : `Travolto ${outcome.opponent} (${outcome.myGoals}-${outcome.oppGoals})! Paninaro preso d'assalto, città bloccata dai clacson!`;

    cutscenes.playGazzettaFrontPage(
      {
        clubName: state.clubName,
        headline,
        subline,
        tag: outcome.dynastyUp ? 'DINASTIA GALATTICA' : 'PROMOZIONE STORICA',
      },
      showResult
    );
  } else {
    showResult();
  }
}

function handleOpponentPenaltyResolved(res) {
  if (!res) return;
  if (res.saved) audio.playPerfectSave();
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
}

function mountPenaltyControls() {
  if (!matchCtrl.isPenalties) return;
  audio.setAmbienceIntensity(0.75);
  modals.renderPenaltyDock(matchCtrl, state, {
    onSelectZone(zoneId) {
      matchCtrl.setPenaltyZone(zoneId);
      mountPenaltyControls();
    },
    onShoot() {
      audio.unlock();
      const res = matchCtrl.shootPlayerPenalty(state);
      if (!res) return;
      if (res.scored) audio.playGoal();
      else if (res.saved) audio.playSave();
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
      handleOpponentPenaltyResolved(res);
    },
  });
}

// 2. Canvas Stadio Vivo 2.5D (+ Porta Frontale 3D sui Rigori!)
const canvasEl = document.getElementById('stadium-canvas');
stadium = new StadiumCanvas(canvasEl, {
  onPointerDown({ clickX, clickY, stageNormX, stageNormY, pitchNormX, pitchNormY, projectFn }) {
    audio.unlock();

    if (matchCtrl.paused) return;

    // Sui Rigori 3D: toccare direttamente la zona dentro la porta 3D seleziona il bersaglio!
    if (matchCtrl.isPenalties) {
      if (matchCtrl.penalties && matchCtrl.penalties.turn === 'player' && !matchCtrl.penalties.locked) {
        const hitZone = stadium.hitTestPenaltyGoal(clickX, clickY);
        if (hitZone) {
          matchCtrl.setPenaltyZone(hitZone);
          mountPenaltyControls();
        }
      }
      return;
    }

    // Priorità 1 durante il match: Azione Chiave (TIRA! / PARA! di precisione con Finta & Ribattuta)
    if (matchCtrl.isPlaying) {
      const actionHit = matchCtrl.tryHitKeyActionPx(clickX, clickY, projectFn);
      if (actionHit) {
        if (actionHit.type === 'player_goal') {
          audio.playGoal();
          audio.setAmbienceIntensity(0.9);
          stadium.triggerMatchGoal(true, state.leagueIndex);

          // Finto VAR Comico v4.5 (~28%, max 1 volta a partita, 15 battute + finto annullamento!)
          if (!matchCtrl.varTriggeredThisMatch && matchCtrl.minute < 84 && Math.random() < 0.28) {
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
        } else if (actionHit.type === 'perfect_save') {
          audio.playPerfectSave();
          audio.setAmbienceIntensity(0.65);
          stadium.triggerPerfectSave(actionHit.nx, actionHit.ny);
        } else if (actionHit.type === 'player_save') {
          audio.playSave();
          audio.setAmbienceIntensity(0.35);
          stadium.triggerMatchSave(actionHit.nx, actionHit.ny);
        } else if (actionHit.type === 'early_dive') {
          audio.playMiss();
          audio.setAmbienceIntensity(0.2);
          stadium.triggerEarlyDive(state.leagueIndex);
        } else if (actionHit.type === 'pscon_block') {
          audio.playSave();
          audio.setAmbienceIntensity(0.35);
          stadium.triggerPsconBlock(actionHit.nx, actionHit.ny);
        } else if (actionHit.type === 'feint_baited') {
          audio.playCrossbar();
          stadium.triggerFeintBaited(actionHit.nx, actionHit.ny);
        } else if (actionHit.type === 'rebound_spawn') {
          audio.playRebound();
          stadium.triggerReboundSpawn(actionHit.nx, actionHit.ny);
        }
        hud.update(state, matchCtrl);
        return;
      }
    }

    // Priorità 2 (fuori partita): Eventi Casuali sul Canvas (inclusi Vicino, Ape Car, Fumogeni!)
    if (!matchCtrl.active) {
      const hit = flashEvents.tryHit({ stageNormX, stageNormY, pitchNormX, pitchNormY }, state);
      if (hit) {
        if (hit.partial) {
          if (hit.horn) audio.playHorn();
          else audio.playTap(true);
          stadium.triggerShake(3.2, 0.1);
          stadium.entities.spawnFloatingText(pitchNormX, pitchNormY, `ANCORA ${hit.remaining}!`, {
            color: '#fde047',
            scale: 1.05,
          });
          return;
        }
        if (hit.event.kind === 'blackout') audio.playPowerOn();
        else if (hit.event.kind === 'ape_car') audio.playHorn();
        else if (hit.event.kind === 'invasion') audio.playWhistle('short');
        else audio.playFlashEvent(true);

        const parts = [];
        if (hit.label) parts.push(hit.label);
        else {
          if (hit.freePackId) parts.push('🏅 +1 Busta Gratis');
          if (hit.cash > 0) parts.push(`+${formatMoney(hit.cash)}`);
        }
        const msg = parts.join(' • ');
        stadium.triggerEventHitFeedback(stageNormX, stageNormY, msg);
        modals.toast(`${hit.event.title} ${msg}`);
        refreshFullUI();
        return;
      }

      // Priorità 2b (fuori partita): Carezza alla mascotte Polpetta a bordocampo!
      if (stadium.tryHitPolpettaPx(clickX, clickY)) {
        const res = petPolpetta(state);
        audio.playHamsterSqueak();
        stadium.triggerPolpettaPet(res.boosted);
        if (res.boosted) {
          modals.toast('🐹 Polpetta felice! Morale squadra ×1,25 per 10s!', 2400);
          saveGame(state);
          hud.update(state, matchCtrl);
        } else {
          modals.toast(`🐹 Polpetta sta riposando (${res.cooldownLeft}s)...`, 1800);
        }
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
    checkMasteryAndNotify();
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
      autoFillEmptySlotFn: autoFillEmptySlot,
      stats,
    });
    if (!res.ok) return;
    checkRosterChallengesAndNotify();
    saveGame(state);

    if (res.firstSecretTokens > 0) {
      modals.toast(`🌟 Nuova Leggenda Segreta! +${res.firstSecretTokens} 🪙 Gettoni d'Oro!`, 3400);
    }

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

  onAutoLineup() {
    audio.unlock();
    autoAssignLineup(state);
    audio.playBuy();
    checkRosterChallengesAndNotify();
    modals.toast('⚡ Migliori 5 titolari schierati per ruolo!');
    saveGame(state);
    refreshFullUI();
  },

  onOpenSlotPicker(slotKey) {
    audio.unlock();
    const slotDef = FORMATION_SLOTS_DEF.find((s) => s.key === slotKey);
    if (!slotDef) return;
    const currentId = state.lineup?.[slotKey] || null;
    const currentStarter = currentId ? state.roster.find((p) => p.id === currentId) || null : null;
    const benchCandidates = getBenchPlayers(state).filter((p) => p.role === slotDef.role);

    modals.showSlotPickerModal({
      slotDef,
      currentStarter,
      benchCandidates,
      onPick: (playerId) => {
        if (assignSlotPlayer(state, slotKey, playerId)) {
          audio.playBuy();
          checkRosterChallengesAndNotify();
          modals.toast(`Titolare aggiornato nello slot ${slotDef.label}!`);
          saveGame(state);
          refreshFullUI();
        }
      },
      onFuse: (benchId) => {
        if (!currentStarter) return;
        const res = fuseBenchIntoStarter(state, benchId, slotKey);
        if (res.ok) {
          audio.playPackOpen('epico');
          checkRosterChallengesAndNotify();
          modals.toast(`🔥 ${res.starter.name} allenato! Sale a ${res.starter.stars}★!`);
          saveGame(state);
          refreshFullUI();
        }
      },
      onUnequip: () => {
        if (assignSlotPlayer(state, slotKey, null)) {
          saveGame(state);
          refreshFullUI();
        }
      },
    });
  },

  onQuickEquipBench(playerId) {
    audio.unlock();
    const player = state.roster.find((p) => p.id === playerId);
    if (!player) return;
    const matchingSlots = FORMATION_SLOTS_DEF.filter((s) => s.role === player.role);
    if (matchingSlots.length === 0) return;

    let targetSlot = matchingSlots.find((s) => !state.lineup?.[s.key]);
    if (!targetSlot) {
      const starters = getStarters(state).filter((s) => s.slotDef.role === player.role);
      starters.sort((a, b) => (a.player ? a.player.stars : 0) - (b.player ? b.player.stars : 0));
      targetSlot = starters[0]?.slotDef || matchingSlots[0];
    }

    if (assignSlotPlayer(state, targetSlot.key, playerId)) {
      audio.playBuy();
      checkRosterChallengesAndNotify();
      modals.toast(`⚽ ${player.shortName || player.name} schierato titolare (${targetSlot.label})!`);
      saveGame(state);
      refreshFullUI();
    }
  },

  onFuseBench(benchId, slotKey) {
    audio.unlock();
    const res = fuseBenchIntoStarter(state, benchId, slotKey);
    if (!res.ok) return;
    audio.playPackOpen('epico');
    checkRosterChallengesAndNotify();
    modals.toast(`🔥 Fusione riuscita! ${res.starter.name} sale a ${res.starter.stars}★!`);
    saveGame(state);
    refreshFullUI();
  },

  onSellBench(benchId) {
    audio.unlock();
    const res = sellBenchPlayer(state, benchId, computeStats(state));
    if (!res.ok) return;
    audio.playBuy();
    modals.toast(`💰 ${res.player.shortName || res.player.name} ceduto: +${formatMoney(res.cash)}!`);
    saveGame(state);
    refreshFullUI();
  },

  // --- SPEDIZIONI & CIMELI v4.5 ---
  onStartExpedition(expId) {
    audio.unlock();
    const res = startExpedition(state, expId);
    if (!res.ok) return;
    audio.playBuy();
    modals.toast(`${res.def.icon} Spedizione "${res.def.name}" partita!`);
    saveGame(state);
    refreshFullUI();
  },

  onClaimExpedition() {
    audio.unlock();
    const res = claimExpedition(state);
    if (!res.ok) return;
    audio.playPackOpen(res.drops.some((d) => d.rarity === 'leggendario') ? 'leggenda' : 'epico');
    saveGame(state);
    modals.showExpeditionRewardModal(res.def, res.drops, () => {
      refreshFullUI();
    });
  },

  onEquipRelic(uid) {
    audio.unlock();
    const res = equipRelic(state, uid);
    if (!res.ok) {
      if (res.reason === 'duplicate_type') {
        modals.toast('Puoi equipaggiare max 1 Cimelio per tipo! Rimuovi quello vecchio prima.');
      }
      return;
    }
    audio.playBuy();
    modals.toast('🏺 Cimelio equipaggiato (permanente al Prestige)!');
    saveGame(state);
    refreshFullUI();
  },

  onUnequipRelic(slotIdx) {
    audio.unlock();
    if (unequipRelicSlot(state, slotIdx)) {
      audio.playTap(false);
      saveGame(state);
      refreshFullUI();
    }
  },

  onFuseRelics(relicId, rarity) {
    audio.unlock();
    const res = fuseRelics(state, relicId, rarity);
    if (!res.ok) return;
    const newRar = res.upgraded.rarity;
    const nxtLabel = RELIC_RARITIES[newRar]?.label || newRar;
    audio.playPackOpen(newRar === 'leggendario' ? 'leggenda' : 'epico');
    modals.toast(`🔥 Fusione Cimelio riuscita! Creato ${res.def.name} (${nxtLabel})!`, 3000);
    saveGame(state);
    refreshFullUI();
  },

  onRecycleRelic(uid) {
    audio.unlock();
    const res = recycleRelic(state, uid, computeStats(state));
    if (!res.ok) return;
    addMoney(state, res.cash);
    audio.playBuy();
    modals.toast(`♻️ Cimelio riciclato: +${formatMoney(res.cash)} in cassa!`);
    saveGame(state);
    refreshFullUI();
  },

  async onCopyWhatsApp() {
    audio.unlock();
    const stats = computeStats(state);
    const cardText = buildWhatsAppCard(state, stats);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(cardText);
        modals.toast('📋 Scheda Club copiata! Incollala su WhatsApp!', 2600);
        return;
      } catch {
        // Fallback iOS Safari / PWA senza permesso clipboard
      }
    }
    modals.showWhatsAppCardModal(cardText);
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
    closeGinoDock();
    audio.playWhistle('short');
    audio.fadeMusicForMatch(true);
    audio.startStadiumAmbience();
    audio.setAmbienceIntensity(0.25);
    stadium.entities.spawnCrowdBubble('DAI RAGAZZI!', { color: '#7dd3fc' });
    modals.toast(`Calcio d'inizio vs ${matchCtrl.opponent}! TIRA! sul verde, PARA! sul ciano!`);
    refreshFullUI();
  },

  onPrestige() {
    audio.unlock();
    const stats = computeStats(state);
    const gainedShares = getPendingPrestigeShares(state);
    const totalShares = (state.prestigeShares || 0) + gainedShares;
    const sharePct = stats.research.shareBonusPct;
    const nextMult = 1 + (Math.pow(totalShares, PRESTIGE_SOFTCAP_EXPONENT) * sharePct) / 100;

    modals.showPrestigeConfirm({ gainedShares, totalShares, nextMult }, () => {
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
        tutorialBubbleDismissedStep = -1;
        lastSpotlightTargetId = null;
        checkRosterChallengesAndNotify();
        checkMasteryAndNotify();
        saveGame(state);
        modals.toast('Salvataggio importato (compatibile v1–v4.5)!');
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

// 5. Controllo retroattivo Sfide rosa & Trofei Maestria, render iniziale & guadagni offline
checkRosterChallengesAndNotify();
checkMasteryAndNotify();
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

// 7. Registrazione silenziosa Service Worker v7
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// 8. Game Loop principale (requestAnimationFrame)
let lastTime = performance.now();
let uiThrottle = 0;
let masteryThrottle = 0;

function tick(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const tSec = now / 1000;

  const stats = computeStats(state);
  syncPeakIncomeTracking(state, stats);
  if (stats.incomePerSec > 0) {
    addMoney(state, stats.incomePerSec * dt);
  }

  // Aggiornamento Spareggio (28s o Rigori 3D — pausabile dal VAR!)
  if (matchCtrl.active) {
    const matchEvents = matchCtrl.update(dt, state);
    for (const ev of matchEvents) {
      if (ev.type === 'spawn_chance') {
        audio.playFlashEvent(false);
        audio.setAmbienceIntensity(0.85);
      } else if (ev.type === 'spawn_danger') {
        audio.playWhistle('short');
        audio.setAmbienceIntensity(0.75);
      } else if (ev.type === 'feint_switch') {
        audio.playTap(true);
      } else if (ev.type === 'chance_expired') {
        audio.playMiss();
        audio.setAmbienceIntensity(0.2);
        stadium.triggerMatchSavedByOpponent(ev.nx, ev.ny, state.leagueIndex);
      } else if (ev.type === 'pscon_block') {
        audio.playSave();
        audio.setAmbienceIntensity(0.35);
        stadium.triggerPsconBlock(ev.nx, ev.ny);
      } else if (ev.type === 'enemy_goal') {
        audio.playMiss();
        audio.setAmbienceIntensity(0.2);
        stadium.triggerMatchGoal(false, state.leagueIndex);
      } else if (ev.type === 'enter_penalties') {
        audio.playWhistle('fulltime');
        modals.toast('Pareggio al 90°! Si va ai RIGORI 3D!', 2600);
        mountPenaltyControls();
      } else if (ev.type === 'penalty_auto_resolved') {
        handleOpponentPenaltyResolved(ev.res);
      } else if (ev.type === 'match_finished') {
        finalizeMatchOutcome(ev);
      }
    }

    if (matchCtrl.isPlaying && !matchCtrl.paused && !matchCtrl.goalChance && !matchCtrl.enemyDanger) {
      audio.setAmbienceIntensity(0.18 + matchCtrl.getPossessionRatio() * 0.28);
    }

    if (matchCtrl.isPenalties && matchCtrl.penalties) {
      modals.updatePenaltyLive(matchCtrl.penalties);
    }
  }

  // Eventi Casuali fuori partita
  const spawned = flashEvents.update(dt, {
    isMatchActive: matchCtrl.active,
    leagueIndex: state.leagueIndex,
  });
  if (spawned) {
    if (spawned.kind === 'dilemma') {
      audio.playFlashEvent(false);
      modals.showDilemmaModal(spawned.dilemma, {
        clubPrimary: state.clubColors.primary,
        clubSecondary: state.clubColors.secondary,
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
      if (spawned.kind === 'ape_car') audio.playHorn();
      else audio.playFlashEvent(false);
      const hintMap = {
        invasion: 'Toccalo 4 volte per placcarlo (×3 incassi)!',
        blackout: 'Tocca il quadro elettrico 5 volte per riaccendere!',
        neighbor_pitchfork: 'Tocca il vicino 5 volte per recuperare il pallone!',
        ape_car: 'Ferma l\'Ape Car con 4 tocchi (Sponsor ×2,5)!',
        crazy_smoke: 'Tocca il campo 5 volte per diradare i fumogeni (×3 Tap)!',
      };
      const hint = hintMap[spawned.kind] || 'Toccalo entro 7s!';
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
    polpettaReady: isPolpettaReady(state),
    penalties: matchCtrl.isPenalties ? matchCtrl.penalties : null,
  });

  uiThrottle += dt;
  if (uiThrottle >= 0.1) {
    uiThrottle = 0;
    hud.update(state, matchCtrl);
    tabs.updateAffordability(state, matchCtrl);
    updateTutorialPointer();
  }

  masteryThrottle += dt;
  if (masteryThrottle >= 1.2) {
    masteryThrottle = 0;
    if (checkMasteryAndNotify() && (tabs.activeTab === 'societa' || tabs.activeTab === 'spareggio')) {
      tabs.render(state, matchCtrl);
    }
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
