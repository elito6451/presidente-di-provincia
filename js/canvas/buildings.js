// Costruzioni fisiche visibili sullo stadio v3.0.1:
// - Curva Organizzata ridisegnata come vero Settore Ultras sugli spalti superiori (mai sopra porta/prato!)
// - Paninaro Fuori Stadio, Store, Panchine, Torri Faro, Tribuna VIP & Elicottero Prestige

function hexToRgbString(hex, fallback = '239, 68, 68') {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function getOlaLift(normX, env) {
  if (!env || env.olaIntensity <= 0.03) return 0;
  const dist = Math.abs(normX - (env.olaPhase % 1.25) + 0.12);
  const crest = Math.exp(-(dist * dist) / 0.018);
  return crest * 6.5 * env.olaIntensity;
}

// Settore Ultras integrato sugli spalti superiori (o dietro la staccionata in Terza Categoria)
function renderUltrasCurvaUpperStands(ctx, w, g, t, curvaLvl, leagueIndex, clubInfo, env) {
  const isUp = curvaLvl >= 10;
  const isTerza = leagueIndex === 0;
  const spanRatio = isTerza ? (isUp ? 0.72 : 0.48) : (isUp ? 0.80 : 0.50);
  const sectorW = g.topW * spanRatio;
  const sectorLeft = g.cx - sectorW * 0.5;
  const sectorRight = sectorLeft + sectorW;

  const railY = g.topY - (isTerza ? 16 : 19);
  const topStandY = isTerza ? Math.max(22, g.topY - 38) : 22;
  const primaryRgb = hexToRgbString(clubInfo.primary, '220, 38, 38');
  const secondaryRgb = hexToRgbString(clubInfo.secondary, '248, 250, 252');

  ctx.save();

  // 1. Gradinata / base del Settore Ultras sugli spalti superiori
  if (!isTerza) {
    const grad = ctx.createLinearGradient(0, topStandY, 0, railY);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.72)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sectorLeft + 6, topStandY);
    ctx.lineTo(sectorRight - 6, topStandY);
    ctx.lineTo(sectorRight, railY);
    ctx.lineTo(sectorLeft, railY);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Tifosi ultras compatti che saltano a ritmo con sciarpe tese nei colori sociali
  const rows = isTerza ? (isUp ? 2 : 1) : (isUp ? 4 : 3);
  const cols = isUp ? 24 : 15;
  const standH = Math.max(12, railY - topStandY - 4);

  for (let r = 0; r < rows; r++) {
    const rowFrac = rows === 1 ? 0.55 : (r + 0.35) / rows;
    const baseY = topStandY + 4 + rowFrac * standH;
    for (let c = 0; c < cols; c++) {
      const colFrac = (c + 0.5) / cols;
      const fx = (sectorLeft + colFrac * sectorW) / Math.max(1, w);
      const x = sectorLeft + 5 + colFrac * (sectorW - 10);
      const jump = Math.abs(Math.sin(t * 7.8 + c * 0.7 + r * 1.3)) * 2.8 + getOlaLift(fx, env);
      const y = baseY - jump;

      // Spalle / maglia ultras nei colori sociali
      ctx.fillStyle = (c + r) % 2 === 0 ? clubInfo.primary : clubInfo.secondary;
      ctx.beginPath();
      ctx.arc(x, y + 2.5, 3.2, Math.PI, 0);
      ctx.fill();

      // Testa
      ctx.fillStyle = '#fdba74';
      ctx.beginPath();
      ctx.arc(x, y - 0.5, 2.0, 0, Math.PI * 2);
      ctx.fill();

      // Sciarpa tesa al cielo ogni 3 tifosi
      if ((c + r) % 3 === 0) {
        const scarfLift = Math.abs(Math.sin(t * 6.2 + c)) * 1.6;
        ctx.fillStyle = clubInfo.primary;
        ctx.fillRect(x - 4.8, y - 4.2 - scarfLift, 9.6, 2.1);
        ctx.fillStyle = clubInfo.secondary;
        ctx.fillRect(x - 1.6, y - 4.2 - scarfLift, 3.2, 2.1);
      }
    }
  }

  // 3. Grande striscione ultras lungo la ringhiera/staccionata nei colori sociali
  const bannerH = isTerza ? 7.5 : 8.5;
  ctx.fillStyle = clubInfo.primary;
  ctx.fillRect(sectorLeft + 2, railY - 1, sectorW - 4, bannerH);
  ctx.strokeStyle = clubInfo.secondary;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(sectorLeft + 2, railY - 1, sectorW - 4, bannerH);

  // Bande laterali bicolore sullo striscione
  ctx.fillStyle = clubInfo.secondary;
  ctx.fillRect(sectorLeft + 4, railY, 8, bannerH - 2);
  ctx.fillRect(sectorRight - 12, railY, 8, bannerH - 2);

  // Scritta ULTRAS • NOME CLUB (con contorno per leggibilità su colori chiari/scuri)
  const bannerTxt = isUp
    ? `★ ULTRAS ${clubInfo.name.toUpperCase()} ★`
    : `ULTRAS ${clubInfo.name.toUpperCase()}`;
  ctx.font = '900 5.8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(7, 12, 22, 0.9)';
  ctx.strokeText(bannerTxt.slice(0, 26), g.cx, railY + bannerH * 0.45);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(bannerTxt.slice(0, 26), g.cx, railY + bannerH * 0.45);

  // 4. Bandieroni grandi e stendardi animati che sventolano sopra la curva
  const flagCount = isTerza ? (isUp ? 4 : 2) : (isUp ? 6 : 3);
  for (let i = 0; i < flagCount; i++) {
    const fFrac = (i + 0.5) / flagCount;
    const bx = sectorLeft + 10 + fFrac * (sectorW - 20);
    const by = topStandY + 12 + (i % 2) * 5;
    const sway = Math.sin(t * 4.8 + i * 1.7) * 6.5;
    const poleH = isUp ? 17 : 14;

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, by + 4);
    ctx.lineTo(bx + sway * 0.35, by - poleH);
    ctx.stroke();

    // Drappo grande sventolante bicolore
    const tipX = bx + sway * 0.35;
    const tipY = by - poleH;
    ctx.fillStyle = i % 2 === 0 ? clubInfo.primary : clubInfo.secondary;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(tipX + 9 + sway * 0.4, tipY + 1.5, tipX + 16 + sway * 0.55, tipY + 4.5);
    ctx.quadraticCurveTo(tipX + 8 + sway * 0.25, tipY + 7.5, tipX, tipY + 9.5);
    ctx.closePath();
    ctx.fill();

    // Banda contrastante centrale sulla bandiera
    ctx.fillStyle = i % 2 === 0 ? clubInfo.secondary : clubInfo.primary;
    ctx.fillRect(tipX + 2.5, tipY + 3.4, 7.5, 2.4);
  }

  // 5. Torce / bengala con bagliori caldi ('lighter') + fumogeni colorati che salgono verso il cielo
  const flarePositions = isUp
    ? [0.14, 0.36, 0.64, 0.86]
    : [0.22, 0.78];

  // Nuvole morbide di fumogeni colorati (nei colori sociali) contenute sotto la tettoia
  for (let i = 0; i < flarePositions.length; i++) {
    const fx = sectorLeft + flarePositions[i] * sectorW;
    const fy = railY - 4;
    const rgb = i % 2 === 0 ? primaryRgb : secondaryRgb;
    const puffs = isUp ? 5 : 3;

    for (let k = 0; k < puffs; k++) {
      const ph = (t * 0.42 + k / puffs + i * 0.19) % 1;
      const sx = fx + Math.sin(t * 2.1 + k * 1.5 + i) * 6 + ph * 5;
      const sy = Math.max(18, fy - ph * (isUp ? 26 : 18));
      const rad = 4.5 + ph * (isUp ? 13 : 9);
      const alpha = (1 - ph) * (isUp ? 0.32 : 0.24);
      ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Bagliori caldi dei bengala in modalità 'lighter'
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < flarePositions.length; i++) {
    const fx = sectorLeft + flarePositions[i] * sectorW;
    const fy = railY - 3;
    const flicker = 0.82 + Math.sin(t * 22 + i * 3.1) * 0.18;
    const glowR = (isUp ? 16 : 12) * flicker;
    const gFlare = ctx.createRadialGradient(fx, fy, 1, fx, fy, glowR);
    gFlare.addColorStop(0, 'rgba(255, 250, 220, 0.92)');
    gFlare.addColorStop(0.4, 'rgba(251, 146, 60, 0.52)');
    gFlare.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = gFlare;
    ctx.beginPath();
    ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 6. Lv 10+: piccole esplosioni di coriandoli ultras sugli spalti durante combo tap e gol!
  if (isUp && env && env.olaIntensity > 0.22) {
    const confColors = [clubInfo.primary, clubInfo.secondary, '#fde047', '#38bdf8'];
    for (let i = 0; i < 14; i++) {
      const ph = (t * 1.5 + i * 0.17) % 1;
      const cx = sectorLeft + ((i * 37) % 100) / 100 * sectorW + Math.sin(t * 6 + i) * 5;
      const cy = topStandY + 4 + ph * (railY - topStandY);
      ctx.globalAlpha = (1 - ph) * env.olaIntensity;
      ctx.fillStyle = confColors[i % confColors.length];
      ctx.fillRect(cx, cy, 3.2, 2.2);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export function renderStadiumBuildings(ctx, w, h, g, t, upgrades = {}, clubInfo, leagueIndex = 0, env = null) {
  const paninaroLvl = upgrades.paninaro || 0;
  const curvaLvl = upgrades.curva_organizzata || 0;
  const pulminoLvl = upgrades.pulmino_sociale || 0;
  const riflettoriLvl = upgrades.riflettori_nuovi || 0;
  const storeLvl = upgrades.store_magliette || 0;
  const vipLvl = upgrades.stadio_proprieta || 0;
  const centroLvl = upgrades.centro_sportivo || 0;

  // 1. CURVA ORGANIZZATA — Settore Ultras integrato sugli spalti superiori (zero overlap sulle porte!)
  if (curvaLvl >= 1) {
    renderUltrasCurvaUpperStands(ctx, w, g, t, curvaLvl, leagueIndex, clubInfo, env);
  }

  // 2. PANINARO FUORI STADIO (furgoncino street-food con fumo animato in alto a sinistra fuori campo)
  if (paninaroLvl >= 1) {
    const isUp = paninaroLvl >= 10;
    const vx = Math.max(6, g.topLeft - 26);
    const vy = g.topY - 26;
    ctx.save();
    for (let i = 0; i < (isUp ? 4 : 3); i++) {
      const ph = (t * 0.65 + i * 0.28) % 1;
      const sx = vx + 14 + Math.sin(t * 2.5 + i) * 3;
      const sy = Math.max(18, vy - 3 - ph * 16);
      ctx.fillStyle = `rgba(226, 232, 240, ${((1 - ph) * 0.45).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5 + ph * 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = isUp ? '#f59e0b' : '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(vx, vy, isUp ? 30 : 25, 13, 3);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = clubInfo.primary;
    ctx.fillRect(vx + 2, vy + 1, isUp ? 20 : 16, 4);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(vx + 4, vy + 5, 11, 5);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(vx + 6, vy + 13.5, 2.4, 0, Math.PI * 2);
    ctx.arc(vx + (isUp ? 23 : 19), vy + 13.5, 2.4, 0, Math.PI * 2);
    ctx.fill();

    if (isUp) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(vx + 5, vy - 4, 18, 3.5);
    }
    ctx.restore();
  }

  // 3. STORE MAGLIETTE (chiosco merchandising a destra del recinto superiore)
  if (storeLvl >= 1) {
    const isUp = storeLvl >= 10;
    const sx = Math.min(w - 30, g.topRight - 2);
    const sy = g.topY - 26;
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(sx, sy, isUp ? 26 : 22, 14, 3);
    ctx.fill();
    ctx.fillStyle = clubInfo.primary;
    ctx.fillRect(sx, sy, isUp ? 26 : 22, 4.5);
    ctx.fillStyle = clubInfo.secondary;
    ctx.fillRect(sx + 7, sy + 6, 7, 6);
    if (isUp) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(sx, sy, 26, 14);
    }
    ctx.restore();
  }

  // 4. PULMINO SOCIALE / PANCHINE COPERTE PRO (bordo inferiore)
  if (pulminoLvl >= 1 || centroLvl >= 1) {
    const isUp = pulminoLvl >= 10 || centroLvl >= 1;
    const by = g.bottomY + 3;
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(g.bottomLeft + g.bottomW * 0.1, by, g.bottomW * 0.25, 11);
    ctx.fillRect(g.bottomLeft + g.bottomW * 0.65, by, g.bottomW * 0.25, 11);
    ctx.fillStyle = isUp ? '#fbbf24' : clubInfo.primary;
    ctx.fillRect(g.bottomLeft + g.bottomW * 0.1, by, g.bottomW * 0.25, 3);
    ctx.fillStyle = clubInfo.secondary;
    ctx.fillRect(g.bottomLeft + g.bottomW * 0.65, by, g.bottomW * 0.25, 3);
    ctx.restore();
  }

  // 5. STADIO DI PROPRIETÀ — TRIBUNA VIP DORATA
  if (vipLvl >= 1) {
    const isUp = vipLvl >= 10;
    const vw = w * 0.34;
    const vx = (w - vw) * 0.5;
    const vy = 16;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(vx, vy, vw, 11);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = isUp ? 1.8 : 1.2;
    ctx.strokeRect(vx, vy, vw, 11);
    const glassGrad = ctx.createLinearGradient(vx, vy, vx + vw, vy);
    glassGrad.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
    glassGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.52)');
    glassGrad.addColorStop(1, 'rgba(251, 191, 36, 0.28)');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(vx + 3, vy + 2.5, vw - 6, 6);
    ctx.restore();
  }

  // 6. RIFLETTORI STADIO — TORRI FARO FISICHE CON CONI LUMINOSI
  if (riflettoriLvl >= 1) {
    const isUp = riflettoriLvl >= 10;
    const poles = [
      { x: g.topLeft - 10, dir: 1 },
      { x: g.topRight + 10, dir: -1 },
    ];
    ctx.save();
    for (const pole of poles) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(pole.x, g.topY + 4);
      ctx.lineTo(pole.x, 22);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(pole.x - 8, 18, 16, 7);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(pole.x - 6, 20, 12, 3.5);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tx = pole.x + pole.dir * w * 0.32;
      const ty = g.bottomY * 0.92;
      const cone = ctx.createLinearGradient(pole.x, 24, tx, ty);
      cone.addColorStop(0, isUp ? 'rgba(254, 249, 195, 0.22)' : 'rgba(254, 249, 195, 0.14)');
      cone.addColorStop(0.6, 'rgba(254, 249, 195, 0.04)');
      cone.addColorStop(1, 'rgba(254, 249, 195, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(pole.x - 5, 24);
      ctx.lineTo(pole.x + 5, 24);
      ctx.lineTo(tx + 46, ty);
      ctx.lineTo(tx - 46, ty);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

// Elicottero del Fondo Estero (cutscene Prestige sul Canvas!)
export function renderPrestigeHelicopter(ctx, w, h, heli, t) {
  if (!heli || !heli.active) return;

  const p = heli.progress;
  let hx;
  let hy;
  if (p < 0.35) {
    const k = p / 0.35;
    hx = w * (1.15 - 0.65 * k);
    hy = h * (0.12 + 0.30 * k);
  } else if (p < 0.68) {
    hx = w * 0.5 + Math.sin(t * 9) * 3;
    hy = h * 0.42 + Math.cos(t * 7) * 3;
  } else {
    const k = (p - 0.68) / 0.32;
    hx = w * (0.5 - 0.72 * k);
    hy = h * (0.42 - 0.32 * k);
  }

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(hx, h * 0.68, 34, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p >= 0.42 && p <= 0.85) {
    const dropK = Math.min(1, (p - 0.42) / 0.25);
    const bx = w * 0.5;
    const by = h * (0.48 + dropK * 0.18);
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx - 12, by - 9, 24, 17, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#78350f';
    ctx.font = '900 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', bx, by);
  }

  ctx.translate(hx, hy);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(16, -4, 28, 6);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(40, -10, 5, 13);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, 16);
  ctx.lineTo(16, 16);
  ctx.moveTo(-10, 10);
  ctx.lineTo(-10, 16);
  ctx.moveTo(10, 10);
  ctx.lineTo(10, 16);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.ellipse(-9, -2, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fde047';
  ctx.font = '900 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 8, 1);

  const bladeW = 36 + Math.sin(t * 48) * 14;
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-bladeW, -17);
  ctx.lineTo(bladeW, -17);
  ctx.moveTo(0, -13);
  ctx.lineTo(0, -17);
  ctx.stroke();
  ctx.restore();
}
