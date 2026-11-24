import { DEMO_AD_SECONDS, RARITIES, MAX_PLAYER_STARS } from '../config.js';
import { formatMoney, formatDuration, escapeHTML } from '../format.js';
import {
  formatPlayerBonus,
  getPlayerEffectivePower,
  canFuseBenchIntoStarter,
} from '../gacha.js';
import { audio } from '../audio.js';
import { iconSvg } from './icons.js';
import { getGinoAvatarSvg } from '../assistant.js';

export class ModalManager {
  constructor() {
    this.root = document.getElementById('modal-root');
    this.toastRoot = document.getElementById('toast-root');
    this.penaltyDock = document.getElementById('penalty-dock');
    this._timerId = null;
  }

  close() {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  hidePenaltyDock() {
    if (this.penaltyDock) {
      this.penaltyDock.classList.add('hidden');
      this.penaltyDock.innerHTML = '';
    }
  }

  toast(message, durationMs = 2400) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.toastRoot.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, durationMs);
  }

  _open(html) {
    this.close();
    this.root.innerHTML = `<div class="modal-box">${html}</div>`;
    this.root.classList.remove('hidden');
  }

  /**
   * Pannello Calci di Rigore ancorato nella metà inferiore (.tabs-panel),
   * lasciando il Canvas dello stadio in alto completamente visibile e libero!
   */
  renderPenaltyDock(matchCtrl, state, { onSelectCorner, onShoot, onDive }) {
    const pen = matchCtrl.penalties;
    if (!pen || !this.penaltyDock) return;

    this.penaltyDock.classList.remove('hidden');

    const totalSlots = Math.max(5, pen.myLog.length, pen.oppLog.length);
    const buildDots = (log) => {
      let out = '';
      for (let i = 0; i < totalSlots; i++) {
        const cls = log[i] === 'goal' ? 'goal' : log[i] === 'miss' ? 'miss' : '';
        out += `<span class="pen-dot ${cls}"></span>`;
      }
      return out;
    };

    const greenLeft = (0.5 - pen.greenHalf) * 100;
    const greenWidth = pen.greenHalf * 2 * 100;
    const yellowLeft = (0.5 - pen.yellowHalf) * 100;
    const yellowWidth = pen.yellowHalf * 2 * 100;

    const controlsHtml =
      pen.turn === 'player'
        ? `
          <div class="pen-corners">
            <button type="button" class="pen-corner-btn ${pen.selectedCorner === 'left' ? 'selected' : ''}" data-pen-corner="left" ${pen.locked ? 'disabled' : ''}>⬅ Sinistra</button>
            <button type="button" class="pen-corner-btn ${pen.selectedCorner === 'center' ? 'selected' : ''}" data-pen-corner="center" ${pen.locked ? 'disabled' : ''}>⬆ Centro</button>
            <button type="button" class="pen-corner-btn ${pen.selectedCorner === 'right' ? 'selected' : ''}" data-pen-corner="right" ${pen.locked ? 'disabled' : ''}>Destra ➡</button>
          </div>
          <div class="pen-timing-track" id="pen-timing-track">
            <div class="pen-zone-yellow" style="left:${yellowLeft.toFixed(1)}%;width:${yellowWidth.toFixed(1)}%;"></div>
            <div class="pen-zone-green" style="left:${greenLeft.toFixed(1)}%;width:${greenWidth.toFixed(1)}%;"></div>
            <div class="pen-cursor" id="pen-cursor" style="left:${(pen.cursor * 100).toFixed(1)}%;"></div>
          </div>
          <button type="button" class="cta-btn" id="btn-pen-shoot" ${pen.locked ? 'disabled' : ''}>
            ${iconSvg('ball', 'svg-ico')} <span>TIRA RIGORE!</span>
          </button>
        `
        : `
          <div style="font-size:11.5px;color:#93c5fd;text-align:center;font-weight:800;">
            Tuffo Portiere — Scegli dove parare il tiro di ${escapeHTML(matchCtrl.opponent)}:
          </div>
          <div class="pen-corners">
            <button type="button" class="cta-btn" style="padding:12px 6px;font-size:12px;" data-pen-dive="left" ${pen.locked ? 'disabled' : ''}>🧤 Sinistra</button>
            <button type="button" class="cta-btn" style="padding:12px 6px;font-size:12px;" data-pen-dive="center" ${pen.locked ? 'disabled' : ''}>🧤 Centro</button>
            <button type="button" class="cta-btn" style="padding:12px 6px;font-size:12px;" data-pen-dive="right" ${pen.locked ? 'disabled' : ''}>🧤 Destra</button>
          </div>
        `;

    this.penaltyDock.innerHTML = `
      <div class="pen-header">
        <span class="pen-title">${iconSvg('whistle', 'svg-ico')} CALCI DI RIGORE ${pen.suddenDeath ? '(OLTRANZA)' : ''}</span>
        <span class="pen-score-pill">${pen.myScore} - ${pen.oppScore}</span>
      </div>

      <div class="pen-dots-wrap">
        <div class="pen-dots-row">
          <span>${escapeHTML(state.clubName)}</span>
          <div class="pen-dots">${buildDots(pen.myLog)}</div>
        </div>
        <div class="pen-dots-row" style="color:#94a3b8;">
          <span>${escapeHTML(matchCtrl.opponent)}</span>
          <div class="pen-dots">${buildDots(pen.oppLog)}</div>
        </div>
      </div>

      <div class="pen-msg">${escapeHTML(pen.lastMessage)}</div>
      ${controlsHtml}
    `;

    this.penaltyDock.querySelectorAll('[data-pen-corner]').forEach((btn) => {
      btn.addEventListener('click', () => onSelectCorner(btn.dataset.penCorner));
    });
    this.penaltyDock.querySelector('#btn-pen-shoot')?.addEventListener('click', () => onShoot());
    this.penaltyDock.querySelector('#pen-timing-track')?.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (!pen.locked) onShoot();
    });
    this.penaltyDock.querySelectorAll('[data-pen-dive]').forEach((btn) => {
      btn.addEventListener('click', () => onDive(btn.dataset.penDive));
    });
  }

  updatePenaltyCursor(cursorNorm) {
    const el = document.getElementById('pen-cursor');
    if (el) {
      el.style.left = `${(cursorNorm * 100).toFixed(1)}%`;
    }
  }

  showRewardedVideoDemo({ title = 'Sponsor TV — Video Premiato (Demo)', rewardLabel = 'Boost x2 per 60s', onComplete }) {
    let remaining = DEMO_AD_SECONDS;
    this._open(`
      <h2 class="modal-title">${iconSvg('bolt', 'svg-ico')} ${escapeHTML(title)}</h2>
      <div class="modal-body">
        Simulazione spot premiato pronta per futura integrazione SDK rewarded video.<br/>
        Premio: <strong>${escapeHTML(rewardLabel)}</strong>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="ad-demo-bar" style="width: 0%"></div>
      </div>
      <div class="modal-body" id="ad-demo-count">Attendi <strong>${remaining}s</strong>...</div>
    `);

    const bar = document.getElementById('ad-demo-bar');
    const lbl = document.getElementById('ad-demo-count');
    const started = performance.now();
    const totalMs = DEMO_AD_SECONDS * 1000;

    this._timerId = setInterval(() => {
      const elapsed = performance.now() - started;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      if (bar) bar.style.width = `${pct}%`;
      const left = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      if (lbl && left !== remaining) {
        remaining = left;
        lbl.innerHTML = `Attendi <strong>${remaining}s</strong>...`;
      }
      if (elapsed >= totalMs) {
        this.close();
        if (onComplete) onComplete();
      }
    }, 80);
  }

  showOfflineEarnings(offline, { onClaim, onDoubleWithAd }) {
    const capNote = offline.wasCapped ? ` (limite max ${offline.capHours || 2}h — espandibile con Ritiro H24)` : '';
    this._open(`
      <h2 class="modal-title">🌙 Bentornato Presidente!</h2>
      <div class="modal-body">
        Sei stato via per <strong>${formatDuration(offline.elapsedSec)}</strong>${capNote}.<br/>
        Mentre eri via hai incassato:
        <div style="font-size:28px;font-weight:900;color:#fde047;margin:10px 0;">
          ${formatMoney(offline.amount)}
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="cta-btn" id="btn-offline-double">
          ${iconSvg('bolt', 'svg-ico')} <span>Raddoppia ${formatMoney(offline.amount * 2)} (Demo 5s)</span>
        </button>
        <button type="button" class="sec-btn" id="btn-offline-claim">
          Incassa ${formatMoney(offline.amount)}
        </button>
      </div>
    `);

    document.getElementById('btn-offline-claim')?.addEventListener('click', () => {
      this.close();
      onClaim(offline.amount);
    });

    document.getElementById('btn-offline-double')?.addEventListener('click', () => {
      this.showRewardedVideoDemo({
        title: 'Raddoppia Incassi Offline',
        rewardLabel: `${formatMoney(offline.amount * 2)} in cassa`,
        onComplete: () => onDoubleWithAd(offline.amount * 2),
      });
    });
  }

  showPackOpening(result, onDone) {
    const { pack, player, outcome, refundAmount } = result;
    const rarity = RARITIES[player.rarity] || RARITIES.comune;
    const holoClass =
      player.rarity === 'segreto'
        ? 'holo-segreto'
        : player.rarity === 'leggenda'
          ? 'holo-leggenda'
          : player.rarity === 'epico'
            ? 'holo-epico'
            : '';

    this._open(`
      <h2 class="modal-title">${pack.icon} ${escapeHTML(pack.name)}</h2>
      <div class="pack-stage" id="pack-stage">
        <div class="pack-foil">
          ${pack.icon}
          <span>Apertura...</span>
        </div>
      </div>
      <div class="modal-actions hidden" id="pack-done-wrap">
        <button type="button" class="cta-btn" id="btn-pack-close">Fantastico!</button>
      </div>
    `);

    audio.playPackOpen(player.rarity);

    setTimeout(() => {
      const stage = document.getElementById('pack-stage');
      const doneWrap = document.getElementById('pack-done-wrap');
      if (!stage) return;

      const starsStr = '★'.repeat(player.stars) + '☆'.repeat(Math.max(0, MAX_PLAYER_STARS - player.stars));
      let outcomeText =
        player.rarity === 'segreto'
          ? '🌟 LEGGENDA SEGRETA SBLOCCATA IN BACHECA!'
          : '✨ Nuovo giocatore in rosa!';
      if (outcome === 'fused') {
        outcomeText = `🔥 Doppione fuso! Sale a ${player.stars}★ (+25% bonus)`;
      } else if (outcome === 'maxed_refund') {
        outcomeText = `💰 Già al massimo (5★)! Rimborso cassa +${formatMoney(refundAmount)}`;
      }

      const secretExtras =
        player.rarity === 'segreto'
          ? `
            <div style="font-size:11px;color:#e2e8f0;margin-top:6px;line-height:1.35;">${escapeHTML(player.bio || '')}</div>
            <div class="secret-ability-pill" style="margin-top:6px;">${escapeHTML(player.abilityName)}: ${escapeHTML(player.abilityDesc)}</div>
          `
          : '';

      stage.innerHTML = `
        <div class="reveal-card ${holoClass}" style="border-color:${rarity.color}; box-shadow: 0 0 26px ${rarity.glow};">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="rarity-tag" style="background:${rarity.bg};color:${rarity.color};">${rarity.label}</span>
            <span style="font-size:12px;font-weight:900;color:#cbd5e1;">#${player.jerseyNumber} • ${player.role}</span>
          </div>
          <div class="reveal-player-name">${escapeHTML(player.name)}</div>
          <div class="reveal-stars">${starsStr}</div>
          <div class="reveal-bonus">${escapeHTML(formatPlayerBonus(player))} • ⚡ ${getPlayerEffectivePower(player)} Forza</div>
          ${secretExtras}
          <div class="reveal-outcome">${outcomeText}</div>
        </div>
      `;

      doneWrap?.classList.remove('hidden');
      document.getElementById('btn-pack-close')?.addEventListener('click', () => {
        this.close();
        if (onDone) onDone();
      });
    }, 820);
  }

  showMatchResult(result, clubName, onClose) {
    const scoreLine = result.byPenalties
      ? `<strong>${escapeHTML(clubName)} ${result.myGoals} - ${result.oppGoals} ${escapeHTML(result.opponent)}</strong> (${result.myPen}-${result.oppPen} d.c.r.)`
      : `<strong>${escapeHTML(clubName)} ${result.myGoals} - ${result.oppGoals} ${escapeHTML(result.opponent)}</strong>`;

    if (result.won) {
      const tokLine = result.tokensAwarded ? ` + <strong>${result.tokensAwarded} 🪙 Gettoni d'Oro</strong>` : '';
      let headline = `🏆 PROMOSSO IN ${result.newLeague.name.toUpperCase()}!`;
      let desc = `${scoreLine}<br/><br/>Lo stadio si trasforma in <strong>${escapeHTML(result.newLeague.name)}</strong> (moltiplicatore <strong>x${result.newLeague.multiplier}</strong>), vinci <strong>${escapeHTML(result.trophyName)}</strong>${tokLine}!`;

      if (result.semifinalWon) {
        headline = '🔥 QUALIFICATO ALLA FINALE!';
        desc = `${scoreLine}<br/><br/>Semifinale superata${tokLine}! Ora ti attende la <strong>${escapeHTML(result.nextRound.roundName)}</strong> contro <strong>${escapeHTML(result.nextRound.opponent)}</strong>!`;
      } else if (result.finalCup) {
        headline = '🌌 CAMPIONI DELLA SUPERLEGA!';
        desc = `${scoreLine}<br/><br/>Hai conquistato <strong>${escapeHTML(result.trophyName)}</strong>${tokLine}! Ora puoi avviare la <strong>Nuova Stagione</strong> nella tab Spareggio per ottenere una <strong>Stella d'Oro ★ (×2 permanente)</strong> e <strong>+25 🪙</strong>!`;
      }

      if (result.newChallenges && result.newChallenges.length > 0) {
        const chNames = result.newChallenges.map((c) => `${c.icon} ${c.name} (+${c.tokenReward} 🪙)`).join(', ');
        desc += `<br/><br/><span style="color:#fde047;font-weight:800;">🏅 Sfida completata: ${escapeHTML(chNames)}</span>`;
      }

      this._open(`
        <h2 class="modal-title">${headline}</h2>
        <div class="modal-body">${desc}</div>
        <div class="modal-actions">
          <button type="button" class="cta-btn" id="btn-match-ok">Avanti Presidente!</button>
        </div>
      `);
    } else {
      const retryHint = result.stayedAtFinal
        ? 'Resti comunque qualificato in <strong>Finale</strong>: puoi ritentare direttamente la Finale!'
        : 'Cambia tattica, potenzia il Club o fai Scouting e riprova subito!';

      this._open(`
        <h2 class="modal-title">⏱️ Fischio Finale — Sconfitta</h2>
        <div class="modal-body">
          ${scoreLine}<br/><br/>${retryHint}
        </div>
        <div class="modal-actions">
          <button type="button" class="sec-btn" id="btn-match-ok">Torna allo Stadio</button>
        </div>
      `);
    }

    document.getElementById('btn-match-ok')?.addEventListener('click', () => {
      this.close();
      if (onClose) onClose();
    });
  }

  showExportSave(base64) {
    this._open(`
      <h2 class="modal-title">${iconSvg('export', 'svg-ico')} Esporta Salvataggio</h2>
      <div class="modal-body">Copia questa stringa Base64 per ripristinare il club su un altro dispositivo.</div>
      <textarea class="modal-textarea" id="export-b64" readonly>${escapeHTML(base64)}</textarea>
      <div class="modal-actions">
        <button type="button" class="cta-btn" id="btn-copy-b64">Copia negli Appunti</button>
        <button type="button" class="sec-btn" id="btn-close-modal">Chiudi</button>
      </div>
    `);

    document.getElementById('btn-copy-b64')?.addEventListener('click', async () => {
      const ta = document.getElementById('export-b64');
      try {
        await navigator.clipboard.writeText(base64);
        this.toast('Salvataggio copiato!');
      } catch {
        ta?.select();
        document.execCommand('copy');
        this.toast('Stringa selezionata e copiata!');
      }
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.close());
  }

  showImportSave(onImport) {
    this._open(`
      <h2 class="modal-title">${iconSvg('import', 'svg-ico')} Importa Salvataggio</h2>
      <div class="modal-body">Incolla la stringa Base64 esportata (compatibile anche con salvataggi v1!).</div>
      <textarea class="modal-textarea" id="import-b64" placeholder="Incolla qui la stringa Base64..."></textarea>
      <div class="modal-actions">
        <button type="button" class="cta-btn" id="btn-do-import">Carica Salvataggio</button>
        <button type="button" class="sec-btn" id="btn-close-modal">Annulla</button>
      </div>
    `);

    document.getElementById('btn-do-import')?.addEventListener('click', () => {
      const val = document.getElementById('import-b64')?.value || '';
      const ok = onImport(val);
      if (ok) this.close();
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.close());
  }

  showDilemmaModal(dilemma, { clubPrimary, onChoice, onDismiss }) {
    this._open(`
      <div style="display:flex;align-items:center;gap:10px;text-align:left;">
        <div style="width:48px;height:48px;flex-shrink:0;">${getGinoAvatarSvg(clubPrimary)}</div>
        <div>
          <div style="font-size:11px;font-weight:900;color:#fbbf24;text-transform:uppercase;">Gino il DS — Dilemma Lampo</div>
          <h2 class="modal-title" style="font-size:16px;margin-top:2px;">${escapeHTML(dilemma.title)}</h2>
        </div>
      </div>
      <div class="modal-body" style="text-align:left;">${escapeHTML(dilemma.desc)}</div>
      <div class="modal-actions">
        <button type="button" class="cta-btn" id="btn-dilemma-a" style="flex-direction:column;gap:2px;padding:10px;">
          <span>${escapeHTML(dilemma.optionA.label)}</span>
          <span style="font-size:10.5px;opacity:0.9;font-weight:700;">${escapeHTML(dilemma.optionA.sub)}</span>
        </button>
        <button type="button" class="sec-btn" id="btn-dilemma-b" style="flex-direction:column;gap:2px;padding:10px;border-color:rgba(251,191,36,0.45);">
          <span>${escapeHTML(dilemma.optionB.label)}</span>
          <span style="font-size:10.5px;color:#fde047;font-weight:700;">${escapeHTML(dilemma.optionB.sub)}</span>
        </button>
      </div>
    `);

    document.getElementById('btn-dilemma-a')?.addEventListener('click', () => {
      this.close();
      onChoice('A');
    });
    document.getElementById('btn-dilemma-b')?.addEventListener('click', () => {
      this.close();
      onChoice('B');
    });
    if (onDismiss) {
      this.root.addEventListener(
        'click',
        (ev) => {
          if (ev.target === this.root) {
            this.close();
            onDismiss();
          }
        },
        { once: true }
      );
    }
  }

  showPrestigeConfirm({ gainedShares, totalShares, nextMult, sharePct }, onConfirm) {
    this._open(`
      <h2 class="modal-title">${iconSvg('briefcase', 'svg-ico')} Vendi al Fondo Estero</h2>
      <div class="modal-body">
        L'elicottero del fondo è pronto ad atterrare!<br/><br/>
        • Ricevi <strong>+${gainedShares} Azioni</strong> (Totale: <strong>${totalShares}</strong> → moltiplicatore globale <strong>×${nextMult.toFixed(2).replace('.', ',')}</strong>, +${sharePct}% ciascuna).<br/>
        • <strong>Mantieni per sempre</strong>: Gettoni d'Oro, Ricerche Permanenti, Trofei, Leggende Segrete scoperte, Nome e Colori Club.<br/>
        • Riparti dalla <strong>Terza Categoria</strong> per sfondare il muro a razzo!
      </div>
      <div class="modal-actions">
        <button type="button" class="cta-btn prestige-btn" id="btn-confirm-prestige">🚁 Firma Cessione (+${gainedShares} Azioni)</button>
        <button type="button" class="sec-btn" id="btn-close-modal">Annulla</button>
      </div>
    `);

    document.getElementById('btn-confirm-prestige')?.addEventListener('click', () => {
      this.close();
      onConfirm();
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.close());
  }

  showSlotPickerModal({ slotDef, currentStarter, benchCandidates, onPick, onFuse, onUnequip }) {
    const currentHtml = currentStarter
      ? `
        <div class="slot-picker-current">
          <div style="font-size:10px;color:#86efac;font-weight:900;text-transform:uppercase;">Titolare Attuale</div>
          <div style="font-size:13px;font-weight:900;color:#fff;margin-top:2px;">
            ${escapeHTML(currentStarter.name)} <span style="color:#fbbf24;">${'★'.repeat(currentStarter.stars)}</span>
          </div>
          <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">
            ${escapeHTML(formatPlayerBonus(currentStarter))} • ⚡${getPlayerEffectivePower(currentStarter)}
          </div>
          <button type="button" class="mini-btn" id="btn-slot-unequip" style="margin-top:6px;">Metti in Panchina</button>
        </div>
      `
      : `<div style="font-size:12px;color:#94a3b8;">Slot attualmente vuoto. Scegli un <strong>${slotDef.role}</strong> dalla panchina!</div>`;

    const listHtml =
      benchCandidates.length === 0
        ? `<div style="font-size:12px;color:#94a3b8;padding:10px 0;">Nessun <strong>${slotDef.role}</strong> disponibile in panchina.<br/>Apri buste Scouting per trovarne!</div>`
        : benchCandidates
            .map((p) => {
              const rar = RARITIES[p.rarity] || RARITIES.comune;
              const canFuse = currentStarter && canFuseBenchIntoStarter(p, currentStarter);
              return `
                <div class="slot-picker-row" style="border-left:3px solid ${rar.color};">
                  <div style="text-align:left;min-width:0;flex:1;">
                    <div style="font-size:12px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${escapeHTML(p.name)}
                    </div>
                    <div style="font-size:10.5px;color:#cbd5e1;">
                      <span style="color:${rar.color};font-weight:900;">${rar.label}</span> •
                      <span style="color:#fbbf24;">${'★'.repeat(p.stars)}</span> •
                      ⚡${getPlayerEffectivePower(p)}
                    </div>
                  </div>
                  <div style="display:flex;gap:5px;flex-shrink:0;">
                    <button type="button" class="mini-btn primary" data-pick-player="${p.id}">Schiera</button>
                    ${canFuse ? `<button type="button" class="mini-btn fuse" data-fuse-player="${p.id}">Fondi ★</button>` : ''}
                  </div>
                </div>
              `;
            })
            .join('');

    this._open(`
      <h2 class="modal-title">⚙️ Slot ${escapeHTML(slotDef.label)} (${slotDef.role})</h2>
      ${currentHtml}
      <div class="slot-picker-list">${listHtml}</div>
      <div class="modal-actions">
        <button type="button" class="sec-btn" id="btn-close-modal">Chiudi</button>
      </div>
    `);

    document.getElementById('btn-slot-unequip')?.addEventListener('click', () => {
      this.close();
      onUnequip();
    });
    this.root.querySelectorAll('[data-pick-player]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.close();
        onPick(btn.dataset.pickPlayer);
      });
    });
    this.root.querySelectorAll('[data-fuse-player]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.close();
        onFuse(btn.dataset.fusePlayer);
      });
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.close());
  }

  showNewSeasonConfirm({ nextSeason, nextStars, nextMult, gainedShares, bonusTokens }, onConfirm) {
    this._open(`
      <h2 class="modal-title">🌌 Avvia Stagione ${nextSeason}</h2>
      <div class="modal-body">
        Hai trionfato nella <strong>Superlega Galattica</strong>!<br/><br/>
        • Ricevi <strong>+1 ★ Stella d'Oro</strong> sul nome del Club (Totale: <strong>${nextStars}★</strong> → moltiplicatore permanente <strong>×${nextMult}</strong>!).<br/>
        • Bonus immediato: <strong>+${bonusTokens} 🪙 Gettoni d'Oro</strong>${gainedShares > 0 ? ` + <strong>+${gainedShares} Azioni Prestige</strong>` : ''}.<br/>
        • Le soglie cassa della Stagione ${nextSeason} crescono di <strong>×5</strong> per una nuova sfida leggendaria!<br/>
        • <strong>Mantieni per sempre</strong>: Stelle ★, Gettoni, Ricerche, Trofei, Segreti scoperti e Sfide.
      </div>
      <div class="modal-actions">
        <button type="button" class="cta-btn season-btn" id="btn-confirm-season">★ Inizia Stagione ${nextSeason}!</button>
        <button type="button" class="sec-btn" id="btn-close-modal">Annulla</button>
      </div>
    `);

    document.getElementById('btn-confirm-season')?.addEventListener('click', () => {
      this.close();
      onConfirm();
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.close());
  }

  showWhatsAppCardModal(cardText) {
    this._open(`
      <h2 class="modal-title">📋 Scheda Club WhatsApp</h2>
      <div class="modal-body">Tocca il pulsante qui sotto oppure tieni premuto sul riquadro per copiare e condividere!</div>
      <textarea class="modal-textarea" id="wa-card-ta" readonly style="min-height:140px;font-family:system-ui,sans-serif;font-size:12px;">${escapeHTML(cardText)}</textarea>
      <div class="modal-actions">
        <button type="button" class="cta-btn" id="btn-wa-copy-fallback">Copia Testo</button>
        <button type="button" class="sec-btn" id="btn-close-modal">Chiudi</button>
      </div>
    `);

    const ta = document.getElementById('wa-card-ta');
    if (ta) {
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, cardText.length);
    }

    document.getElementById('btn-wa-copy-fallback')?.addEventListener('click', () => {
      if (ta) {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, cardText.length);
        try {
          document.execCommand('copy');
          this.toast('Scheda copiata! Incollala su WhatsApp!');
          this.close();
        } catch {
          this.toast('Selezionato: usa Copia dal menu del telefono!');
        }
      }
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.close());
  }

  showResetConfirm(onConfirm) {
    this._open(`
      <h2 class="modal-title">${iconSvg('trash', 'svg-ico')} Reset Completo</h2>
      <div class="modal-body">
        Vuoi davvero cancellare tutti i progressi, i trofei e i giocatori? Questa operazione non è reversibile.
      </div>
      <div class="modal-actions">
        <button type="button" class="sec-btn danger" id="btn-confirm-reset">Sì, Cancella Tutto</button>
        <button type="button" class="sec-btn" id="btn-close-modal">Annulla</button>
      </div>
    `);

    document.getElementById('btn-confirm-reset')?.addEventListener('click', () => {
      this.close();
      onConfirm();
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.close());
  }
}
