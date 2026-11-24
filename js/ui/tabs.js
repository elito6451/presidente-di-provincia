import {
  LEAGUES,
  UPGRADES,
  PACKS,
  RARITIES,
  MAX_PLAYER_STARS,
  TACTICS,
  CLUB_COLOR_PRESETS,
  SECRET_PLAYERS,
  MILESTONE_TOKEN_REWARDS,
  PRESTIGE_UNLOCK_RUN_CASH,
  FORMATION_SLOTS_DEF,
  SEASON_BONUS_TOKENS,
} from '../config.js';
import { formatMoney, formatNumber, escapeHTML } from '../format.js';
import {
  computeStats,
  getUpgradeLevel,
  getUpgradeMilestoneInfo,
  getVisibleUpgrades,
  getBulkUpgradePlan,
  getPackCost,
  getFreePackCount,
  getStarters,
  getBenchPlayers,
  canStartSpareggio,
  canStartNewSeason,
  canPrestige,
  getPendingPrestigeShares,
  getChecklistStatus,
  getCurrentMatchRound,
} from '../state.js';
import {
  PERMANENT_RESEARCHES,
  getResearchLevel,
  getResearchCost,
  getResearchEffects,
} from '../research.js';
import {
  formatPlayerBonus,
  getPlayerEffectivePower,
  getBenchSellValue,
  canFuseBenchIntoStarter,
} from '../gacha.js';
import {
  PRESIDENT_CHALLENGES,
  computePresidentProfile,
} from '../challenges.js';
import { iconSvg } from './icons.js';

export class TabsController {
  constructor(actions) {
    this.actions = actions;
    this.activeTab = 'club';
    this.container = document.getElementById('tab-content');
    this.tabButtons = Array.from(document.querySelectorAll('.tab-btn'));

    this._bindNav();
    this._bindDelegation();
  }

  switchTo(tabName) {
    if (!tabName || tabName === this.activeTab) return;
    this.activeTab = tabName;
    for (const b of this.tabButtons) {
      const isAct = b.dataset.tab === tabName;
      b.classList.toggle('active', isAct);
      b.setAttribute('aria-selected', String(isAct));
    }
    this.container.scrollTop = 0;
    this.actions.onTabChanged?.();
  }

  _bindNav() {
    for (const btn of this.tabButtons) {
      btn.addEventListener('click', () => this.switchTo(btn.dataset.tab));
    }
  }

  _bindDelegation() {
    this.container.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn || btn.disabled) return;

      if (btn.dataset.buyMode) {
        this.actions.onSetBuyMode(btn.dataset.buyMode);
      } else if (btn.dataset.upgradeId) {
        this.actions.onBuyUpgrade(btn.dataset.upgradeId);
      } else if (btn.dataset.researchId) {
        this.actions.onBuyResearch(btn.dataset.researchId);
      } else if (btn.dataset.packId) {
        this.actions.onOpenPack(btn.dataset.packId);
      } else if (btn.id === 'btn-auto-lineup') {
        this.actions.onAutoLineup();
      } else if (btn.dataset.slotKey) {
        this.actions.onOpenSlotPicker(btn.dataset.slotKey);
      } else if (btn.dataset.equipPlayerId) {
        this.actions.onQuickEquipBench(btn.dataset.equipPlayerId);
      } else if (btn.dataset.fuseBenchId && btn.dataset.fuseSlotKey) {
        this.actions.onFuseBench(btn.dataset.fuseBenchId, btn.dataset.fuseSlotKey);
      } else if (btn.dataset.sellBenchId) {
        this.actions.onSellBench(btn.dataset.sellBenchId);
      } else if (btn.dataset.tacticId) {
        this.actions.onSelectTactic(btn.dataset.tacticId);
      } else if (btn.dataset.presetPrimary && btn.dataset.presetSecondary) {
        this.actions.onUpdateClub({
          primary: btn.dataset.presetPrimary,
          secondary: btn.dataset.presetSecondary,
        });
      } else if (btn.id === 'btn-start-match') {
        this.actions.onStartMatch();
      } else if (btn.id === 'btn-new-season') {
        this.actions.onStartNewSeason();
      } else if (btn.id === 'btn-copy-whatsapp') {
        this.actions.onCopyWhatsApp();
      } else if (btn.id === 'btn-prestige') {
        this.actions.onPrestige();
      } else if (btn.id === 'btn-toggle-music') {
        this.actions.onToggleMusic();
      } else if (btn.id === 'btn-toggle-sfx') {
        this.actions.onToggleSfx();
      } else if (btn.id === 'btn-export') {
        this.actions.onExport();
      } else if (btn.id === 'btn-import') {
        this.actions.onImport();
      } else if (btn.id === 'btn-reset') {
        this.actions.onReset();
      }
    });

    this.container.addEventListener('input', (ev) => {
      const el = ev.target;
      if (el.id === 'input-club-name') {
        this.actions.onUpdateClub({ name: el.value, silentRender: true });
      } else if (el.id === 'input-color-primary') {
        this.actions.onUpdateClub({ primary: el.value, silentRender: true });
        this._syncJerseyPreview();
      } else if (el.id === 'input-color-secondary') {
        this.actions.onUpdateClub({ secondary: el.value, silentRender: true });
        this._syncJerseyPreview();
      }
    });
  }

  _syncJerseyPreview() {
    const p = this.container.querySelector('#input-color-primary')?.value;
    const s = this.container.querySelector('#input-color-secondary')?.value;
    const preview = this.container.querySelector('#club-jersey-preview');
    if (preview && p && s) {
      preview.style.background = `linear-gradient(90deg, ${p} 0%, ${p} 36%, ${s} 36%, ${s} 64%, ${p} 64%, ${p} 100%)`;
    }
  }

  render(state, matchCtrl) {
    if (this.activeTab === 'club') {
      this._renderClub(state);
    } else if (this.activeTab === 'scouting') {
      this._renderScouting(state);
    } else if (this.activeTab === 'spareggio') {
      this._renderSpareggio(state, matchCtrl);
    } else if (this.activeTab === 'societa') {
      this._renderSocieta(state);
    }
  }

  updateAffordability(state, matchCtrl) {
    if (this.activeTab === 'club') {
      const mode = state.buyMode || '1x';
      for (const upg of UPGRADES) {
        const btn = this.container.querySelector(`button[data-upgrade-id="${upg.id}"]`);
        if (!btn) continue;
        const plan = getBulkUpgradePlan(state, upg, mode);
        btn.disabled = !plan.canBuy;
        if (mode === 'MAX') {
          const tag = plan.affordableCount > 0 ? `+${plan.affordableCount}` : '+1';
          btn.innerHTML = `${formatMoney(plan.totalCost)}<span class="buy-btn-sub">${tag}</span>`;
        }
      }
    } else if (this.activeTab === 'scouting') {
      const stats = computeStats(state);
      for (const pack of PACKS) {
        const btn = this.container.querySelector(`button[data-pack-id="${pack.id}"]`);
        if (!btn) continue;
        const free = getFreePackCount(state, pack.id);
        const cost = getPackCost(state, pack, stats);
        btn.disabled = free <= 0 && state.money < cost;
        if (free <= 0) {
          const txt = formatMoney(cost);
          if (btn.textContent !== txt) btn.textContent = txt;
        }
      }
    } else if (this.activeTab === 'spareggio') {
      const check = getChecklistStatus(state);
      const fillCash = this.container.querySelector('#chk-cash-fill');
      const txtCash = this.container.querySelector('#chk-cash-txt');
      if (fillCash) {
        fillCash.style.width = `${check.cash.pct.toFixed(1)}%`;
        fillCash.classList.toggle('done', check.cash.done);
      }
      if (txtCash) {
        txtCash.textContent = `${formatMoney(Math.min(check.cash.current, check.cash.target))} / ${formatMoney(check.cash.target)}`;
        txtCash.classList.toggle('check-ok', check.cash.done);
      }
      const btn = this.container.querySelector('#btn-start-match');
      if (btn) {
        btn.disabled = matchCtrl.active || !canStartSpareggio(state);
      }
    } else if (this.activeTab === 'societa') {
      const pending = getPendingPrestigeShares(state);
      const pEl = this.container.querySelector('#prestige-pending-val');
      const pBtn = this.container.querySelector('#btn-prestige');
      if (pEl) pEl.textContent = `+${pending}`;
      if (pBtn) pBtn.disabled = !canPrestige(state);
    }
  }

  _renderClub(state) {
    const stats = computeStats(state);
    const mode = state.buyMode || '1x';
    const mult =
      stats.leagueMult *
      stats.seasonMult *
      stats.prestigeMult *
      stats.challengeMult *
      stats.boostMult;
    const visible = getVisibleUpgrades(state);

    const bulkBtns = ['1x', '10x', '100x', 'MAX']
      .map(
        (m) =>
          `<button type="button" class="bulk-btn ${mode === m ? 'active' : ''}" data-buy-mode="${m}">${m}</button>`
      )
      .join('');

    const cardsHtml = visible
      .map(({ upgrade: upg, unlocked }) => {
        if (!unlocked) {
          return `
            <div class="upgrade-card mystery">
              <div class="upgrade-left">
                <div class="upgrade-icon">🔒</div>
                <div class="upgrade-info">
                  <div class="upgrade-title-row">
                    <span class="upgrade-name">??? Potenziamento Segreto</span>
                  </div>
                  <div class="upgrade-desc">${escapeHTML(upg.unlockText || 'Prosegui per sbloccare')}</div>
                </div>
              </div>
              <button type="button" class="buy-btn" disabled>Bloccato</button>
            </div>
          `;
        }

        const lvl = getUpgradeLevel(state, upg.id);
        const ms = getUpgradeMilestoneInfo(lvl);
        const plan = getBulkUpgradePlan(state, upg, mode);
        const unitMult = mult * ms.mult;

        const effects = [];
        if (upg.tapAdd > 0) {
          effects.push(`+${formatMoney(upg.tapAdd * unitMult * (1 + stats.rosterTapPct / 100))}/tap`);
        }
        if (upg.incomeAdd > 0) {
          effects.push(`+${formatMoney(upg.incomeAdd * unitMult * (1 + stats.rosterIncomePct / 100))}/s`);
        }

        const nextKey = `${upg.id}:${ms.next}`;
        const alreadyClaimedToken = Boolean(state.claimedCareerMilestones?.[nextKey]);
        const nextTokHint =
          !ms.allDone && !alreadyClaimedToken
            ? ` (+${MILESTONE_TOKEN_REWARDS[ms.next] || 1}🪙)`
            : '';

        const milestoneHtml = ms.allDone
          ? `<div class="milestone-row"><span class="milestone-lbl">★ Tutte le Milestone ×16 raggiunte!</span></div>`
          : `
            <div class="milestone-row">
              <div class="milestone-mini-track">
                <div class="milestone-mini-fill" style="width:${ms.pct.toFixed(0)}%;"></div>
              </div>
              <span class="milestone-lbl">Lv.${lvl}/${ms.next} → ×2${nextTokHint}</span>
            </div>
          `;

        const subTag =
          mode === 'MAX'
            ? `<span class="buy-btn-sub">+${plan.affordableCount > 0 ? plan.affordableCount : 1}</span>`
            : mode !== '1x'
              ? `<span class="buy-btn-sub">+${plan.count}</span>`
              : '';

        return `
          <div class="upgrade-card">
            <div class="upgrade-left">
              <div class="upgrade-icon">${upg.icon}</div>
              <div class="upgrade-info">
                <div class="upgrade-title-row">
                  <span class="upgrade-name">${escapeHTML(upg.name)}</span>
                  <span class="upgrade-lvl">Lv.${lvl}</span>
                  ${ms.mult > 1 ? `<span class="mult-pill">×${ms.mult}</span>` : ''}
                </div>
                <div class="upgrade-desc">${escapeHTML(upg.desc)}</div>
                <div class="upgrade-effect">${effects.join(' • ')}</div>
                ${milestoneHtml}
              </div>
            </div>
            <button type="button" class="buy-btn" data-upgrade-id="${upg.id}" ${plan.canBuy ? '' : 'disabled'}>
              ${formatMoney(plan.totalCost)}${subTag}
            </button>
          </div>
        `;
      })
      .join('');

    this.container.innerHTML = `
      <div class="bulk-bar">
        <span style="font-size:10.5px;font-weight:800;color:#94a3b8;">Infrastr.: Lv.${stats.infraLevels}</span>
        <div class="bulk-group">${bulkBtns}</div>
      </div>
      ${cardsHtml}
    `;
  }

  _renderScouting(state) {
    const stats = computeStats(state);
    const { scoutLuckMult } = getResearchEffects(state);
    const starters = getStarters(state);
    const benchPlayers = getBenchPlayers(state);
    const starterById = new Map(starters.filter((s) => s.player).map((s) => [s.player.id, s]));

    const packsHtml = PACKS.map((pack) => {
      const freeCount = getFreePackCount(state, pack.id);
      const cost = getPackCost(state, pack, stats);
      const opened = state.packPurchases[pack.id] || 0;
      const canBuy = freeCount > 0 || state.money >= cost;
      const btnText = freeCount > 0 ? `GRATIS (${freeCount})` : formatMoney(cost);
      const btnClass = freeCount > 0 ? 'buy-btn free-btn' : 'buy-btn';

      const wE = pack.weights.epico * scoutLuckMult;
      const wL = pack.weights.leggenda * scoutLuckMult;
      const total = pack.weights.comune + pack.weights.raro + wE + wL;
      const pC = ((pack.weights.comune / total) * 100).toFixed(0);
      const pR = ((pack.weights.raro / total) * 100).toFixed(0);
      const pE = ((wE / total) * 100).toFixed(1).replace('.0', '');
      const pL = ((wL / total) * 100).toFixed(1).replace('.0', '');

      return `
        <div class="pack-card" style="border-left-color:${pack.accent};">
          <div class="upgrade-left">
            <div class="upgrade-icon">${pack.icon}</div>
            <div class="upgrade-info">
              <div class="upgrade-title-row">
                <span class="upgrade-name">${escapeHTML(pack.name)}</span>
                <span class="upgrade-lvl">Aperte: ${opened}</span>
              </div>
              <div class="upgrade-desc">${escapeHTML(pack.desc)}</div>
              <div class="pack-odds">
                <span style="color:#94a3b8;">C ${pC}%</span>
                <span style="color:#38bdf8;">R ${pR}%</span>
                <span style="color:#c084fc;">E ${pE}%</span>
                <span style="color:#fbbf24;">L ${pL}%</span>
              </div>
            </div>
          </div>
          <button type="button" class="${btnClass}" data-pack-id="${pack.id}" ${canBuy ? '' : 'disabled'}>
            ${btnText}
          </button>
        </div>
      `;
    }).join('');

    const kitGrad = `linear-gradient(90deg, ${state.clubColors.primary} 0%, ${state.clubColors.primary} 36%, ${state.clubColors.secondary} 36%, ${state.clubColors.secondary} 64%, ${state.clubColors.primary} 64%, ${state.clubColors.primary} 100%)`;

    // Formazione Titolare a 5 Ruoli (SOLO questi 5 applicano bonus e Forza Rosa!)
    const formationHtml = starters
      .map(({ slotKey, slotDef, player }) => {
        if (!player) {
          return `
            <button type="button" class="formation-slot empty" data-slot-key="${slotKey}">
              <span class="slot-role-badge">${slotDef.role}</span>
              <div class="slot-empty-txt">Vuoto<br/><span>Tocca</span></div>
            </button>
          `;
        }
        const rar = RARITIES[player.rarity] || RARITIES.comune;
        const holoCls =
          player.rarity === 'segreto'
            ? 'holo-segreto'
            : player.rarity === 'leggenda'
              ? 'holo-leggenda'
              : player.rarity === 'epico'
                ? 'holo-epico'
                : '';
        return `
          <button type="button" class="formation-slot filled ${holoCls}" data-slot-key="${slotKey}" style="border-color:${rar.color};">
            <div class="slot-top-row">
              <span class="slot-role-badge" style="background:${rar.bg};color:${rar.color};">${slotDef.role}</span>
              <span class="slot-pwr">⚡${getPlayerEffectivePower(player)}</span>
            </div>
            <div class="slot-name">${escapeHTML(player.shortName || player.name)}</div>
            <div class="slot-stars">${'★'.repeat(player.stars)}</div>
            <div class="slot-bonus">${escapeHTML(formatPlayerBonus(player))}</div>
          </button>
        `;
      })
      .join('');

    const discovered = new Set(state.discoveredSecrets || []);
    const secretSlotsHtml = SECRET_PLAYERS.map((tpl) => {
      const isFound = discovered.has(tpl.secretId);
      if (!isFound) {
        return `
          <div class="secret-slot locked">
            <div class="secret-mystery-q">???</div>
            <div style="font-size:10px;color:#94a3b8;font-weight:700;">Leggenda Segreta</div>
          </div>
        `;
      }
      const inRoster = state.roster.find((p) => p.secretId === tpl.secretId);
      const isStarter = inRoster && starterById.has(inRoster.id);
      const statusBadge = isStarter
        ? `<span class="starter-tag">TITOLARE • ${'★'.repeat(inRoster.stars)}</span>`
        : inRoster
          ? `<span class="upgrade-lvl" style="color:#93c5fd;">IN PANCHINA • ${'★'.repeat(inRoster.stars)}</span>`
          : `<span class="upgrade-lvl" style="color:#fde047;">SCOPERTA • Da ripescare</span>`;
      return `
        <div class="secret-slot unlocked holo-segreto">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <span class="rarity-tag" style="background:rgba(245,158,11,0.25);color:#fde047;">SEGRETO</span>
            <span style="font-size:10px;font-weight:900;color:#e2e8f0;">#${tpl.jerseyNumber} ${tpl.role}</span>
          </div>
          <div style="font-size:12px;font-weight:900;color:#fff;margin-top:2px;">${escapeHTML(tpl.name)}</div>
          <div style="font-size:10px;color:#cbd5e1;line-height:1.25;">${escapeHTML(tpl.bio)}</div>
          <div class="secret-ability-pill">${escapeHTML(tpl.abilityName)}: ${escapeHTML(tpl.abilityDesc)}</div>
          <div style="margin-top:3px;">${statusBadge}</div>
        </div>
      `;
    }).join('');

    // Panchina con azioni: Schiera, Fondi (★+1 su titolare stesso ruolo), Vendi (+€ / +1 🪙)
    const benchHtml =
      benchPlayers.length === 0
        ? `<div class="card" style="text-align:center;color:#94a3b8;font-size:11.5px;">
             ${state.roster.length === 0
               ? 'Nessun giocatore in rosa.<br/>Apri una busta per riempire i 5 slot titolari!'
               : 'Panchina vuota! I giocatori extra finiscono qui per essere schierati, fusi (★+1) o venduti.'}
           </div>`
        : benchPlayers
            .map((p) => {
              const rar = RARITIES[p.rarity] || RARITIES.comune;
              const stars = '★'.repeat(p.stars) + (p.stars >= MAX_PLAYER_STARS ? ' MAX' : '');
              const holoCls =
                p.rarity === 'segreto'
                  ? 'holo-segreto'
                  : p.rarity === 'leggenda'
                    ? 'holo-leggenda'
                    : p.rarity === 'epico'
                      ? 'holo-epico'
                      : '';
              const jerseyBg =
                p.secretId === 'loma'
                  ? '#0ea5e9'
                  : p.role === 'POR'
                    ? '#eab308'
                    : kitGrad;

              const fuseTarget = starters.find(
                (s) => s.player && canFuseBenchIntoStarter(p, s.player)
              );
              const sellVal = getBenchSellValue(p, state, stats);
              const sellLbl =
                sellVal.tokens > 0
                  ? `Vendi +${formatMoney(sellVal.cash)} +${sellVal.tokens}🪙`
                  : `Vendi +${formatMoney(sellVal.cash)}`;

              return `
                <div class="player-row bench-row ${holoCls}" style="border-left:3px solid ${rar.color};">
                  <div class="bench-top">
                    <div class="player-jersey" style="background:${jerseyBg};">
                      <span>${p.jerseyNumber}</span>
                      <span class="player-role-mini">${p.role}</span>
                    </div>
                    <div class="player-meta">
                      <div class="player-name">${escapeHTML(p.name)}</div>
                      <div class="player-sub">
                        <span class="rarity-tag" style="background:${rar.bg};color:${rar.color};">${rar.label}</span>
                        <span style="color:#fbbf24;font-weight:800;">${stars}</span>
                      </div>
                      <div style="font-size:10.5px;color:#86efac;font-weight:700;margin-top:2px;">
                        ${escapeHTML(formatPlayerBonus(p))}
                      </div>
                      ${p.abilityName ? `<div class="secret-ability-pill">${escapeHTML(p.abilityName)}: ${escapeHTML(p.abilityDesc)}</div>` : ''}
                    </div>
                    <div class="player-power">⚡${getPlayerEffectivePower(p)}</div>
                  </div>
                  <div class="bench-actions">
                    <button type="button" class="mini-btn primary" data-equip-player-id="${p.id}">Schiera</button>
                    ${
                      fuseTarget
                        ? `<button type="button" class="mini-btn fuse" data-fuse-bench-id="${p.id}" data-fuse-slot-key="${fuseTarget.slotKey}">Fondi su ${escapeHTML(fuseTarget.player.shortName || fuseTarget.slotDef.role)} (★+1)</button>`
                        : ''
                    }
                    <button type="button" class="mini-btn sell" data-sell-bench-id="${p.id}">${sellLbl}</button>
                  </div>
                </div>
              `;
            })
            .join('');

    this.container.innerHTML = `
      <div class="section-label">
        <span>Buste Scouting (×1,55ⁿ / Reddito)</span>
        <span>Forza Titolari: ⚡${formatNumber(stats.squadPower)}</span>
      </div>
      <div class="pack-grid">${packsHtml}</div>

      <div class="section-label" style="margin-top:8px;">
        <span>Formazione Titolare (${starters.filter((s) => s.player).length}/${FORMATION_SLOTS_DEF.length})</span>
        <button type="button" class="mini-btn primary" id="btn-auto-lineup">⚡ Auto-schiera migliori</button>
      </div>
      <div class="formation-card">
        <div class="formation-hint">Solo i 5 titolari schierati applicano bonus e Forza Rosa. Tocca uno slot per cambiare!</div>
        <div class="formation-grid">${formationHtml}</div>
      </div>

      <div class="section-label" style="margin-top:8px;">
        <span>Leggende Segrete (${discovered.size}/${SECRET_PLAYERS.length})</span>
        <span>Bacheca permanente</span>
      </div>
      <div class="secret-grid">${secretSlotsHtml}</div>

      <div class="section-label" style="margin-top:8px;">
        <span>Panchina (${benchPlayers.length})</span>
        <span>Fondi ★ o Vendi (+🪙)</span>
      </div>
      <div class="roster-list">${benchHtml}</div>
    `;
  }

  _renderChallengesHtml(state) {
    const doneSet = new Set(state.completedChallenges || []);
    const cards = PRESIDENT_CHALLENGES.map((ch) => {
      const done = doneSet.has(ch.id);
      let statusHtml = `<span class="upgrade-lvl" style="color:#fde047;">+${ch.tokenReward} 🪙 • +${ch.globalPct}%</span>`;
      if (done) {
        statusHtml = `<span class="starter-tag">✓ COMPLETATA (+${ch.globalPct}%)</span>`;
      } else if (ch.id === 'clean_sheet_3') {
        statusHtml = `<span class="upgrade-lvl" style="color:#93c5fd;">Serie ${state.cleanSheetStreak || 0}/3 • +${ch.tokenReward} 🪙</span>`;
      } else if (ch.id === 'austerity' && state.boughtIncomeUpgradeThisRun) {
        statusHtml = `<span class="upgrade-lvl" style="color:#fca5a5;">Riprova dopo Prestige</span>`;
      }
      return `
        <div class="challenge-card ${done ? 'done' : ''}">
          <div class="challenge-ico">${ch.icon}</div>
          <div class="challenge-body">
            <div class="challenge-head">
              <span class="challenge-name">${escapeHTML(ch.name)}</span>
              ${statusHtml}
            </div>
            <div class="challenge-desc">${escapeHTML(ch.desc)}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="section-label" style="margin-top:8px;">
        <span>Sfide del Presidente (${doneSet.size}/${PRESIDENT_CHALLENGES.length})</span>
        <span style="color:#86efac;">+${doneSet.size * 5}% globale</span>
      </div>
      <div class="challenge-list">${cards}</div>
    `;
  }

  _renderSpareggio(state, matchCtrl) {
    const { league, round, stageIdx, isKnockoutBracket, rounds } = getCurrentMatchRound(state);
    const nextLeague = LEAGUES[state.leagueIndex + 1] || null;
    const readyNewSeason = canStartNewSeason(state);
    const challengesHtml = this._renderChallengesHtml(state);

    if (readyNewSeason) {
      const nextSeason = (state.seasonNumber || 1) + 1;
      const nextStars = (state.seasonStars || 0) + 1;
      const nextMult = Math.pow(2, nextStars);
      this.container.innerHTML = `
        <div class="match-card" style="border-color:rgba(250,204,21,0.65);">
          <div style="font-size:16px;font-weight:900;color:#fde047;">🌌 Campioni della Superlega Galattica!</div>
          <div style="font-size:12.5px;color:#cbd5e1;line-height:1.45;">
            Hai completato tutte e <strong>7 le Categorie</strong> della Stagione ${state.seasonNumber || 1}!<br/>
            Avvia la <strong>Stagione ${nextSeason}</strong> per incidere la <strong>${nextStars}ª Stella d'Oro ★</strong> sul tuo Club (moltiplicatore permanente <strong>×${nextMult}</strong>) e incassare <strong>+${SEASON_BONUS_TOKENS} 🪙 Gettoni d'Oro</strong>!
          </div>
          <button type="button" class="cta-btn season-btn" id="btn-new-season">
            ★ Avvia Stagione ${nextSeason} (+1 ★ ×${nextMult} & +${SEASON_BONUS_TOKENS} 🪙)
          </button>
        </div>
        ${challengesHtml}
      `;
      return;
    }

    const check = getChecklistStatus(state);
    const ready = canStartSpareggio(state);
    const selectedTactic = TACTICS[state.selectedTactic] || TACTICS.contropiede;
    const stats = computeStats(state);

    const bracketHtml = isKnockoutBracket
      ? `
        <div class="bracket-bar">
          <div class="bracket-step ${stageIdx > 0 ? 'done' : 'current'}">
            ${stageIdx > 0 ? '✓ ' : ''}1. Semifinale (${escapeHTML(rounds[0].opponent)})
          </div>
          <span style="color:#64748b;">→</span>
          <div class="bracket-step ${stageIdx === 1 ? 'current' : ''}">
            2. Finale (${escapeHTML(rounds[1].opponent)})
          </div>
        </div>
      `
      : '';

    const goalDesc =
      isKnockoutBracket && stageIdx === 0
        ? `Vinci la <strong>Semifinale</strong> contro <strong>${escapeHTML(round.opponent)}</strong> per accedere alla Finale!`
        : nextLeague
          ? `Vinci contro <strong>${escapeHTML(round.opponent)}</strong> per salire in <strong>${escapeHTML(nextLeague.name)}</strong> (moltiplicatore <strong>x${nextLeague.multiplier}</strong> + <strong>${league.promotionTokens} 🪙</strong>)!`
          : `Vinci la <strong>Finale Galattica</strong> contro <strong>${escapeHTML(round.opponent)}</strong> (+<strong>${league.promotionTokens} 🪙</strong>) per sbloccare la Nuova Stagione ★!`;

    const activePassives = [];
    if (stats.hasPorcotrio) activePassives.push('🔥 Istinto Killer (Porcotrio): +22% zona gol su TIRA!');
    if (stats.hasLoma) activePassives.push('⚡ Muro Invalicabile (Loma): +25% finestra PARA! & Rigori più lenti');
    if (stats.hasPscon) activePassives.push('🪨 Muro di Granito (Tumas Pscon): -1 attacco rivale + 1º gol subito annullato!');
    if (stats.hasVavelocino) activePassives.push('💨 Turbo a Centrocampo (Vavelocino): +25% possesso & cooldown 2,4s!');
    const passivesHtml =
      activePassives.length > 0
        ? `<div class="passive-banner">${activePassives.map((l) => `<span>${l}</span>`).join('')}</div>`
        : '';

    const tacticButtons = [
      { id: 'catenaccio', icon: 'shield', label: 'Catenaccio' },
      { id: 'contropiede', icon: 'bolt', label: 'Contropiede' },
      { id: 'tutto', icon: 'flame', label: 'Tutto x Tutto' },
    ]
      .map(
        (t) => `
          <button type="button" class="tactic-btn ${state.selectedTactic === t.id ? 'selected' : ''}" data-tactic-id="${t.id}">
            ${iconSvg(t.icon, 'svg-ico')}
            <span>${t.label}</span>
          </button>
        `
      )
      .join('');

    this.container.innerHTML = `
      <div class="match-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span style="font-size:14.5px;font-weight:900;color:#fef08a;display:inline-flex;align-items:center;gap:6px;">
            ${iconSvg('trophy', 'svg-ico')} ${escapeHTML(round.roundName)}
          </span>
          <span class="league-pill" style="background:${league.badgeColor};">Stag.${state.seasonNumber || 1} • ${escapeHTML(league.shortName)}</span>
        </div>

        ${bracketHtml}

        <div style="font-size:12px;color:#cbd5e1;line-height:1.38;">
          ${goalDesc}<br/>
          <span style="color:#94a3b8;">Partita 0'–90' (28s): ferma l'anello <strong style="color:#4ade80;">TIRA!</strong> sul verde per segnare e blocca <strong style="color:#f87171;">PARA!</strong> in tempo. Pari al 90° = Rigori!</span>
        </div>

        ${passivesHtml}

        <div class="checklist-box">
          <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;">
            Checklist Presidente (3/3 per sbloccare)
          </div>

          <div class="checklist-row">
            <div class="checklist-head">
              <span>1. Incassi di categoria</span>
              <span id="chk-cash-txt" class="${check.cash.done ? 'check-ok' : ''}">
                ${formatMoney(Math.min(check.cash.current, check.cash.target))} / ${formatMoney(check.cash.target)}
              </span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${check.cash.done ? 'done' : ''}" id="chk-cash-fill" style="width:${check.cash.pct.toFixed(1)}%;"></div>
            </div>
          </div>

          <div class="checklist-row">
            <div class="checklist-head">
              <span>2. Forza Titolari minima (5 Slot)</span>
              <span class="${check.squadPower.done ? 'check-ok' : ''}">
                ⚡${formatNumber(check.squadPower.current)} / ⚡${formatNumber(check.squadPower.target)}
              </span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${check.squadPower.done ? 'done' : ''}" style="width:${check.squadPower.pct.toFixed(1)}%;"></div>
            </div>
          </div>

          <div class="checklist-row">
            <div class="checklist-head">
              <span>3. Livello Infrastrutture (Club)</span>
              <span class="${check.infra.done ? 'check-ok' : ''}">
                Lv.${check.infra.current} / Lv.${check.infra.target}
              </span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${check.infra.done ? 'done' : ''}" style="width:${check.infra.pct.toFixed(1)}%;"></div>
            </div>
          </div>
        </div>

        <div class="tactic-grid">${tacticButtons}</div>
        <div class="tactic-detail">
          <strong>${escapeHTML(selectedTactic.name)}:</strong> ${escapeHTML(selectedTactic.detail)}
        </div>

        <button type="button" class="cta-btn" id="btn-start-match" ${ready && !matchCtrl.active ? '' : 'disabled'}>
          ${iconSvg('whistle', 'svg-ico')}
          <span>${matchCtrl.active ? 'Partita in Corso...' : ready ? `Calcio d'Inizio vs ${escapeHTML(round.opponent)}!` : 'Completa la Checklist Presidente'}</span>
        </button>
      </div>
      ${challengesHtml}
    `;
  }

  _renderSocieta(state) {
    const stats = computeStats(state);
    const profile = computePresidentProfile(state);
    const prestigeReady = canPrestige(state);
    const pendingShares = getPendingPrestigeShares(state);
    const currentShares = state.prestigeShares || 0;
    const sharePct = stats.research.shareBonusPct;
    const nextMult = 1 + ((currentShares + pendingShares) * sharePct) / 100;

    const p = state.clubColors.primary;
    const s = state.clubColors.secondary;
    const previewBg = `linear-gradient(90deg, ${p} 0%, ${p} 36%, ${s} 36%, ${s} 64%, ${p} 64%, ${p} 100%)`;

    const researchHtml = PERMANENT_RESEARCHES.map((def) => {
      const lvl = getResearchLevel(state, def.id);
      const cost = getResearchCost(state, def);
      const isMax = cost === null;
      const canBuy = !isMax && (state.goldTokens || 0) >= cost;
      return `
        <div class="research-card">
          <div class="upgrade-left">
            <div class="upgrade-icon">${def.icon}</div>
            <div class="upgrade-info">
              <div class="upgrade-title-row">
                <span class="upgrade-name">${escapeHTML(def.name)}</span>
                <span class="upgrade-lvl">Lv.${lvl}/${def.maxLevel}</span>
              </div>
              <div class="upgrade-desc">${escapeHTML(def.desc)}</div>
              <div class="upgrade-effect" style="color:#fde047;">${escapeHTML(def.effectLabel(lvl))}</div>
            </div>
          </div>
          <button type="button" class="token-buy-btn" data-research-id="${def.id}" ${canBuy ? '' : 'disabled'}>
            ${isMax ? 'MAX' : `🪙 ${cost}`}
          </button>
        </div>
      `;
    }).join('');

    const presetHtml = CLUB_COLOR_PRESETS.map(
      (pr) => `
        <button type="button" class="preset-chip" data-preset-primary="${pr.primary}" data-preset-secondary="${pr.secondary}">
          <span class="club-swatch" style="background:linear-gradient(90deg,${pr.primary} 50%,${pr.secondary} 50%);"></span>
          <span>${pr.label}</span>
        </button>
      `
    ).join('');

    const trophiesHtml = LEAGUES.map((lg) => {
      const won = state.trophies.includes(lg.trophyId);
      return `
        <div class="trophy-slot ${won ? 'won' : ''}">
          <div class="trophy-ico">${lg.trophyIcon}</div>
          <div class="trophy-lbl">${escapeHTML(lg.trophyName)}</div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <!-- PROFILO PRESIDENTE & ALBUM DEL CLUB -->
      <div class="card president-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <div>
            <div style="font-size:10px;font-weight:900;color:#93c5fd;text-transform:uppercase;letter-spacing:0.5px;">
              Livello Presidente • Stagione ${state.seasonNumber || 1}
            </div>
            <div style="font-size:14.5px;font-weight:900;color:#fde047;">
              Lv.${profile.level} — ${escapeHTML(profile.title)}
            </div>
          </div>
          <span class="upgrade-lvl" style="color:#fde047;background:rgba(250,204,21,0.18);">
            ${profile.stars > 0 ? `★×${profile.stars} (×${stats.seasonMult})` : 'Stagione 1'}
          </span>
        </div>
        <div class="progress-track" style="height:7px;">
          <div class="progress-fill" style="width:${profile.pct.toFixed(1)}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;font-weight:700;">
          <span>XP ${profile.inLevelXp}/${profile.stepXp}</span>
          <span>Totale: ${formatNumber(profile.xp)} XP</span>
        </div>
        <div class="album-grid">
          <div class="album-pill">🏆 Trofei <strong>${profile.trophies}/${profile.totalTrophies}</strong></div>
          <div class="album-pill">🌟 Segreti <strong>${profile.secrets}/${profile.totalSecrets}</strong></div>
          <div class="album-pill">🏅 Sfide <strong>${profile.challenges}/${profile.totalChallenges}</strong></div>
          <div class="album-pill">🐹 Mascotte <strong>Polpetta</strong></div>
        </div>
        <button type="button" class="cta-btn" id="btn-copy-whatsapp" style="padding:9px 12px;font-size:12.5px;background:linear-gradient(135deg,#16a34a,#059669);box-shadow:0 4px 14px rgba(16,185,129,0.3);">
          📋 Copia Scheda Club per WhatsApp
        </button>
      </div>

      <!-- PRESTIGE AUTENTICO: AZIONI DEL FONDO -->
      <div class="card" style="display:flex;flex-direction:column;gap:8px;border-color:rgba(124,58,237,0.45);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:13.5px;display:inline-flex;align-items:center;gap:6px;">
            ${iconSvg('briefcase', 'svg-ico')} Fondo Estero (Prestige)
          </strong>
          <span class="upgrade-lvl" style="color:#fde047;background:rgba(251,191,36,0.18);">
            ${currentShares} Azioni (×${stats.prestigeMult.toFixed(2).replace('.', ',')})
          </span>
        </div>
        <div style="font-size:11.5px;color:#cbd5e1;line-height:1.4;">
          Ogni Azione dona <strong>+${sharePct}%</strong> globale permanente e <strong>+2%</strong> rendimento rosa!<br/>
          Incassi run attuale: <strong>${formatMoney(state.runEarned || 0)}</strong> →
          Azioni pronte: <strong id="prestige-pending-val" style="color:#4ade80;">+${pendingShares}</strong>
          (nuovo mult. <strong>×${nextMult.toFixed(2).replace('.', ',')}</strong>).
        </div>
        <button type="button" class="cta-btn prestige-btn" id="btn-prestige" ${prestigeReady ? '' : 'disabled'}>
          ${prestigeReady ? `🚁 Vendi al Fondo (+${pendingShares} Azioni)` : `Sblocca in Serie C o con ${formatMoney(PRESTIGE_UNLOCK_RUN_CASH)} incassati`}
        </button>
      </div>

      <!-- RICERCHE PERMANENTI (GETTONI D'ORO) -->
      <div class="section-label">
        <span style="display:inline-flex;align-items:center;gap:5px;">${iconSvg('flask', 'svg-ico sm')} Ricerche Permanenti</span>
        <span style="color:#fde047;">🪙 ${formatNumber(state.goldTokens || 0)} Gettoni</span>
      </div>
      ${researchHtml}

      <!-- IDENTITÀ CLUB -->
      <div class="section-label" style="margin-top:6px;"><span>Identità & Maglia Club</span></div>
      <div class="card club-editor">
        <div class="club-input-row">
          <div class="jersey-preview" id="club-jersey-preview" style="background:${previewBg};">10</div>
          <input type="text" id="input-club-name" class="club-name-input" maxlength="22"
                 value="${escapeHTML(state.clubName)}" placeholder="Nome del tuo Club" />
        </div>
        <div class="color-pickers">
          <label class="color-field">
            <span>Colore 1</span>
            <input type="color" id="input-color-primary" value="${escapeHTML(p)}" />
          </label>
          <label class="color-field">
            <span>Colore 2</span>
            <input type="color" id="input-color-secondary" value="${escapeHTML(s)}" />
          </label>
        </div>
        <div class="preset-row">${presetHtml}</div>
      </div>

      <div class="section-label">
        <span>Bacheca Trofei (${state.trophies.length}/${LEAGUES.length})</span>
        <span>Vendite: ${state.prestigeCount}</span>
      </div>
      <div class="trophy-grid">${trophiesHtml}</div>

      <div class="section-label"><span>Statistiche Carriera</span></div>
      <div class="stat-grid">
        <div class="stat-item"><span>Incassi Totali</span><strong>${formatMoney(state.totalEarned)}</strong></div>
        <div class="stat-item"><span>Record /sec</span><strong>${formatMoney(Math.max(state.stats.maxIncomePerSec || 0, stats.incomePerSec))}/s</strong></div>
        <div class="stat-item"><span>Buste Aperte</span><strong>${state.stats.packsOpened}</strong></div>
        <div class="stat-item"><span>Match Vinti</span><strong>${state.stats.matchesWon}</strong></div>
      </div>

      <div class="section-label"><span>Audio Separato & Salvataggio</span></div>
      <div class="settings-grid">
        <button type="button" class="sec-btn" id="btn-toggle-music">
          ${iconSvg(state.musicEnabled ? 'musicOn' : 'musicOff', 'svg-ico sm')}
          <span>${state.musicEnabled ? 'Musica: ON' : 'Musica: OFF'}</span>
        </button>
        <button type="button" class="sec-btn" id="btn-toggle-sfx">
          ${iconSvg(state.sfxEnabled ? 'audioOn' : 'audioOff', 'svg-ico sm')}
          <span>${state.sfxEnabled ? 'Effetti: ON' : 'Effetti: OFF'}</span>
        </button>
        <button type="button" class="sec-btn" id="btn-export">
          ${iconSvg('export', 'svg-ico sm')}<span>Esporta Base64</span>
        </button>
        <button type="button" class="sec-btn" id="btn-import">
          ${iconSvg('import', 'svg-ico sm')}<span>Importa Base64</span>
        </button>
      </div>
      <button type="button" class="sec-btn danger" id="btn-reset" style="width:100%;">
        ${iconSvg('trash', 'svg-ico sm')}<span>Reset Completo Partita</span>
      </button>
    `;
  }
}
