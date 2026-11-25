import { RARITIES, MAX_PLAYER_STARS } from './config.js';
import { escapeHTML, formatMoney } from './format.js';
import { formatPlayerBonus, getPlayerEffectivePower } from './gacha.js';
import { audio } from './audio.js';

const VAR_CHECK_LINES = [
  'Analisi millimetriche col righello di legno...',
  'L\'arbitro controlla il monitor in streaming 3G...',
  'Sala VAR in linea dal bar del circolo Arci...',
  'Zoom 400x sugli scarpini infangati...',
  'Controllo telecamera del balcone della signora Maria...',
];

// 15 battute comiche VAR (inclusi 3 finti annullamenti in 2 tempi!)
const VAR_VERDICTS = [
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'Il monitor VAR era spento: si fida della curva!',
    bonus: false,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'Polpetta aveva staccato la spina della sala VAR per fare spazio alla ruota!',
    bonus: true,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'Il monitor era sintonizzato su Sky Calcio Show: gol buono sulla fiducia!',
    bonus: false,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'Connessione 3G in buffering al 98%: l\'arbitro indica il centrocampo!',
    bonus: false,
  },
  {
    headline: 'GOL + BONUS STILE!',
    sub: 'Righello di legno leggermente storto: fuorigioco invisibile, vale il gol!',
    bonus: true,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'L\'arbitro aveva dimenticato gli occhiali nello spogliatoio.',
    bonus: false,
  },
  {
    headline: 'GOL + BONUS STILE!',
    sub: 'La sala VAR applaude in piedi: premio spettacolo in cassa!',
    bonus: true,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'Il guardalinee stava addentando una salamella: bandierina giù!',
    bonus: false,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'L\'operatore VAR è cugino del paninaro: "Gol pulitissimo, Presidente!"',
    bonus: false,
  },
  {
    headline: 'GOL + BONUS STILE!',
    sub: 'Rete così bella che pure il portiere avversario firma la convalida!',
    bonus: true,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'Il pallone era sgonfio di 2 bar ma la linea l\'ha passata col cuore!',
    bonus: false,
  },
  {
    headline: 'GOL CONVALIDATO!',
    sub: 'Il drone VAR ha finito la batteria sul più bello: si convalida!',
    bonus: false,
  },
  // 3 Finti Annullamenti in 2 tempi!
  {
    fakeCancel: true,
    fakeHeadline: 'ANNULLATO?!',
    fakeSub: 'Segnalato presunto fuorigioco di un baffo...',
    headline: 'SCHERZAVO! È GOL + BONUS STILE!',
    sub: '😂 Era l\'ombra del riflettore! Curva in delirio e premio cassa!',
    bonus: true,
  },
  {
    fakeCancel: true,
    fakeHeadline: 'ANNULLATO?!',
    fakeSub: 'L\'arbitro fa il gesto del fallo di mano...',
    headline: 'SCHERZAVO! È GOL + BONUS STILE!',
    sub: '😂 Stava solo scacciando una zanzara! Gol buonissimo + premio!',
    bonus: true,
  },
  {
    fakeCancel: true,
    fakeHeadline: 'ANNULLATO?!',
    fakeSub: 'Dalla sala VAR urlano "NOOOO!"...',
    headline: 'SCHERZAVO! È GOL + BONUS STILE!',
    sub: '😂 Gli era caduto il caffè sulla tastiera! Gol convalidato!',
    bonus: true,
  },
];

function getVarRefereeSvg() {
  return `
    <svg viewBox="0 0 88 74" class="var-ref-svg" aria-hidden="true">
      <!-- Testa arbitro -->
      <circle cx="44" cy="18" r="11" fill="#fed7aa" stroke="#0f172a" stroke-width="2"/>
      <path d="M33 15 C34 8 40 6 44 6 C48 6 54 8 55 15 Z" fill="#1e293b"/>
      <circle cx="40.5" cy="18" r="1.5" fill="#0f172a"/>
      <circle cx="47.5" cy="18" r="1.5" fill="#0f172a"/>
      <path d="M40 23 Q44 25 48 23" fill="none" stroke="#7c2d12" stroke-width="1.6" stroke-linecap="round"/>
      <!-- Maglia a strisce arbitro -->
      <path d="M27 64 C28 42 35 33 44 33 C53 33 60 42 61 64 Z" fill="#facc15" stroke="#0f172a" stroke-width="2"/>
      <rect x="37" y="34" width="3.5" height="29" fill="#0f172a"/>
      <rect x="47.5" y="34" width="3.5" height="29" fill="#0f172a"/>
      <!-- Rettangolo TV VAR luminoso disegnato dalle mani! -->
      <g class="var-tv-gesture">
        <rect x="24" y="34" width="40" height="24" rx="4" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-width="2.6" stroke-dasharray="6 3"/>
        <circle cx="24" cy="46" r="4.5" fill="#fed7aa" stroke="#0f172a" stroke-width="1.5"/>
        <circle cx="64" cy="46" r="4.5" fill="#fed7aa" stroke="#0f172a" stroke-width="1.5"/>
      </g>
    </svg>
  `;
}

export class CutsceneManager {
  constructor() {
    this.root = document.getElementById('cutscene-root');
    this._timers = [];
    this._activeCleanup = null;
  }

  _clearTimers() {
    for (const id of this._timers) clearTimeout(id);
    this._timers = [];
  }

  close() {
    this._clearTimers();
    this._activeCleanup = null;
    if (this.root) {
      this.root.classList.add('hidden');
      this.root.innerHTML = '';
    }
  }

  /**
   * 1. WALKOUT EPICO SEGRETI (3.5s) per tutte e 4 le Leggende Segrete!
   */
  playSecretWalkout(result, { onShake, onDone }) {
    this.close();
    const { player, outcome, refundAmount } = result;
    const aura = player.aura || 'fire';
    const auraMeta = {
      fire: { cls: 'walkout-fire', sub: '🔥 FIAMMA DI PROVINCIA 🔥' },
      electric: { cls: 'walkout-electric', sub: '⚡ MURAGLIA ELETTRICA ⚡' },
      granite: { cls: 'walkout-granite', sub: '🪨 MURO DI GRANITO 🪨' },
      emerald: { cls: 'walkout-emerald', sub: '💨 TURBO SMERALDO 💨' },
    }[aura] || { cls: 'walkout-fire', sub: '🌟 LEGGENDA ASSOLUTA 🌟' };
    const auraClass = auraMeta.cls;
    const rar = RARITIES.segreto;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      this.close();
      if (onDone) onDone();
    };

    this.root.innerHTML = `
      <div class="cutscene-backdrop walkout-stage ${auraClass}" id="walkout-box">
        <div class="walkout-fx"></div>
        <div class="walkout-center" id="walkout-center">
          <div class="walkout-pulse-text">SEGNALE ANOMALO...</div>
        </div>
        <div class="cutscene-skip-hint">Tocca per saltare</div>
      </div>
    `;
    this.root.classList.remove('hidden');

    audio.playWalkoutRiser();

    this._timers.push(
      setTimeout(() => {
        const c = document.getElementById('walkout-center');
        if (!c) return;
        c.innerHTML = `
          <div class="walkout-banner">★ LEGGENDA SEGRETA ★</div>
          <div class="walkout-sub">${auraMeta.sub}</div>
        `;
      }, 850)
    );

    this._timers.push(
      setTimeout(() => {
        const c = document.getElementById('walkout-center');
        if (!c) return;
        if (onShake) onShake(8, 0.28);
        c.innerHTML = `
          <div class="walkout-banner">★ LEGGENDA SEGRETA ★</div>
          <div class="walkout-big-num">${escapeHTML(player.role)} #${player.jerseyNumber}</div>
        `;
      }, 1750)
    );

    const revealCard = () => {
      const c = document.getElementById('walkout-center');
      if (!c) return;
      this._clearTimers();
      audio.playWalkoutBurst(player.aura);
      if (onShake) onShake(9, 0.32);

      const starsStr = '★'.repeat(player.stars) + '☆'.repeat(Math.max(0, MAX_PLAYER_STARS - player.stars));
      let outcomeText = '🌟 LEGGENDA SEGRETA SBLOCCATA PER SEMPRE!';
      if (outcome === 'fused') outcomeText = `🔥 FUSIONE SEGRETA! Sale a ${player.stars}★`;
      else if (outcome === 'maxed_refund') outcomeText = `💰 Già 5★! Rimborso +${formatMoney(refundAmount)}`;

      c.innerHTML = `
        <div class="reveal-card holo-segreto" style="border-color:${rar.color}; max-width:320px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="rarity-tag" style="background:rgba(245,158,11,0.3);color:#fde047;">SEGRETO</span>
            <span style="font-size:12px;font-weight:900;color:#e2e8f0;">#${player.jerseyNumber} • ${player.role}</span>
          </div>
          <div class="reveal-player-name" style="font-size:19px;">${escapeHTML(player.name)}</div>
          <div class="reveal-stars">${starsStr}</div>
          <div class="reveal-bonus">${escapeHTML(formatPlayerBonus(player))} • ⚡ ${getPlayerEffectivePower(player)} Forza</div>
          <div style="font-size:11px;color:#e2e8f0;margin-top:7px;line-height:1.35;">${escapeHTML(player.bio || '')}</div>
          <div class="secret-ability-pill" style="margin-top:6px;">${escapeHTML(player.abilityName)}: ${escapeHTML(player.abilityDesc)}</div>
          <div class="reveal-outcome">${outcomeText}</div>
        </div>
        <button type="button" class="cta-btn" id="btn-walkout-done" style="max-width:260px;margin-top:12px;">
          INCREDIBILE!
        </button>
      `;
      document.getElementById('btn-walkout-done')?.addEventListener('click', (e) => {
        e.stopPropagation();
        finish();
      });
    };

    this._timers.push(setTimeout(revealCard, 2550));

    const openedAt = performance.now();
    this.root.querySelector('#walkout-box')?.addEventListener('click', () => {
      if (performance.now() - openedAt < 300) return;
      if (!document.getElementById('btn-walkout-done')) {
        revealCard();
      } else {
        finish();
      }
    });
  }

  /**
   * 2. PRIMA PAGINA "GAZZETTA DELLA PROVINCIA"
   */
  playGazzettaFrontPage({ clubName, headline, subline, tag = 'EDIZIONE STRAORDINARIA' }, onDone) {
    this.close();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.close();
      if (onDone) onDone();
    };

    this.root.innerHTML = `
      <div class="cutscene-backdrop" id="gazzetta-backdrop">
        <div class="gazzetta-paper">
          <div class="gazzetta-masthead">LA GAZZETTA DELLA PROVINCIA</div>
          <div class="gazzetta-meta">
            <span>${escapeHTML(tag)}</span>
            <span>€1,50 • COPIA STORICA</span>
          </div>
          <div class="gazzetta-headline">${escapeHTML(headline)}</div>
          <div class="gazzetta-club-strip">${escapeHTML(clubName.toUpperCase())} IN DELIRIO!</div>
          <div class="gazzetta-sub">${escapeHTML(subline)}</div>
          <div class="gazzetta-foot">Tocca per continuare</div>
        </div>
      </div>
    `;
    this.root.classList.remove('hidden');

    const openedAt = performance.now();
    this.root.querySelector('#gazzetta-backdrop')?.addEventListener('click', () => {
      if (performance.now() - openedAt > 260) finish();
    });
    this._timers.push(setTimeout(finish, 3400));
  }

  /**
   * 3. ELICOTTERO DEL FONDO ESTERO
   */
  playHelicopterPrestige({ gainedShares, totalShares, stadium, onMidFlash, onDone }) {
    this.close();
    let finished = false;
    let flashed = false;

    const triggerMid = () => {
      if (flashed) return;
      flashed = true;
      if (onMidFlash) onMidFlash();
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      triggerMid();
      this.close();
      if (onDone) onDone();
    };

    stadium.startHelicopterAnimation(2.6);
    audio.playHelicopter();

    this.root.innerHTML = `
      <div class="heli-overlay" id="heli-overlay">
        <div class="heli-flash" id="heli-flash"></div>
        <div class="heli-banner">
          <div style="font-size:15px;font-weight:900;color:#fde047;">🚁 FONDO ESTERO IN ATTERRAGGIO!</div>
          <div style="font-size:12px;color:#e2e8f0;margin-top:4px;">
            Consegna valigetta: <strong>+${gainedShares} Azioni</strong> (Totale: <strong>${totalShares}</strong>)
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:6px;">Tocca per saltare</div>
        </div>
      </div>
    `;
    this.root.classList.remove('hidden');

    this._timers.push(
      setTimeout(() => {
        document.getElementById('heli-flash')?.classList.add('active');
        triggerMid();
      }, 1950)
    );
    this._timers.push(setTimeout(finish, 2650));

    const openedAt = performance.now();
    this.root.querySelector('#heli-overlay')?.addEventListener('click', () => {
      if (performance.now() - openedAt > 300) finish();
    });
  }

  /**
   * 4. FINTO VAR COMICO POTENZIATO (v4.5: arbitro SVG TV-gesture + 15 battute + finto annullamento!)
   */
  playComicVar({ bonusCash, onGrantBonus, onDone }) {
    this.close();
    const verdict = VAR_VERDICTS[Math.floor(Math.random() * VAR_VERDICTS.length)];
    const checkLine = VAR_CHECK_LINES[Math.floor(Math.random() * VAR_CHECK_LINES.length)];
    let finished = false;
    let granted = false;

    const grantOnce = () => {
      if (!granted && verdict.bonus && onGrantBonus) {
        granted = true;
        onGrantBonus(bonusCash);
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      grantOnce();
      this.close();
      if (onDone) onDone();
    };

    audio.playVarBeep();

    this.root.innerHTML = `
      <div class="var-overlay" id="var-overlay">
        <div class="var-box" id="var-box">
          ${getVarRefereeSvg()}
          <div class="var-badge">📺 CHECK VAR IN CORSO...</div>
          <div class="var-sub" id="var-sub">${escapeHTML(checkLine)}</div>
        </div>
      </div>
    `;
    this.root.classList.remove('hidden');

    if (verdict.fakeCancel) {
      // Fase 1: Finto annullamento spaventoso!
      this._timers.push(
        setTimeout(() => {
          const box = document.getElementById('var-box');
          if (!box) return;
          audio.playMiss();
          box.innerHTML = `
            <div class="var-badge danger">❌ ${escapeHTML(verdict.fakeHeadline)}</div>
            <div class="var-sub">${escapeHTML(verdict.fakeSub)}</div>
          `;
        }, 680)
      );
      // Fase 2 (0.58s dopo): SCHERZAVO! È GOL + BONUS STILE!
      this._timers.push(
        setTimeout(() => {
          const box = document.getElementById('var-box');
          if (!box) return;
          grantOnce();
          audio.playBuy();
          const extraLine = verdict.bonus ? ` (+${formatMoney(bonusCash)})` : '';
          box.innerHTML = `
            <div class="var-badge ok">✅ ${escapeHTML(verdict.headline)}${escapeHTML(extraLine)}</div>
            <div class="var-sub">${escapeHTML(verdict.sub)}</div>
          `;
        }, 1260)
      );
      this._timers.push(setTimeout(finish, 2350));
    } else {
      this._timers.push(
        setTimeout(() => {
          const box = document.getElementById('var-box');
          if (!box) return;
          grantOnce();
          audio.playBuy();
          const extraLine = verdict.bonus ? ` (+${formatMoney(bonusCash)})` : '';
          box.innerHTML = `
            <div class="var-badge ok">✅ ${escapeHTML(verdict.headline)}${escapeHTML(extraLine)}</div>
            <div class="var-sub">${escapeHTML(verdict.sub)}</div>
          `;
        }, 780)
      );
      this._timers.push(setTimeout(finish, 1800));
    }

    const openedAt = performance.now();
    this.root.querySelector('#var-overlay')?.addEventListener('click', () => {
      if (performance.now() - openedAt > 280) finish();
    });
  }
}
