// Rendering 2.5D v3.0: cielo con nuvole/tramonto/stelle, tettoia metallica anti-alone iOS,
// costruzioni fisiche dagli upgrade, bandierine d'angolo, texture erba, LED scorrevoli e meteo

import { renderStadiumBuildings } from './buildings.js';

function drawSlowClouds(ctx, w, topY, t, color = 'rgba(226, 232, 240, 0.14)') {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 115 + t * (5 + i * 1.4)) % (w + 90)) - 45;
    const cy = 22 + (i % 2) * (topY * 0.2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 24 + i * 3, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 12, cy - 3, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function getPitchGeometry(w, h) {
  const topY = h * 0.305;
  const bottomY = h * 0.885;
  const topLeft = w * 0.135;
  const topRight = w * 0.865;
  const bottomLeft = w * 0.085;
  const bottomRight = w * 0.915;
  return {
    w,
    h,
    topY,
    bottomY,
    height: bottomY - topY,
    topLeft,
    topRight,
    topW: topRight - topLeft,
    bottomLeft,
    bottomRight,
    bottomW: bottomRight - bottomLeft,
    cx: w * 0.5,
    cy: (topY + bottomY) * 0.5,
  };
}

export function projectPitch(nx, ny, g) {
  const clampedY = Math.max(-0.2, Math.min(1.2, ny));
  const y = g.topY + clampedY * g.height;
  const left = g.topLeft + (g.bottomLeft - g.topLeft) * clampedY;
  const right = g.topRight + (g.bottomRight - g.topRight) * clampedY;
  const x = left + nx * (right - left);
  const scale = 0.82 + Math.max(0, Math.min(1, clampedY)) * 0.28;
  return { x, y, scale, left, right, rowW: right - left };
}

export function unprojectPitch(px, py, g) {
  const ny = (py - g.topY) / Math.max(1, g.height);
  const cy = Math.max(0, Math.min(1, ny));
  const left = g.topLeft + (g.bottomLeft - g.topLeft) * cy;
  const right = g.topRight + (g.bottomRight - g.topRight) * cy;
  const nx = (px - left) / Math.max(1, right - left);
  return {
    nx: Math.max(0.03, Math.min(0.97, nx)),
    ny: Math.max(0.04, Math.min(0.96, ny)),
  };
}

function tracePitchQuad(ctx, g, x0, y0, x1, y1) {
  const p00 = projectPitch(x0, y0, g);
  const p10 = projectPitch(x1, y0, g);
  const p11 = projectPitch(x1, y1, g);
  const p01 = projectPitch(x0, y1, g);
  ctx.beginPath();
  ctx.moveTo(p00.x, p00.y);
  ctx.lineTo(p10.x, p10.y);
  ctx.lineTo(p11.x, p11.y);
  ctx.lineTo(p01.x, p01.y);
  ctx.closePath();
}

function drawPitchLine(ctx, g, x0, y0, x1, y1, crookedSeed = 0) {
  const steps = crookedSeed ? 10 : 1;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const nx = x0 + (x1 - x0) * f;
    const ny = y0 + (y1 - y0) * f;
    const pt = projectPitch(nx, ny, g);
    const jitter =
      crookedSeed && i > 0 && i < steps
        ? Math.sin(crookedSeed * 11.3 + i * 2.7) * 2.0
        : 0;
    if (i === 0) ctx.moveTo(pt.x + jitter, pt.y + jitter * 0.6);
    else ctx.lineTo(pt.x + jitter, pt.y + jitter * 0.6);
  }
  ctx.stroke();
}

// Tettoia / struttura metallica nella parte alta del Canvas (incornicia pulito sotto status bar iOS)
function drawRoofStructure(ctx, w, { style = 'metal', accent = '#38bdf8', lights = 4 } = {}) {
  const roofH = style === 'wood' ? 11 : 15;
  ctx.save();

  // Fascia scura superiore anti-alone dietro status bar iOS
  ctx.fillStyle = '#070c16';
  ctx.fillRect(0, 0, w, roofH);

  if (style === 'wood') {
    ctx.fillStyle = '#4a321b';
    ctx.fillRect(0, roofH - 4, w, 4);
    ctx.restore();
    return;
  }

  // Trave metallica reticolare (traliccio)
  ctx.strokeStyle = style === 'futuristic' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, roofH - 1);
  ctx.lineTo(w, roofH - 1);
  for (let x = 0; x < w; x += 22) {
    ctx.moveTo(x, 3);
    ctx.lineTo(x + 11, roofH - 2);
    ctx.lineTo(x + 22, 3);
  }
  ctx.stroke();

  if (style === 'futuristic') {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, roofH - 2, w, 1.8);
    ctx.globalAlpha = 1;
  }

  // Corpi faro agganciati sotto la tettoia
  if (lights > 0) {
    for (let i = 0; i < lights; i++) {
      const fx = w * ((i + 0.5) / lights);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(fx - 10, roofH - 2, 20, 6);
      ctx.fillStyle = style === 'futuristic' ? '#e0f2fe' : '#fef9c3';
      ctx.fillRect(fx - 7, roofH + 2, 14, 2.5);
    }
  }
  ctx.restore();
}

// Bandierine d'angolo che sventolano nei colori sociali
function drawCornerFlags(ctx, g, t, clubInfo) {
  const corners = [
    { nx: 0, ny: 0 },
    { nx: 1, ny: 0 },
    { nx: 0, ny: 1 },
    { nx: 1, ny: 1 },
  ];
  ctx.save();
  for (let i = 0; i < corners.length; i++) {
    const pt = projectPitch(corners[i].nx, corners[i].ny, g);
    const hPole = 13 * pt.scale;
    const wave = Math.sin(t * 7.5 + i * 1.4) * 2.4;

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x, pt.y - hPole);
    ctx.stroke();

    ctx.fillStyle = i % 2 === 0 ? clubInfo.primary : clubInfo.secondary;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y - hPole);
    ctx.lineTo(pt.x + 8 * pt.scale, pt.y - hPole + 2.5 + wave * 0.4);
    ctx.lineTo(pt.x, pt.y - hPole + 5.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Broadcast Arcade HD: texture rasatura, usura aree di rigore, illuminazione radiale fari e vignetta perimetrale
function drawTurfTexture(ctx, g, alpha = 0.08, wearStrength = 0.32) {
  ctx.save();
  tracePitchQuad(ctx, g, 0, 0, 1, 1);
  ctx.clip();

  // 1. Illuminazione radiale morbida dei fari al centro del campo + vignetta sottile ai bordi
  const spot = ctx.createRadialGradient(g.cx, g.cy, g.bottomW * 0.06, g.cx, g.cy, g.bottomW * 0.64);
  spot.addColorStop(0, `rgba(255, 255, 232, ${(alpha + 0.06).toFixed(3)})`);
  spot.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
  spot.addColorStop(0.84, 'rgba(2, 10, 22, 0.12)');
  spot.addColorStop(1, 'rgba(2, 8, 18, 0.28)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, g.topY - 4, g.w, g.height + 8);

  // 2. Riflesso diagonale morbido Broadcast HD
  const sheen = ctx.createLinearGradient(g.topLeft, g.topY, g.bottomRight, g.bottomY);
  sheen.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.72, `rgba(255, 255, 255, ${(alpha * 0.55).toFixed(3)})`);
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, g.topY, g.w, g.height);

  // 3. Usura realistica erba davanti alle due porte e sul dischetto di rigore
  if (wearStrength > 0) {
    const wearSpots = [
      { nx: 0.045, ny: 0.50, rx: 0.045, ry: 0.11 },
      { nx: 0.955, ny: 0.50, rx: 0.045, ry: 0.11 },
      { nx: 0.115, ny: 0.50, rx: 0.022, ry: 0.036 },
      { nx: 0.885, ny: 0.50, rx: 0.022, ry: 0.036 },
    ];
    for (const ws of wearSpots) {
      const pt = projectPitch(ws.nx, ws.ny, g);
      const radX = ws.rx * pt.rowW;
      const radY = ws.ry * g.height;
      const wg = ctx.createRadialGradient(pt.x, pt.y, 1, pt.x, pt.y, Math.max(radX, radY));
      wg.addColorStop(0, `rgba(128, 102, 58, ${(wearStrength * 0.55).toFixed(2)})`);
      wg.addColorStop(0.65, `rgba(116, 98, 52, ${(wearStrength * 0.24).toFixed(2)})`);
      wg.addColorStop(1, 'rgba(116, 98, 52, 0)');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, radX, radY, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Sottile grana orizzontale di rasatura
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.038)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const ptL = projectPitch(0, i / 12, g);
    const ptR = projectPitch(1, i / 12, g);
    ctx.beginPath();
    ctx.moveTo(ptL.x, ptL.y);
    ctx.lineTo(ptR.x, ptR.y);
    ctx.stroke();
  }
  ctx.restore();
}

// Cartelloni LED con testo scorrevole continuo
function drawScrollingLED(ctx, g, t, { bg, textCol, message }) {
  const bx = g.topLeft;
  const by = g.topY - 11;
  const bw = g.topW;
  const bh = 8.5;

  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);

  ctx.beginPath();
  ctx.rect(bx + 1, by, bw - 2, bh);
  ctx.clip();

  ctx.fillStyle = textCol;
  ctx.font = '800 5.8px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const unit = `${message}   ★   `;
  const unitW = Math.max(120, ctx.measureText(unit).width);
  const offset = (t * 32) % unitW;

  for (let x = bx - offset; x < bx + bw + unitW; x += unitW) {
    ctx.fillText(unit, x, by + bh * 0.54);
  }
  ctx.restore();
}

function drawPerspectiveLines(ctx, g, { stroke = 'rgba(255,255,255,0.9)', lineWidth = 2, crooked = false } = {}) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  if (!crooked) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.38)';
    ctx.shadowBlur = 4;
  }

  drawPitchLine(ctx, g, 0, 0, 1, 0, crooked ? 1 : 0);
  drawPitchLine(ctx, g, 1, 0, 1, 1, crooked ? 2 : 0);
  drawPitchLine(ctx, g, 1, 1, 0, 1, crooked ? 3 : 0);
  drawPitchLine(ctx, g, 0, 1, 0, 0, crooked ? 4 : 0);
  drawPitchLine(ctx, g, 0.5, 0, 0.5, 1, crooked ? 5 : 0);

  const center = projectPitch(0.5, 0.5, g);
  const rx = center.rowW * 0.115;
  const ry = g.height * 0.155;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = stroke;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  tracePitchQuad(ctx, g, 0, 0.25, 0.16, 0.75);
  ctx.stroke();
  tracePitchQuad(ctx, g, 0.84, 0.25, 1, 0.75);
  ctx.stroke();

  tracePitchQuad(ctx, g, 0, 0.37, 0.065, 0.63);
  ctx.stroke();
  tracePitchQuad(ctx, g, 0.935, 0.37, 1, 0.63);
  ctx.stroke();

  const penL = projectPitch(0.115, 0.5, g);
  const penR = projectPitch(0.885, 0.5, g);
  ctx.beginPath();
  ctx.arc(penL.x, penL.y, 2.2, 0, Math.PI * 2);
  ctx.arc(penR.x, penR.y, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Porte tridimensionali con rete elastica che si gonfia al gol
function drawGoals3D(ctx, g, { brokenRight = false, glow = false, netBulgeLeft = 0, netBulgeRight = 0 } = {}) {
  const drawOneGoal = (side, bulge) => {
    const isRight = side === 'right';
    const xLine = isRight ? 1 : 0;
    const dir = isRight ? 1 : -1;
    const topPost = projectPitch(xLine, 0.365, g);
    const botPost = projectPitch(xLine, 0.635, g);

    const postHTop = 19 * topPost.scale;
    const postHBot = 22 * botPost.scale;
    const depthTop = 13 * topPost.scale * dir;
    const depthBot = 16 * botPost.scale * dir;
    const bulgePx = bulge * 13 * dir;

    const ft = { x: topPost.x, y: topPost.y - postHTop };
    const fb = { x: botPost.x, y: botPost.y - postHBot };
    const btGround = { x: topPost.x + depthTop, y: topPost.y };
    const bbGround = { x: botPost.x + depthBot, y: botPost.y };
    const btTop = { x: btGround.x + bulgePx * 0.45, y: btGround.y - postHTop * 0.86 };
    const bbTop = { x: bbGround.x + bulgePx * 0.45, y: bbGround.y - postHBot * 0.86 };

    ctx.save();
    // Ombra morbida a terra della porta + pali proiettati sul prato
    const gShadow = ctx.createLinearGradient(topPost.x, topPost.y, btGround.x + dir * 6, bbGround.y);
    gShadow.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
    gShadow.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
    ctx.fillStyle = gShadow;
    ctx.beginPath();
    ctx.moveTo(topPost.x - dir * 3, topPost.y + 1);
    ctx.lineTo(btGround.x + dir * 4, btGround.y + 2);
    ctx.lineTo(bbGround.x + dir * 5, bbGround.y + 3);
    ctx.lineTo(botPost.x - dir * 3, botPost.y + 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = glow ? 'rgba(186, 230, 253, 0.58)' : 'rgba(241, 245, 249, 0.48)';
    ctx.lineWidth = 1;

    ctx.fillStyle = glow ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(ft.x, ft.y);
    ctx.lineTo(btTop.x, btTop.y);
    ctx.quadraticCurveTo(
      (btGround.x + bbGround.x) * 0.5 + bulgePx * 1.4,
      (btGround.y + bbGround.y) * 0.5 - 10,
      bbTop.x,
      bbTop.y
    );
    ctx.lineTo(fb.x, fb.y);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i <= 5; i++) {
      if (brokenRight && isRight && (i === 2 || i === 3)) continue;
      const f = i / 5;
      const sx = btTop.x + (btGround.x - btTop.x) * f;
      const sy = btTop.y + (btGround.y - btTop.y) * f;
      const ex = bbTop.x + (bbGround.x - bbTop.x) * f;
      const ey = bbTop.y + (bbGround.y - bbTop.y) * f;
      const midBulge = Math.sin(f * Math.PI) * bulgePx * 1.35 + bulgePx * 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + ex) * 0.5 + midBulge, (sy + ey) * 0.5, ex, ey);
      ctx.stroke();
    }

    for (let j = 1; j <= 4; j++) {
      if (brokenRight && isRight && j === 3) continue;
      const f = j / 5;
      const tx = btTop.x + (bbTop.x - btTop.x) * f;
      const ty = btTop.y + (bbTop.y - btTop.y) * f;
      const gx = btGround.x + (bbGround.x - btGround.x) * f;
      const gy = btGround.y + (bbGround.y - btGround.y) * f;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo((tx + gx) * 0.5 + bulgePx * 1.15, (ty + gy) * 0.5, gx, gy);
      ctx.stroke();
    }

    for (let k = 1; k <= 3; k++) {
      const f = k / 4;
      const x1 = ft.x + (fb.x - ft.x) * f;
      const y1 = ft.y + (fb.y - ft.y) * f;
      const x2 = btTop.x + (bbTop.x - btTop.x) * f;
      const y2 = btTop.y + (bbTop.y - btTop.y) * f;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(203, 213, 225, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ft.x, ft.y);
    ctx.lineTo(btTop.x, btTop.y);
    ctx.lineTo(btGround.x, btGround.y);
    ctx.moveTo(fb.x, fb.y);
    ctx.lineTo(bbTop.x, bbTop.y);
    ctx.lineTo(bbGround.x, bbGround.y);
    ctx.stroke();

    ctx.strokeStyle = glow ? '#e0f2fe' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (glow) {
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.moveTo(topPost.x, topPost.y);
    ctx.lineTo(ft.x, ft.y);
    ctx.lineTo(fb.x, fb.y);
    ctx.lineTo(botPost.x, botPost.y);
    ctx.stroke();
    ctx.restore();
  };

  drawOneGoal('left', netBulgeLeft);
  drawOneGoal('right', netBulgeRight);
}

// Bandiere e sciarpe animate sugli spalti nei colori sociali
function drawCrowdFlagsAndScarves(ctx, w, topY, t, env, clubInfo, count = 6) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const fx = 0.12 + (i / Math.max(1, count - 1)) * 0.76;
    const x = w * fx;
    const ola = getOlaOffset(fx, env);
    const y = 24 + (i % 2) * (topY * 0.24) - ola;

    if (i % 2 === 0) {
      // Bandierone sventolante
      const sway = Math.sin(t * 5.2 + i * 1.9) * 5;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y + 7);
      ctx.lineTo(x + sway * 0.35, y - 9);
      ctx.stroke();

      ctx.fillStyle = clubInfo.primary;
      ctx.beginPath();
      ctx.moveTo(x + sway * 0.35, y - 9);
      ctx.lineTo(x + 12 + sway * 0.6, y - 6);
      ctx.lineTo(x + sway * 0.2, y - 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = clubInfo.secondary;
      ctx.fillRect(x + sway * 0.3 + 2, y - 6.5, 5, 2.2);
    } else {
      // Sciarpa tesa al cielo
      const lift = Math.abs(Math.sin(t * 4.5 + i)) * 2.5;
      ctx.fillStyle = clubInfo.primary;
      ctx.fillRect(x - 7, y - lift, 14, 3.2);
      ctx.fillStyle = clubInfo.secondary;
      ctx.fillRect(x - 2.5, y - lift, 5, 3.2);
    }
  }
  ctx.restore();
}

function getOlaOffset(normX, env) {
  if (!env || env.olaIntensity <= 0.03) return 0;
  const dist = Math.abs(normX - (env.olaPhase % 1.25) + 0.12);
  const crest = Math.exp(-(dist * dist) / 0.018);
  return crest * 7.5 * env.olaIntensity;
}

function drawStrayDog(ctx, g, t, env) {
  if (!env.dog || !env.dog.active) return;
  const d = env.dog;
  const pt = projectPitch(d.nx, d.ny, g);
  const bob = Math.abs(Math.sin(t * 14)) * 2.4;

  ctx.save();
  ctx.translate(pt.x, pt.y - bob);
  ctx.scale(d.dir * pt.scale, pt.scale);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 7 + bob, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(8, -3, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#713f12';
  ctx.beginPath();
  ctx.ellipse(6.5, -5.2, 2, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-7, -1);
  ctx.lineTo(-12, -5 + Math.sin(t * 22) * 3);
  ctx.stroke();

  const leg = Math.sin(t * 18) * 3;
  ctx.strokeStyle = '#713f12';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-4, 3);
  ctx.lineTo(-4 - leg, 8);
  ctx.moveTo(4, 3);
  ctx.lineTo(4 + leg, 8);
  ctx.stroke();

  ctx.restore();
}

function drawDiagonalRain(ctx, w, h, t) {
  ctx.save();
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.23)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < 42; i++) {
    const seed = i * 73.13;
    const rx = ((seed * 19 + t * 145) % (w + 60)) - 30;
    const ry = 14 + ((seed * 31 + t * 340) % (h + 26));
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 6, ry + 14);
  }
  ctx.stroke();
  ctx.restore();
}

// 0 — TERZA CATEGORIA
function renderTerzaCategoria(ctx, w, h, g, t, env, clubInfo) {
  const skyGrad = ctx.createLinearGradient(0, 10, 0, g.topY);
  skyGrad.addColorStop(0, '#161f26');
  skyGrad.addColorStop(1, '#445036');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#3c3224';
  ctx.fillRect(0, g.topY - 6, w, h - g.topY + 6);

  // Staccionata di legno
  ctx.strokeStyle = '#78502b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(g.topLeft - 14, g.topY - 12);
  ctx.lineTo(g.topRight + 14, g.topY - 12);
  ctx.stroke();
  for (let x = g.topLeft - 10; x <= g.topRight + 10; x += 26) {
    ctx.fillStyle = '#5c3b1e';
    ctx.fillRect(x, g.topY - 21, 4, 15);
  }

  // Spettatori sparsi con ombrelli
  const crowdX = [0.16, 0.31, 0.49, 0.66, 0.82];
  const shirtCols = [clubInfo.primary, '#2563eb', '#eab308', '#f97316', clubInfo.secondary];
  crowdX.forEach((fx, i) => {
    const sx = w * fx;
    const ola = getOlaOffset(fx, env);
    const sy = g.topY - 27 - ola + Math.sin(t * 2.5 + i * 2) * 1.1;
    ctx.fillStyle = shirtCols[i % shirtCols.length];
    ctx.beginPath();
    ctx.arc(sx, sy + 6, 5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
    ctx.fill();
    if (i % 2 === 0) {
      ctx.fillStyle = i === 0 ? '#1d4ed8' : '#b91c1c';
      ctx.beginPath();
      ctx.arc(sx, sy - 4, 8, Math.PI, 0);
      ctx.fill();
    }
  });

  // Campo in terra battuta / fango
  const dirtGrad = ctx.createLinearGradient(0, g.topY, 0, g.bottomY);
  dirtGrad.addColorStop(0, '#6e5033');
  dirtGrad.addColorStop(0.5, '#7e5d3c');
  dirtGrad.addColorStop(1, '#5e4329');
  tracePitchQuad(ctx, g, 0, 0, 1, 1);
  ctx.fillStyle = dirtGrad;
  ctx.fill();

  const grassPatches = [
    [0.16, 0.22, 0.16, 0.13],
    [0.78, 0.26, 0.15, 0.15],
    [0.24, 0.78, 0.18, 0.12],
    [0.68, 0.74, 0.17, 0.14],
  ];
  ctx.fillStyle = 'rgba(84, 114, 48, 0.56)';
  for (const [gx, gy, gw, gh] of grassPatches) {
    const pt = projectPitch(gx, gy, g);
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, gw * pt.rowW * 0.45, gh * g.height * 0.45, 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  const mudSpots = [
    [0.44, 0.38, 0.08, 0.05],
    [0.58, 0.66, 0.09, 0.055],
    [0.13, 0.52, 0.06, 0.07],
  ];
  for (let i = 0; i < mudSpots.length; i++) {
    const [mx, my, mw, mh] = mudSpots[i];
    const pt = projectPitch(mx, my, g);
    ctx.fillStyle = 'rgba(56, 36, 19, 0.68)';
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, mw * pt.rowW, mh * g.height, -0.1, 0, Math.PI * 2);
    ctx.fill();

    const rip = (t * 1.4 + i * 0.37) % 1;
    ctx.strokeStyle = `rgba(186, 230, 253, ${(1 - rip) * 0.35})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, rip * mw * pt.rowW * 0.7, rip * mh * g.height * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawPerspectiveLines(ctx, g, { stroke: 'rgba(241, 245, 249, 0.66)', lineWidth: 1.9, crooked: true });
  drawCornerFlags(ctx, g, t, clubInfo);
  drawGoals3D(ctx, g, {
    brokenRight: true,
    netBulgeLeft: env.netBulgeLeft,
    netBulgeRight: env.netBulgeRight,
  });
  drawStrayDog(ctx, g, t, env);
  drawDiagonalRain(ctx, w, h, t);
  drawRoofStructure(ctx, w, { style: 'wood', lights: 0 });
}

// 1 — PROMOZIONE (Tramonto caldo, tribunetta cemento, tettoia leggera)
function renderPromozione(ctx, w, h, g, t, env, clubInfo) {
  const skyGrad = ctx.createLinearGradient(0, 12, w, g.topY);
  skyGrad.addColorStop(0, '#1e1b33');
  skyGrad.addColorStop(0.55, '#864030');
  skyGrad.addColorStop(1, '#d97732');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, g.topY);

  ctx.fillStyle = '#293e28';
  ctx.fillRect(0, g.topY - 4, w, h - g.topY + 4);

  const stTopL = g.topLeft + 16;
  const stTopR = g.topRight - 16;
  const stBotL = g.topLeft + 4;
  const stBotR = g.topRight - 4;
  const stTopY = 18;
  const stBotY = g.topY - 12;

  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.moveTo(stTopL, stTopY);
  ctx.lineTo(stTopR, stTopY);
  ctx.lineTo(stBotR, stBotY);
  ctx.lineTo(stBotL, stBotY);
  ctx.closePath();
  ctx.fill();

  for (let row = 0; row < 4; row++) {
    const f = (row + 0.5) / 4.2;
    const ry = stTopY + (stBotY - stTopY) * f;
    const lx = stTopL + (stBotL - stTopL) * f + 4;
    const rx = stTopR + (stBotR - stTopR) * f - 4;
    ctx.fillStyle = row % 2 === 0 ? '#94a3b8' : '#7c8ba1';
    ctx.fillRect(lx, ry, rx - lx, 4.5);
  }

  const crowdCols = [clubInfo.primary, clubInfo.secondary, '#facc15', '#38bdf8', '#22c55e', '#fb923c'];
  for (let i = 0; i < 36; i++) {
    const row = i % 3;
    const col = Math.floor(i / 3);
    const fx = 0.18 + (col / 11.5) * 0.64;
    const ola = getOlaOffset(fx, env);
    const sx = w * fx + row * 2.5;
    const sy = stTopY + 10 + row * 12 - ola + Math.sin(t * 3.2 + i) * 1.1;
    ctx.fillStyle = crowdCols[i % crowdCols.length];
    ctx.beginPath();
    ctx.arc(sx, sy, 3.1, 0, Math.PI * 2);
    ctx.fill();
  }
  drawCrowdFlagsAndScarves(ctx, w, g.topY, t, env, clubInfo, 4);

  const turfGrad = ctx.createLinearGradient(0, g.topY, 0, g.bottomY);
  turfGrad.addColorStop(0, '#3a843d');
  turfGrad.addColorStop(1, '#2f7234');
  tracePitchQuad(ctx, g, 0, 0, 1, 1);
  ctx.fillStyle = turfGrad;
  ctx.fill();

  const patches = [
    [0.2, 0.3, 0.22, 0.2, '#4c9c46'],
    [0.75, 0.32, 0.24, 0.22, '#327437'],
    [0.5, 0.64, 0.26, 0.2, '#4c9b47'],
    [0.09, 0.5, 0.1, 0.22, '#7d6b47'],
    [0.91, 0.5, 0.1, 0.22, '#7d6b47'],
  ];
  for (const [px, py, pw, ph, col] of patches) {
    const pt = projectPitch(px, py, g);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.52;
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, pw * pt.rowW * 0.5, ph * g.height * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawTurfTexture(ctx, g, 0.07);
  drawPerspectiveLines(ctx, g, { stroke: 'rgba(255,255,255,0.86)', lineWidth: 2 });
  drawCornerFlags(ctx, g, t, clubInfo);
  drawGoals3D(ctx, g, {
    netBulgeLeft: env.netBulgeLeft,
    netBulgeRight: env.netBulgeRight,
  });

  const benchY = g.bottomY + 4;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(g.bottomLeft + g.bottomW * 0.12, benchY, g.bottomW * 0.22, 10);
  ctx.fillRect(g.bottomLeft + g.bottomW * 0.66, benchY, g.bottomW * 0.22, 10);
  ctx.fillStyle = clubInfo.primary;
  ctx.fillRect(g.bottomLeft + g.bottomW * 0.12, benchY, g.bottomW * 0.22, 3);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(g.bottomLeft + g.bottomW * 0.66, benchY, g.bottomW * 0.22, 3);

  // Luce da tramonto calda contenuta sotto la tettoia
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sunGlow = ctx.createRadialGradient(w * 0.9, 28, 6, w * 0.85, g.topY * 0.8, w * 0.9);
  sunGlow.addColorStop(0, 'rgba(255, 195, 95, 0.22)');
  sunGlow.addColorStop(0.55, 'rgba(251, 146, 60, 0.08)');
  sunGlow.addColorStop(1, 'rgba(251, 146, 60, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 14, w, h - 14);
  ctx.restore();

  drawRoofStructure(ctx, w, { style: 'metal', lights: 2 });
}

// 2 — SERIE C (Strisce prospettiche, curve, LED scorrevole, fumogeni, bandiere)
function renderSerieC(ctx, w, h, g, t, env, clubInfo) {
  ctx.fillStyle = '#102019';
  ctx.fillRect(0, 0, w, h);

  const standGrad = ctx.createLinearGradient(0, 14, 0, g.topY - 12);
  standGrad.addColorStop(0, '#131d2f');
  standGrad.addColorStop(1, '#334155');
  ctx.fillStyle = standGrad;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, 14);
  ctx.lineTo(w * 0.94, 14);
  ctx.lineTo(g.topRight + 8, g.topY - 12);
  ctx.lineTo(g.topLeft - 8, g.topY - 12);
  ctx.closePath();
  ctx.fill();

  // Curve
  ctx.fillStyle = '#1b273b';
  ctx.beginPath();
  ctx.moveTo(0, g.topY - 4);
  ctx.lineTo(g.topLeft - 12, g.topY);
  ctx.lineTo(g.bottomLeft - 10, g.bottomY);
  ctx.lineTo(0, g.bottomY + 12);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w, g.topY - 4);
  ctx.lineTo(g.topRight + 12, g.topY);
  ctx.lineTo(g.bottomRight + 10, g.bottomY);
  ctx.lineTo(w, g.bottomY + 12);
  ctx.closePath();
  ctx.fill();

  const crowdCols = [clubInfo.primary, clubInfo.secondary, '#facc15', '#38bdf8', '#22c55e', '#fb7185'];
  for (let i = 0; i < 96; i++) {
    const fx = 0.08 + ((i * 37) % 84) / 100;
    const ola = getOlaOffset(fx, env);
    const sx = w * fx;
    const sy = 20 + (i % 5) * ((g.topY - 38) / 4.4) - ola + Math.sin(t * 4 + i) * 1.1;
    ctx.fillStyle = crowdCols[i % crowdCols.length];
    ctx.beginPath();
    ctx.arc(sx, sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  drawCrowdFlagsAndScarves(ctx, w, g.topY, t, env, clubInfo, 6);

  drawScrollingLED(ctx, g, t, {
    bg: clubInfo.primary,
    textCol: '#ffffff',
    message: `FORZA ${clubInfo.name.toUpperCase()}  •  SERIE C LIVE  •  CARNI PEPPINO  •  BAR SPORT`,
  });

  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    tracePitchQuad(ctx, g, i / stripes, 0, (i + 1) / stripes + 0.002, 1);
    ctx.fillStyle = i % 2 === 0 ? '#1f9e48' : '#178339';
    ctx.fill();
  }

  drawTurfTexture(ctx, g, 0.085);
  drawPerspectiveLines(ctx, g, { stroke: 'rgba(255,255,255,0.92)', lineWidth: 2 });
  drawCornerFlags(ctx, g, t, clubInfo);
  drawGoals3D(ctx, g, {
    netBulgeLeft: env.netBulgeLeft,
    netBulgeRight: env.netBulgeRight,
  });

  // Fumogeni colorati dalle curve
  const smokeSources = [
    { x: g.topLeft * 0.45, y: g.cy - 24, col: '239, 68, 68' },
    { x: g.bottomLeft * 0.55, y: g.cy + 28, col: '250, 204, 21' },
    { x: w - g.topLeft * 0.45, y: g.cy - 20, col: '56, 189, 248' },
    { x: w - g.bottomLeft * 0.55, y: g.cy + 26, col: '239, 68, 68' },
  ];
  ctx.save();
  for (const s of smokeSources) {
    for (let k = 0; k < 5; k++) {
      const phase = (t * 0.45 + k * 0.2) % 1;
      const rx = s.x + Math.sin(t * 2 + k * 1.7) * 7 + phase * 8;
      const ry = s.y - phase * 26;
      const rad = 5 + phase * 13;
      ctx.fillStyle = `rgba(${s.col}, ${((1 - phase) * 0.34).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  drawRoofStructure(ctx, w, { style: 'metal', lights: 3 });
}

// 3 — SERIE A (Tettoia metallica con fari, riflettori 'lighter' direzionati verso il campo, LED scorrevole)
function renderSerieA(ctx, w, h, g, t, env, clubInfo) {
  ctx.fillStyle = '#09101d';
  ctx.fillRect(0, 0, w, h);

  const standGrad = ctx.createLinearGradient(0, 14, 0, g.topY);
  standGrad.addColorStop(0, '#0c1424');
  standGrad.addColorStop(0.55, '#1e293b');
  standGrad.addColorStop(1, '#334155');
  ctx.fillStyle = standGrad;
  ctx.fillRect(0, 14, w, g.topY - 20);

  ctx.fillStyle = clubInfo.primary;
  ctx.fillRect(0, 14 + (g.topY - 20) * 0.44, w, 3);

  const crowdCols = [clubInfo.primary, clubInfo.secondary, '#f8fafc', '#38bdf8', '#facc15', '#c084fc'];
  for (let i = 0; i < 165; i++) {
    const fx = 0.02 + ((i * 29) % 96) / 100;
    const ola = getOlaOffset(fx, env);
    const sx = w * fx;
    const sy = 19 + (i % 6) * ((g.topY - 36) / 5.4) - ola + Math.sin(t * 5 + i) * 1.0;
    ctx.fillStyle = crowdCols[i % crowdCols.length];
    ctx.fillRect(sx, sy, 3.0, 3.0);
  }
  drawCrowdFlagsAndScarves(ctx, w, g.topY, t, env, clubInfo, 8);

  drawScrollingLED(ctx, g, t, {
    bg: '#4c1d95',
    textCol: '#ffffff',
    message: `SERIE A DIRETTA HD  •  FORZA ${clubInfo.name.toUpperCase()}  •  TUTTO ESAURITO`,
  });

  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    tracePitchQuad(ctx, g, i / stripes, 0, (i + 1) / stripes + 0.002, 1);
    ctx.fillStyle = i % 2 === 0 ? '#16a34a' : '#14803c';
    ctx.fill();
  }

  drawTurfTexture(ctx, g, 0.1);
  drawPerspectiveLines(ctx, g, { stroke: 'rgba(255,255,255,0.95)', lineWidth: 2.1 });
  drawCornerFlags(ctx, g, t, clubInfo);
  drawGoals3D(ctx, g, {
    netBulgeLeft: env.netBulgeLeft,
    netBulgeRight: env.netBulgeRight,
  });

  // Luci volumetriche che partono dai 4 fari sotto la tettoia (y=17, mai sopra la status bar!)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const fx = w * ((i + 0.5) / 4);
    const fy = 17;
    const tx = w * (0.2 + i * 0.2);
    const ty = h * 0.86;
    const beamGrad = ctx.createLinearGradient(fx, fy, tx, ty);
    beamGrad.addColorStop(0, 'rgba(255, 252, 232, 0.22)');
    beamGrad.addColorStop(0.55, 'rgba(255, 250, 220, 0.07)');
    beamGrad.addColorStop(1, 'rgba(255, 250, 220, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(fx - 7, fy);
    ctx.lineTo(fx + 7, fy);
    ctx.lineTo(tx + w * 0.18, ty);
    ctx.lineTo(tx - w * 0.18, ty);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Flash fotografici sugli spalti
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const pulse = Math.sin(t * 8.5 + i * 2.71);
    if (pulse > 0.91) {
      const fx = ((i * 79 + Math.floor(t * 2) * 31) % Math.max(20, Math.floor(w - 20))) + 10;
      const fy = 20 + ((i * 23) % Math.max(12, Math.floor(g.topY - 34)));
      const alpha = (pulse - 0.91) / 0.09;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 4.6 * alpha + 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  drawRoofStructure(ctx, w, { style: 'metal', lights: 4 });
}

// 4 — NOTTE EUROPEA (Arena futuristica, tettoia LED con fari volumetrici, stelle, fuochi)
function renderNotteEuropea(ctx, w, h, g, t, env, clubInfo) {
  const bgGrad = ctx.createLinearGradient(0, 14, 0, h);
  bgGrad.addColorStop(0, '#070c16');
  bgGrad.addColorStop(0.35, '#0b1a3d');
  bgGrad.addColorStop(1, '#040a1a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 140; i++) {
    const fx = 0.02 + ((i * 43) % 96) / 100;
    const ola = getOlaOffset(fx, env);
    const sx = w * fx;
    const sy = 19 + (i % 6) * ((g.topY - 36) / 5.4) - ola;
    const twinkle = 0.45 + 0.55 * Math.sin(t * 4.2 + i * 1.9);
    ctx.fillStyle =
      i % 5 === 0
        ? `rgba(251, 191, 36, ${twinkle.toFixed(2)})`
        : `rgba(186, 230, 253, ${(twinkle * 0.85).toFixed(2)})`;
    ctx.fillRect(sx, sy, 2.6, 2.6);
  }
  drawCrowdFlagsAndScarves(ctx, w, g.topY, t, env, clubInfo, 8);

  drawScrollingLED(ctx, g, t, {
    bg: '#0f295c',
    textCol: '#fef08a',
    message: `NOTTE EUROPEA  •  ${clubInfo.name.toUpperCase()}  •  ARENA DELLE STELLE  •  FINALE LIVE`,
  });

  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    tracePitchQuad(ctx, g, i / stripes, 0, (i + 1) / stripes + 0.002, 1);
    ctx.fillStyle = i % 2 === 0 ? '#0d7e49' : '#0a653a';
    ctx.fill();
  }

  drawTurfTexture(ctx, g, 0.11);

  ctx.save();
  tracePitchQuad(ctx, g, -0.015, -0.02, 1.015, 1.02);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.58)';
  ctx.lineWidth = 2.4;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();

  drawPerspectiveLines(ctx, g, { stroke: 'rgba(224, 242, 254, 0.94)', lineWidth: 2 });
  drawCornerFlags(ctx, g, t, clubInfo);
  drawGoals3D(ctx, g, {
    glow: true,
    netBulgeLeft: env.netBulgeLeft,
    netBulgeRight: env.netBulgeRight,
  });

  // Fasci volumetrici rotanti ancorati sotto la tettoia (y=17)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beamOrigins = [
    { x: w * 0.14, y: 17, phase: 0, col: 'rgba(56, 189, 248, 0.16)' },
    { x: w * 0.86, y: 17, phase: 2.1, col: 'rgba(250, 204, 21, 0.14)' },
    { x: w * 0.5, y: 17, phase: 4.2, col: 'rgba(129, 140, 248, 0.14)' },
  ];
  for (const b of beamOrigins) {
    const angle = Math.PI * 0.5 + Math.sin(t * 0.78 + b.phase) * 0.48;
    const len = h * 1.1;
    const spread = 0.14;
    ctx.fillStyle = b.col;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(angle - spread) * len, b.y + Math.sin(angle - spread) * len);
    ctx.lineTo(b.x + Math.cos(angle + spread) * len, b.y + Math.sin(angle + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawRoofStructure(ctx, w, { style: 'futuristic', accent: '#38bdf8', lights: 4 });
}

// 5 — MONDIALE PER CLUB (Arena monumentale oro/bianca assolata, pubblico internazionale)
function renderMondialePerClub(ctx, w, h, g, t, env, clubInfo) {
  const skyGrad = ctx.createLinearGradient(0, 12, 0, g.topY + 12);
  skyGrad.addColorStop(0, '#0f172a');
  skyGrad.addColorStop(0.42, '#1e3a5f');
  skyGrad.addColorStop(1, '#9a6b24');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Anello monumentale oro-bianco
  const standGrad = ctx.createLinearGradient(0, 16, 0, g.topY - 12);
  standGrad.addColorStop(0, '#1e293b');
  standGrad.addColorStop(0.55, '#334155');
  standGrad.addColorStop(1, '#475569');
  ctx.fillStyle = standGrad;
  ctx.fillRect(0, 16, w, g.topY - 24);

  // Fascia architettonica dorata
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(0, 16 + (g.topY - 26) * 0.45, w, 3.2);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 16 + (g.topY - 26) * 0.45 + 3.2, w, 1.5);

  // Pubblico internazionale multicolore
  const worldCols = ['#fde047', '#38bdf8', '#4ade80', '#f87171', '#f8fafc', clubInfo.primary, clubInfo.secondary];
  for (let i = 0; i < 185; i++) {
    const fx = 0.02 + ((i * 23) % 96) / 100;
    const ola = getOlaOffset(fx, env);
    const sx = w * fx;
    const sy = 20 + (i % 6) * ((g.topY - 38) / 5.4) - ola + Math.sin(t * 5.2 + i) * 1.0;
    ctx.fillStyle = worldCols[i % worldCols.length];
    ctx.fillRect(sx, sy, 2.9, 2.9);
  }
  drawCrowdFlagsAndScarves(ctx, w, g.topY, t, env, clubInfo, 9);

  drawScrollingLED(ctx, g, t, {
    bg: '#78350f',
    textCol: '#fef08a',
    message: `MONDIALE PER CLUB  •  ${clubInfo.name.toUpperCase()}  •  WORLD FINAL LIVE  •  COPPA INTERCONTINENTALE`,
  });

  // Erba da finale mondiale a strisce brillanti
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    tracePitchQuad(ctx, g, i / stripes, 0, (i + 1) / stripes + 0.002, 1);
    ctx.fillStyle = i % 2 === 0 ? '#16a34a' : '#117c38';
    ctx.fill();
  }

  drawTurfTexture(ctx, g, 0.12);

  // Cornice perimetrale dorata
  ctx.save();
  tracePitchQuad(ctx, g, -0.014, -0.018, 1.014, 1.018);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.62)';
  ctx.lineWidth = 2.4;
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  drawPerspectiveLines(ctx, g, { stroke: 'rgba(255, 255, 255, 0.96)', lineWidth: 2.1 });
  drawCornerFlags(ctx, g, t, clubInfo);
  drawGoals3D(ctx, g, {
    glow: false,
    netBulgeLeft: env.netBulgeLeft,
    netBulgeRight: env.netBulgeRight,
  });

  // Fasci di luce dorati caldi dai fari sotto la tettoia
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const fx = w * ((i + 0.5) / 4);
    const fy = 17;
    const tx = w * (0.18 + i * 0.21);
    const ty = h * 0.88;
    const beam = ctx.createLinearGradient(fx, fy, tx, ty);
    beam.addColorStop(0, 'rgba(254, 240, 138, 0.24)');
    beam.addColorStop(0.55, 'rgba(251, 191, 36, 0.08)');
    beam.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(fx - 8, fy);
    ctx.lineTo(fx + 8, fy);
    ctx.lineTo(tx + w * 0.19, ty);
    ctx.lineTo(tx - w * 0.19, ty);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawRoofStructure(ctx, w, { style: 'futuristic', accent: '#fbbf24', lights: 4 });
}

// 6 — SUPERLEGA GALATTICA (Nebulosa cosmica viola/oro, stelle orbitanti, stadio del futuro)
function renderSuperlegaGalattica(ctx, w, h, g, t, env, clubInfo) {
  const bgGrad = ctx.createLinearGradient(0, 12, w, h);
  bgGrad.addColorStop(0, '#070414');
  bgGrad.addColorStop(0.35, '#1e0b3a');
  bgGrad.addColorStop(0.7, '#0b1030');
  bgGrad.addColorStop(1, '#040612');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Nebulosa cosmica soffusa sullo sfondo alto
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const neb1 = ctx.createRadialGradient(w * 0.25, g.topY * 0.52, 6, w * 0.25, g.topY * 0.52, w * 0.44);
  neb1.addColorStop(0, 'rgba(192, 132, 252, 0.28)');
  neb1.addColorStop(0.6, 'rgba(124, 58, 237, 0.08)');
  neb1.addColorStop(1, 'rgba(124, 58, 237, 0)');
  ctx.fillStyle = neb1;
  ctx.fillRect(0, 14, w, g.topY + 20);

  const neb2 = ctx.createRadialGradient(w * 0.78, g.topY * 0.48, 6, w * 0.78, g.topY * 0.48, w * 0.42);
  neb2.addColorStop(0, 'rgba(251, 191, 36, 0.24)');
  neb2.addColorStop(0.6, 'rgba(244, 114, 182, 0.08)');
  neb2.addColorStop(1, 'rgba(244, 114, 182, 0)');
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 14, w, g.topY + 20);
  ctx.restore();

  // Stelle cosmiche scintillanti + spalti olografici
  for (let i = 0; i < 165; i++) {
    const fx = 0.02 + ((i * 41) % 96) / 100;
    const ola = getOlaOffset(fx, env);
    const sx = w * fx;
    const sy = 18 + (i % 6) * ((g.topY - 36) / 5.4) - ola;
    const tw = 0.4 + 0.6 * Math.sin(t * 5 + i * 1.7);
    ctx.fillStyle =
      i % 4 === 0
        ? `rgba(253, 224, 71, ${tw.toFixed(2)})`
        : i % 4 === 1
          ? `rgba(232, 121, 249, ${(tw * 0.9).toFixed(2)})`
          : `rgba(125, 211, 252, ${(tw * 0.85).toFixed(2)})`;
    ctx.fillRect(sx, sy, 2.5, 2.5);
  }

  // Piccole stelle dorate orbitanti
  for (let i = 0; i < 6; i++) {
    const ox = w * (0.14 + i * 0.145) + Math.cos(t * 1.4 + i) * 7;
    const oy = 25 + Math.sin(t * 1.9 + i * 1.3) * 6;
    ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.beginPath();
    ctx.arc(ox, oy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCrowdFlagsAndScarves(ctx, w, g.topY, t, env, clubInfo, 9);

  drawScrollingLED(ctx, g, t, {
    bg: '#3b0764',
    textCol: '#fde047',
    message: `★ SUPERLEGA GALATTICA ★  •  ${clubInfo.name.toUpperCase()}  •  OLIMPO DEL CALCIO  •  LIVE`,
  });

  // Erba cosmica smeraldo-blu
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    tracePitchQuad(ctx, g, i / stripes, 0, (i + 1) / stripes + 0.002, 1);
    ctx.fillStyle = i % 2 === 0 ? '#0d8a5e' : '#096e4b';
    ctx.fill();
  }

  drawTurfTexture(ctx, g, 0.13);

  // Perimetro neon oro/viola
  ctx.save();
  tracePitchQuad(ctx, g, -0.016, -0.02, 1.016, 1.02);
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
  ctx.lineWidth = 2.6;
  ctx.shadowColor = '#c084fc';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();

  drawPerspectiveLines(ctx, g, { stroke: 'rgba(254, 249, 195, 0.94)', lineWidth: 2.1 });
  drawCornerFlags(ctx, g, t, clubInfo);
  drawGoals3D(ctx, g, {
    glow: true,
    netBulgeLeft: env.netBulgeLeft,
    netBulgeRight: env.netBulgeRight,
  });

  // Fasci galattici rotanti oro, magenta e ciano
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beamOrigins = [
    { x: w * 0.14, y: 17, phase: 0, col: 'rgba(250, 204, 21, 0.17)' },
    { x: w * 0.5, y: 17, phase: 2.1, col: 'rgba(232, 121, 249, 0.15)' },
    { x: w * 0.86, y: 17, phase: 4.2, col: 'rgba(56, 189, 248, 0.16)' },
  ];
  for (const b of beamOrigins) {
    const angle = Math.PI * 0.5 + Math.sin(t * 0.9 + b.phase) * 0.52;
    const len = h * 1.1;
    const spread = 0.15;
    ctx.fillStyle = b.col;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(angle - spread) * len, b.y + Math.sin(angle - spread) * len);
    ctx.lineTo(b.x + Math.cos(angle + spread) * len, b.y + Math.sin(angle + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawRoofStructure(ctx, w, { style: 'futuristic', accent: '#facc15', lights: 4 });
}

export function renderStadiumTheme(ctx, leagueIndex, w, h, g, t, env, clubInfo, upgrades = {}) {
  switch (leagueIndex) {
    case 0:
      renderTerzaCategoria(ctx, w, h, g, t, env, clubInfo);
      drawSlowClouds(ctx, w, g.topY, t, 'rgba(148, 163, 184, 0.15)');
      break;
    case 1:
      renderPromozione(ctx, w, h, g, t, env, clubInfo);
      drawSlowClouds(ctx, w, g.topY, t, 'rgba(253, 186, 116, 0.18)');
      break;
    case 2:
      renderSerieC(ctx, w, h, g, t, env, clubInfo);
      drawSlowClouds(ctx, w, g.topY, t, 'rgba(226, 232, 240, 0.12)');
      break;
    case 3:
      renderSerieA(ctx, w, h, g, t, env, clubInfo);
      break;
    case 4:
      renderNotteEuropea(ctx, w, h, g, t, env, clubInfo);
      break;
    case 5:
      renderMondialePerClub(ctx, w, h, g, t, env, clubInfo);
      break;
    case 6:
    default:
      renderSuperlegaGalattica(ctx, w, h, g, t, env, clubInfo);
      break;
  }

  // Luci perimetrali sottili sugli spalti/bordocampo nelle categorie Serie C+
  if (leagueIndex >= 2) {
    ctx.save();
    const lightCol =
      leagueIndex === 6
        ? 'rgba(250, 204, 21, 0.42)'
        : leagueIndex === 5
          ? 'rgba(254, 240, 138, 0.38)'
          : leagueIndex === 4
            ? 'rgba(56, 189, 248, 0.38)'
            : 'rgba(255, 255, 255, 0.24)';
    for (let i = 0; i < 8; i++) {
      const f = (i + 0.5) / 8;
      const lx = g.topLeft + f * g.topW;
      const ly = g.topY - 12.5;
      const pulse = 0.55 + 0.45 * Math.sin(t * 3.5 + i * 0.9);
      ctx.fillStyle = lightCol;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Costruzioni fisiche sbloccate dagli upgrade Club (evolvono con la categoria!)
  renderStadiumBuildings(ctx, w, h, g, t, upgrades, clubInfo, leagueIndex, env);
}

// --- CALCI DI RIGORE FRONTALI 3D (v4.5) ---

function getPenaltyGoalBox(w, h) {
  const gx = w * 0.14;
  const gw = w * 0.72;
  const gy = h * 0.17;
  const gh = h * 0.35;
  return { gx, gy, gw, gh, groundY: gy + gh };
}

const PEN_ZONE_COORDS = [
  { id: 'top_left', tx: 0.24, ty: 0.28 },
  { id: 'panenka', tx: 0.50, ty: 0.40 },
  { id: 'top_right', tx: 0.76, ty: 0.28 },
  { id: 'low_left', tx: 0.26, ty: 0.72 },
  { id: 'low_right', tx: 0.74, ty: 0.72 },
];

export function hitTestPenaltyGoalZone(clickX, clickY, w, h) {
  const box = getPenaltyGoalBox(w, h);
  if (
    clickX < box.gx - 12 ||
    clickX > box.gx + box.gw + 12 ||
    clickY < box.gy - 12 ||
    clickY > box.groundY + 12
  ) {
    return null;
  }
  let best = null;
  let bestDist = Infinity;
  for (const z of PEN_ZONE_COORDS) {
    const zx = box.gx + z.tx * box.gw;
    const zy = box.gy + z.ty * box.gh;
    const d = Math.hypot(clickX - zx, clickY - zy);
    if (d < bestDist) {
      bestDist = d;
      best = z.id;
    }
  }
  return best;
}

function draw3DPenaltyBall(ctx, x, y, r, spin = 0) {
  ctx.save();
  ctx.translate(x, y);
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.75, '#e2e8f0');
  grad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, r - 0.5), 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(spin);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const vx = Math.cos(a) * r * 0.42;
    const vy = Math.sin(a) * r * 0.42;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.33, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function renderPenaltyFrontal3D(
  ctx,
  w,
  h,
  t,
  pen,
  clubInfo,
  oppColors = ['#3b82f6', '#facc15'],
  leagueIndex = 0
) {
  const box = getPenaltyGoalBox(w, h);
  const horizonY = box.groundY - 4;

  // 1. Cielo notturno / stadio dietro la curva frontale
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  if (leagueIndex >= 5) {
    sky.addColorStop(0, '#09071a');
    sky.addColorStop(0.6, '#1e1b4b');
    sky.addColorStop(1, '#312e81');
  } else if (leagueIndex >= 3) {
    sky.addColorStop(0, '#070e1c');
    sky.addColorStop(0.6, '#0f2544');
    sky.addColorStop(1, '#1e3a5f');
  } else {
    sky.addColorStop(0, '#0b1424');
    sky.addColorStop(1, '#1e293b');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizonY + 4);

  // Curva Ultras animata dietro la porta
  const standTop = h * 0.08;
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, standTop, w, horizonY - standTop);
  const crowdCols = [
    clubInfo.primary,
    clubInfo.secondary,
    '#facc15',
    '#38bdf8',
    '#f8fafc',
    oppColors[0] || '#ef4444',
  ];
  for (let i = 0; i < 64; i++) {
    const cx = ((i * 37) % 98 + 1) * (w / 100);
    const row = i % 4;
    const cy = standTop + 10 + row * ((horizonY - standTop - 16) / 4);
    const jump = Math.abs(Math.sin(t * 4.5 + i * 0.7)) * 2.6;
    ctx.fillStyle = crowdCols[i % crowdCols.length];
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(cx, cy - jump, 3.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Cartellone pubblicitario LED lungo la linea di fondo
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, horizonY - 12, w, 12);
  ctx.fillStyle = clubInfo.primary;
  ctx.fillRect(0, horizonY - 12, w, 2);
  ctx.fillStyle = '#fde047';
  ctx.font = '800 7px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `★  ${clubInfo.name.toUpperCase()}  •  CALCI DI RIGORE  •  PROVINCIA BROADCAST HD  ★`,
    w * 0.5,
    horizonY - 5.5
  );

  // Fari superiori da stadio
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fx of [w * 0.18, w * 0.82]) {
    const beam = ctx.createRadialGradient(fx, 14, 4, fx, h * 0.45, w * 0.42);
    beam.addColorStop(0, 'rgba(254, 249, 195, 0.28)');
    beam.addColorStop(0.55, 'rgba(186, 230, 253, 0.08)');
    beam.addColorStop(1, 'rgba(186, 230, 253, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // 2. Prato in prospettiva frontale con fasce rasate e area di rigore
  const turfGrad = ctx.createLinearGradient(0, horizonY, 0, h);
  turfGrad.addColorStop(0, '#166534');
  turfGrad.addColorStop(0.5, '#15803d');
  turfGrad.addColorStop(1, '#14532d');
  ctx.fillStyle = turfGrad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  // Fasce rasate orizzontali in prospettiva
  const stripeBands = 6;
  for (let i = 0; i < stripeBands; i++) {
    const f0 = Math.pow(i / stripeBands, 1.35);
    const f1 = Math.pow((i + 1) / stripeBands, 1.35);
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, horizonY + f0 * (h - horizonY), w, (f1 - f0) * (h - horizonY));
    }
  }

  // Linea di porta, area piccola e dischetto del rigore
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, box.groundY);
  ctx.lineTo(w, box.groundY);
  // Area piccola trapezoidale
  ctx.moveTo(box.gx - w * 0.04, box.groundY);
  ctx.lineTo(w * 0.04, h * 0.72);
  ctx.lineTo(w * 0.96, h * 0.72);
  ctx.lineTo(box.gx + box.gw + w * 0.04, box.groundY);
  ctx.stroke();

  // Dischetto del rigore in basso al centro
  const spotX = w * 0.5;
  const spotY = h * 0.87;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.ellipse(spotX, spotY, 8.5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. GRANDE PORTA FRONTALE 3D CON RETE ELASTICA
  const insetX = box.gw * 0.075;
  const insetY = box.gh * 0.11;
  const anim = pen.shotAnim;
  const animU = anim && anim.active ? Math.min(1, anim.elapsed / Math.max(0.05, anim.duration)) : 0;
  const netHit =
    anim && anim.active && anim.scored && animU > 0.58
      ? Math.sin(((animU - 0.58) / 0.42) * Math.PI) * 11
      : 0;

  // Ombra porta sull'erba
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(box.gx - 4, box.groundY, box.gw + 8, 7);

  // Interno rete semitrasparente
  ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
  ctx.fillRect(box.gx, box.gy, box.gw, box.gh);

  // Maglia della rete 3D (fondo + lati + cielo)
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.36)';
  ctx.lineWidth = 1;
  const bx0 = box.gx + insetX;
  const bx1 = box.gx + box.gw - insetX;
  const by0 = box.gy + insetY;
  const by1 = box.groundY - 2;

  const impactX = anim ? box.gx + anim.targetTx * box.gw : w * 0.5;
  const impactY = anim ? box.gy + anim.targetTy * box.gh : box.gy + box.gh * 0.5;

  // Linee verticali della rete sul fondo
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    const x = bx0 + (bx1 - bx0) * f;
    const distScale = Math.max(0, 1 - Math.abs(x - impactX) / (box.gw * 0.35));
    const push = netHit * distScale;
    ctx.beginPath();
    ctx.moveTo(x, by0);
    ctx.quadraticCurveTo(x + (x < impactX ? -push * 0.35 : push * 0.35), impactY, x, by1);
    ctx.stroke();
  }
  // Linee orizzontali della rete sul fondo
  for (let j = 0; j <= 6; j++) {
    const f = j / 6;
    const y = by0 + (by1 - by0) * f;
    const distScale = Math.max(0, 1 - Math.abs(y - impactY) / (box.gh * 0.45));
    const push = netHit * distScale;
    ctx.beginPath();
    ctx.moveTo(bx0, y);
    ctx.quadraticCurveTo(impactX, y - push * 0.45, bx1, y);
    ctx.stroke();
  }
  // Cavi prospettici laterali (dalla traversa/pali verso il fondo rete)
  for (let j = 1; j <= 5; j++) {
    const f = j / 6;
    ctx.beginPath();
    ctx.moveTo(box.gx, box.gy + box.gh * f);
    ctx.lineTo(bx0, by0 + (by1 - by0) * f);
    ctx.moveTo(box.gx + box.gw, box.gy + box.gh * f);
    ctx.lineTo(bx1, by0 + (by1 - by0) * f);
    ctx.stroke();
  }

  // Pali e Traversa 3D bianchi brillanti
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(box.gx, box.groundY);
  ctx.lineTo(box.gx, box.gy);
  ctx.lineTo(box.gx + box.gw, box.gy);
  ctx.lineTo(box.gx + box.gw, box.groundY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 4. MIRINI DELLE 5 ZONE IN PORTA (solo nel turno tiro del giocatore!)
  if (pen.turn === 'player' && !pen.locked) {
    for (const z of PEN_ZONE_COORDS) {
      const zx = box.gx + z.tx * box.gw;
      const zy = box.gy + z.ty * box.gh;
      const isSel = pen.selectedZone === z.id;
      const r = isSel ? 15 + Math.sin(t * 9) * 2.2 : 10;

      ctx.save();
      ctx.beginPath();
      ctx.arc(zx, zy, r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? 'rgba(34, 197, 94, 0.34)' : 'rgba(255, 255, 255, 0.12)';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#fde047' : 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = isSel ? 2.6 : 1.4;
      ctx.stroke();

      if (isSel) {
        ctx.beginPath();
        ctx.moveTo(zx - 7, zy);
        ctx.lineTo(zx + 7, zy);
        ctx.moveTo(zx, zy - 7);
        ctx.lineTo(zx, zy + 7);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 5. PORTIERE SULLA LINEA DI PORTA (si tuffa davvero!)
  const isPlayerShooting = pen.turn === 'player';
  const gkKitPrimary = isPlayerShooting ? '#84cc16' : clubInfo.primary;
  const gkKitSecondary = isPlayerShooting ? '#0f172a' : clubInfo.secondary;

  let gkX = w * 0.5;
  let gkY = box.groundY - 22;
  let gkAngle = 0;

  if (anim && anim.active) {
    const diveEase = Math.sin(Math.min(1, animU * 1.35) * (Math.PI / 2));
    const kc = anim.keeperCorner;
    if (kc === 'left') {
      gkX = w * 0.5 - box.gw * 0.29 * diveEase;
      gkY = box.groundY - 22 - (anim.keeperHeight === 'top' ? 18 : 6) * diveEase;
      gkAngle = -1.12 * diveEase;
    } else if (kc === 'right') {
      gkX = w * 0.5 + box.gw * 0.29 * diveEase;
      gkY = box.groundY - 22 - (anim.keeperHeight === 'top' ? 18 : 6) * diveEase;
      gkAngle = 1.12 * diveEase;
    } else if (kc === 'center') {
      gkY = box.groundY - 22 - 8 * Math.sin(animU * Math.PI);
    }
  } else {
    // Rimbalzo atletico da fermo
    gkX = w * 0.5 + Math.sin(t * 4.2) * 5;
    gkY = box.groundY - 22 - Math.abs(Math.sin(t * 6)) * 3;
  }

  ctx.save();
  ctx.translate(gkX, gkY);
  // Ombra portiere
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 22, 16, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(gkAngle);
  // Gambe
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-7, 6, 5, 14);
  ctx.fillRect(2, 6, 5, 14);
  // Busto portiere
  ctx.fillStyle = gkKitPrimary;
  ctx.beginPath();
  ctx.roundRect(-10, -10, 20, 18, 5);
  ctx.fill();
  ctx.fillStyle = gkKitSecondary;
  ctx.fillRect(-3.5, -10, 7, 17);
  // Braccia + Guantoni larghi
  ctx.strokeStyle = gkKitPrimary;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9, -6);
  ctx.lineTo(-20, -14);
  ctx.moveTo(9, -6);
  ctx.lineTo(20, -14);
  ctx.stroke();
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(-21, -15, 4.2, 0, Math.PI * 2);
  ctx.arc(21, -15, 4.2, 0, Math.PI * 2);
  ctx.fill();
  // Testa
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(0, -16, 6.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(0, -18.5, 6.2, Math.PI, 0);
  ctx.fill();
  ctx.restore();

  // 6. RINCORSA & TELEGRAPH DELL'AVVERSARIO (nel turno parata riflessi!)
  if (pen.turn === 'opponent') {
    const runFrac = Math.min(1, (pen.runupElapsed || 0) / Math.max(0.1, pen.runupDuration || 1.15));
    const hint = pen.telegraphHint;
    const leanDir = hint ? (hint.corner === 'left' ? -1 : hint.corner === 'right' ? 1 : 0) : 0;
    const leanAmt = hint ? hint.intensity : 0;

    const kx = spotX + leanDir * 14 * leanAmt;
    const ky = h * 0.99 - runFrac * (h * 0.13);
    const kScale = 1.25 - runFrac * 0.18;

    ctx.save();
    ctx.translate(kx, ky);
    ctx.scale(kScale, kScale);
    ctx.rotate(leanDir * 0.34 * leanAmt);

    // Sagoma tiratore rivale visto da dietro
    ctx.fillStyle = oppColors[0] || '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(-11, -18, 22, 20, 6);
    ctx.fill();
    ctx.fillStyle = oppColors[1] || '#facc15';
    ctx.fillRect(-4, -18, 8, 19);
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, -25, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bagliore direzionale + freccia di telegraph ben leggibile!
    if (hint && !pen.locked) {
      const glowX =
        hint.corner === 'left'
          ? spotX - 46
          : hint.corner === 'right'
            ? spotX + 46
            : spotX;
      const glowY = hint.corner === 'center' ? spotY - 40 : spotY - 14;
      const arrow = hint.corner === 'left' ? '⬅️ SINISTRA!' : hint.corner === 'right' ? 'DESTRA! ➡️' : '⬆️ CENTRO!';

      ctx.save();
      const pulse = 0.75 + Math.sin(t * 28) * 0.25;
      ctx.globalAlpha = Math.min(1, 0.45 + hint.intensity * 0.55) * pulse;
      ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(glowX - 42, glowY - 13, 84, 26, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = '900 10.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(arrow, glowX, glowY + 0.5);
      ctx.restore();
    }
  }

  // 7. PALLONE 3D SUL DISCHETTO O IN VOLO PARABOLICO VERSO LA PORTA!
  let bx = spotX;
  let by = spotY - 6;
  let br = 12.5;
  let bSpin = t * 1.4;

  if (anim && anim.active) {
    const destX = box.gx + anim.targetTx * box.gw;
    const destY = box.gy + anim.targetTy * box.gh;
    const flyU = Math.min(1, animU / 0.68);
    const arcLift = Math.sin(flyU * Math.PI) * (anim.targetZoneId === 'panenka' ? 44 : 24);

    if (animU <= 0.68) {
      bx = spotX + (destX - spotX) * flyU;
      by = spotY - 6 + (destY - (spotY - 6)) * flyU - arcLift;
      br = 12.5 - flyU * 6.2;
      bSpin = animU * 22;
    } else {
      const postU = (animU - 0.68) / 0.32;
      if (anim.saved || anim.outcomeType === 'post') {
        const defDir = anim.targetTx < 0.5 ? -1 : 1;
        bx = destX + defDir * postU * 48;
        by = destY + postU * 26 - Math.sin(postU * Math.PI) * 18;
        br = 6.3 + postU * 1.6;
        bSpin = 22 + postU * 14;
      } else if (anim.outcomeType === 'over') {
        bx = destX;
        by = destY - postU * 30;
        br = Math.max(4, 6.2 - postU * 2);
      } else {
        // Dentro la rete, cade morbido sull'erba
        bx = destX;
        by = Math.min(box.groundY - 4, destY + postU * (box.groundY - destY) * 0.55);
        br = 6.2;
      }
    }
  }

  // Ombra palla a terra
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(bx, Math.min(spotY + 4, by + br + 3), br * 0.85, br * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  draw3DPenaltyBall(ctx, bx, by, br, bSpin);
  drawRoofStructure(ctx, w, { style: leagueIndex >= 4 ? 'futuristic' : 'metal', lights: 4 });
}
