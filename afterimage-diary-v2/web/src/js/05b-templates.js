/* ───────────── шаблоны второй версии ─────────────
   Четыре композиции, которые действительно раскладывают несколько снимков по-разному:
   фотоплёнка, открытка из поездки, страница дневника, коллаж настроения.
   Раскладки первой версии остаются в движке без изменений, чтобы старые записи выглядели как раньше. */

/** Мозаика: один крупный кадр и до трёх поменьше рядом (или под ним, если область вытянута вверх). */
function mosaic(n, R, g, tall) {
  n = Math.min(n, 4);
  if (n <= 1) return [R];
  const out = [], k = n - 1, share = n === 2 ? 0.6 : 0.64;
  if (!tall) {
    const mw = R.w * share, sh = (R.h - g * (k - 1)) / k;
    out.push({ x: R.x, y: R.y, w: mw - g / 2, h: R.h });
    for (let i = 0; i < k; i++) out.push({ x: R.x + mw + g / 2, y: R.y + i * (sh + g), w: R.w - mw - g / 2, h: sh });
  } else {
    const mh = R.h * share, sw = (R.w - g * (k - 1)) / k;
    out.push({ x: R.x, y: R.y, w: R.w, h: mh - g / 2 });
    for (let i = 0; i < k; i++) out.push({ x: R.x + i * (sw + g), y: R.y + mh + g / 2, w: sw, h: R.h - mh - g / 2 });
  }
  return out;
}
function frameRect(ctx, S, i, q, t0) {
  const a = appear(S, t0, 0.9); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.beginPath(); ctx.rect(q.x, q.y, q.w, q.h); ctx.clip(); photoFill(ctx, S, i, q.x, q.y, q.w, q.h); ctx.restore();
  if (S.spec.photo.frame === 'thin') { ctx.strokeStyle = rgba(S.pal.ink, 0.7 * a); ctx.lineWidth = 1.5; ctx.strokeRect(q.x - 7, q.y - 7, q.w + 14, q.h + 14); }
}
/** Полоса 35-мм плёнки с кадрами. Едет, только если кадры не помещаются по ширине. */
function filmBand(ctx, S, R, film, from) {
  const idx = []; for (let i = from; i < S.photos.length; i++) idx.push(i);
  if (!idx.length) return;
  const fh = R.h * 0.68, fw = fh * 1.42, gap = fh * 0.08, pitch = fw + gap, fy = R.y + R.h * 0.16, a = appear(S, 0.5, 1);
  const moving = idx.length * pitch - gap > R.w - 8, off = moving ? S.tm * 18 * S.tempo : 0, ink = S.accentOn(film);
  ctx.save(); ctx.globalAlpha *= a; ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.fillStyle = film; ctx.fillRect(R.x, R.y, R.w, R.h);
  const step = pitch / 8, hw = step * 0.5, hh = R.h * 0.07, shift = ((off % step) + step) % step;
  ctx.fillStyle = S.pal.background;
  for (let x = R.x - shift; x < R.x + R.w + step; x += step) for (const y of [R.y + R.h * 0.035, R.y + R.h * (0.965 - 0.07)]) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x + (step - hw) / 2, y, hw, hh, 3); else ctx.rect(x + (step - hw) / 2, y, hw, hh); ctx.fill(); }
  const draw = (slot, x) => {
    const i = idx[((slot % idx.length) + idx.length) % idx.length];
    ctx.save(); ctx.beginPath(); ctx.rect(x, fy, fw, fh); ctx.clip(); photoFill(ctx, S, i, x, fy, fw, fh); ctx.restore();
    setFont(ctx, MONO, R.h * 0.05, 500, false, 0.1); ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic';
    let label = `${String(i + 1).padStart(2, '0')}A` + (S.photos[i].caption ? '  ' + S.photos[i].caption.toLocaleUpperCase() : '');
    while (label.length > 4 && ctx.measureText(label).width > fw) label = label.slice(0, -2).trimEnd() + '…';
    ctx.fillText(label, x + 2, R.y + R.h * 0.955);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  };
  if (moving) { const first = Math.floor(off / pitch); for (let k = -1; k < Math.ceil(R.w / pitch) + 1; k++) draw(k + first, R.x + k * pitch - (off % pitch)); }
  else { const x0 = R.x + (R.w - (idx.length * pitch - gap)) / 2; idx.forEach((_, j) => draw(j, x0 + j * pitch)); }
  ctx.restore();
}

LAYOUT.film = function (ctx, S) {
  const { W, H, pal, m, land } = S, n = S.photos.length, al = S.spec.composition.align, pad = m * 0.6;
  ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
  const film = lum(pal.background) < 0.1 ? mix(pal.background, pal.ink, 0.17) : '#0C0C0E', cap0 = S.photos[0].caption;
  const cov = land ? { x: pad, y: pad, w: W * 0.57, h: H - pad * 2 - 34 } : { x: pad, y: pad, w: W - pad * 2, h: H * (n > 1 ? (H === W ? 0.42 : 0.46) : 0.6) };
  frameRect(ctx, S, 0, cov, 0.2);
  if (cap0) mono(ctx, S, cap0, cov.x, cov.y + cov.h + 22, { size: 13, color: S.colophon, align: 'right', w: cov.w, t0: 0.9, maxW: cov.w });
  const tx = land ? cov.x + cov.w + m * 0.6 : m, tw = land ? W - tx - m * 0.7 : W - 2 * m;
  const strip = n < 2 ? null : land ? { x: cov.x + cov.w + pad * 0.5, y: H - pad - 34 - H * 0.25, w: W - cov.x - cov.w - pad * 0.5, h: H * 0.25 } : { x: 0, y: cov.y + cov.h + (cap0 ? 36 : 22), w: W, h: H * 0.165 };
  if (strip) filmBand(ctx, S, strip, film, 1);
  const y0 = land ? pad + 6 : (strip ? strip.y + strip.h : cov.y + cov.h + (cap0 ? 30 : 0)) + m * 0.5;
  const avail = land ? (strip ? strip.y : H - pad - 34) - y0 - m * 0.4 : H - m * 0.95 - y0;
  const cw = Math.min(tw, W * 0.7), { T, C } = stack(S, ctx, tw, land ? W * 0.05 : W * 0.092, 3, cw, land ? W * 0.019 : W * 0.026, 3, avail, 52);
  const ax = (w) => (land || al === 'left' ? tx : al === 'center' ? tx + (tw - w) / 2 : tx + tw - w), talign = land ? 'left' : al;
  mono(ctx, S, metaLine(S), tx, y0 + 14, { color: S.accentOn(pal.background), align: talign, w: tw, t0: 0.7, maxW: tw });
  paint(ctx, S, T, tx, y0 + 32, { color: pal.ink, align: talign, w: tw, t0: 0.8 });
  if (C) paint(ctx, S, C, ax(cw), y0 + 32 + T.h + 18, { color: mix(pal.ink, pal.background, 0.22), align: talign, w: cw, t0: 1.2 });
};

LAYOUT.trip = function (ctx, S) {
  const { W, H, pal, m, land } = S, n = S.photos.length;
  ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgba(pal.accent2, 0.14); ctx.fillRect(0, H * 0.56, W, H * 0.44);
  const cw = W - m * 1.5, ch = H - m * 2.3, p = cw * 0.034, a = appear(S, 0.15, 1.1);
  const card = contrast(pal.surface, pal.background) < 1.1 ? mix(pal.surface, lum(pal.background) > 0.5 ? '#FFFFFF' : pal.ink, 0.12) : pal.surface;
  const on = ensureContrast(pal.ink, card, 5), soft = mix(on, card, 0.45);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2 - m * 0.2 + (1 - a) * 40); ctx.rotate(-(0.4 + S.spec.composition.tilt * 2) * Math.PI / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20; ctx.fillStyle = card; ctx.fillRect(-cw / 2, -ch / 2, cw, ch); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // кайма авиапочты по краю открытки
  ctx.save(); ctx.beginPath(); ctx.rect(-cw / 2, -ch / 2, cw, ch); ctx.rect(-cw / 2 + p * 0.42, -ch / 2 + p * 0.42, cw - p * 0.84, ch - p * 0.84); ctx.clip('evenodd');
  for (let k = -ch; k < cw + ch; k += 44) { ctx.fillStyle = (Math.round(k / 44) % 2) ? pal.accent : pal.accent2; ctx.beginPath(); ctx.moveTo(-cw / 2 + k, -ch / 2); ctx.lineTo(-cw / 2 + k + 22, -ch / 2); ctx.lineTo(-cw / 2 + k + 22 - ch, ch / 2); ctx.lineTo(-cw / 2 + k - ch, ch / 2); ctx.fill(); }
  ctx.restore();
  const PZ = land ? { x: -cw / 2 + p, y: -ch / 2 + p, w: cw * 0.54 - p, h: ch - 2 * p } : { x: -cw / 2 + p, y: -ch / 2 + p, w: cw - 2 * p, h: ch * 0.54 };
  mosaic(n, PZ, p * 0.4, land).forEach((q, i) => { ctx.save(); ctx.beginPath(); ctx.rect(q.x, q.y, q.w, q.h); ctx.clip(); photoFill(ctx, S, i, q.x, q.y, q.w, q.h); ctx.restore(); });
  const B = land ? { x: PZ.x + PZ.w + p * 1.2, y: -ch / 2 + p * 1.4, w: cw - PZ.w - p * 3.8, h: ch - p * 2.8 } : { x: -cw / 2 + p * 1.4, y: PZ.y + PZ.h + p * 1.1, w: cw - p * 2.8, h: ch - PZ.h - p * 3.3 };
  const leftW = B.w * 0.56, rx = B.x + B.w * 0.63, rw = B.w * 0.37;
  ctx.strokeStyle = rgba(soft, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(B.x + B.w * 0.6, B.y + 4); ctx.lineTo(B.x + B.w * 0.6, B.y + B.h); ctx.stroke();
  const T = titleBlock(S, ctx, leftW, cw * (land ? 0.046 : 0.074), 3, 0, B.h * 0.5);
  paint(ctx, S, T, B.x, B.y, { color: on, t0: 0.8 });
  const lh = Math.max(34, B.h * 0.105), cs = Math.min(lh * 0.6, cw * 0.029), ly0 = B.y + T.h + lh * 0.9;
  const C = S.spec.caption ? block(S, ctx, S.spec.caption, { font: S.spec.typography.body, size: cs, w: leftW, maxLines: Math.max(1, Math.floor((B.y + B.h - ly0) / lh) + 1), weight: 400, lh: lh / cs }) : null;
  for (let ly = ly0 + lh * 0.2; ly <= B.y + B.h + 2; ly += lh) { ctx.strokeStyle = rgba(soft, 0.4); ctx.beginPath(); ctx.moveTo(B.x, ly); ctx.lineTo(B.x + leftW, ly); ctx.stroke(); }
  if (C) paint(ctx, S, C, B.x, ly0 + lh * 0.2 - cs * 0.82 - 7 - (C.lh - lh), { color: mix(on, card, 0.12), t0: 1.2 });
  const sw = Math.min(rw * 0.44, B.h * 0.4), sh = sw * 1.22, sx = B.x + B.w - sw, sy = B.y;
  ctx.fillStyle = pal.accent; ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = card; ctx.lineWidth = 5; ctx.setLineDash([1, 9]); ctx.lineCap = 'round'; ctx.strokeRect(sx, sy, sw, sh); ctx.setLineDash([]); ctx.lineCap = 'butt';
  const stampInk = contrast(card, pal.accent) > contrast(pal.ink, pal.accent) ? card : pal.ink;
  if (!drawEmblem(ctx, S, sx + sw / 2, sy + sh * 0.46, sw * 0.66, stampInk, 2.6)) { ctx.strokeStyle = stampInk; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx + sw / 2, sy + sh * 0.46, sw * 0.24, 0, 6.3); ctx.stroke(); }
  setFont(ctx, MONO, sw * 0.085, 500, false, 0.1); ctx.fillStyle = stampInk; ctx.textAlign = 'center'; ctx.fillText('AFTERIMAGE', sx + sw / 2, sy + sh * 0.93); ctx.textAlign = 'left';
  const pr = sw * 0.52, pa = appear(S, 1.5, 0.3);
  ctx.save(); ctx.globalAlpha *= 0.62 * pa; ctx.translate(sx - pr * 0.45, sy + sh * 0.55); ctx.rotate(-0.2); ctx.strokeStyle = on; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, pr * 0.7, 0, 6.3); ctx.lineWidth = 1.2; ctx.stroke();
  setFont(ctx, MONO, pr * 0.22, 500, false, 0.06); ctx.fillStyle = on; ctx.textAlign = 'center'; ctx.fillText(dotDate(S.meta.date), 0, pr * 0.08); ctx.textAlign = 'left';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); for (let u = 0; u <= 1.001; u += 0.05) { const wx = pr + u * sw * 1.15, wy = -pr * 0.45 + i * pr * 0.3 + Math.sin(u * 12.5) * 4; u ? ctx.lineTo(wx, wy) : ctx.moveTo(wx, wy); } ctx.lineWidth = 1.6; ctx.stroke(); }
  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  // детали поездки: место, дата, погода, музыка
  const rows = [['Место', S.meta.location], ['Дата', fmtDate(S.meta.date, { day: 'numeric', month: 'long', year: 'numeric' })], ['Погода', S.meta.weather], ['♪', S.song]].filter((r) => r[1]);
  const base = Math.max(sy + sh + lh * 1.15, B.y + B.h - (rows.length - 1) * lh);
  rows.forEach(([label, value], i) => {
    const ly = base + i * lh; if (ly > B.y + B.h + 4) return;
    ctx.strokeStyle = rgba(soft, 0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(rx, ly); ctx.lineTo(B.x + B.w, ly); ctx.stroke();
    mono(ctx, S, label === '♪' ? '♪ ' + value : `${label}: ${value}`, rx, ly - 9, { size: Math.min(15, lh * 0.36), color: on, t0: 1.3 + i * 0.1, maxW: rw });
  });
  ctx.restore();
};

LAYOUT.page = function (ctx, S) {
  const { W, H, pal, m, land } = S, n = S.photos.length, top = m * 0.78, accent = S.accentOn(pal.background);
  ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
  mono(ctx, S, 'Afterimage', m, top + 12, { size: 15, color: pal.ink, t0: 0.1, weight: 500 });
  mono(ctx, S, fmtDate(S.meta.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), m, top + 12, { size: 15, color: pal.ink, align: 'center', w: W - 2 * m, t0: 0.1 });
  mono(ctx, S, '№ ' + pad4(S.meta.no), m, top + 12, { size: 15, color: pal.ink, align: 'right', w: W - 2 * m, t0: 0.1 });
  ctx.fillStyle = rgba(pal.ink, 0.85 * appear(S, 0.1)); ctx.fillRect(m, top + 28, (W - 2 * m) * appear(S, 0.1, 1.2), 1.5);
  let y = top + 52;
  const T = titleBlock(S, ctx, W - 2 * m, land ? W * 0.058 : W * 0.104, land ? 2 : 3, 0, H * (land ? 0.17 : 0.2));
  paint(ctx, S, T, m, y, { color: pal.ink, t0: 0.4 }); y += T.h + 20;
  ctx.fillStyle = accent; ctx.globalAlpha = appear(S, 0.8); ctx.fillRect(m, y, 64, 5); ctx.globalAlpha = 1; y += 30;
  // факты дня: только то, что указал человек
  const facts = [['Место', S.meta.location], ['Погода', S.meta.weather], ['Музыка', S.song], ['Настроение', S.spec.emotion.dominant.slice(0, 3).map((e) => e.name).join(', ')], ['Метки', S.meta.tags.map((t) => '#' + t).join(' ')]].filter((f) => f[1]).slice(0, land ? 3 : 4);
  const rowH = land ? 46 : 54, noteW = (W - 2 * m) * 0.54, factX = m + (W - 2 * m) * 0.6, factW = (W - 2 * m) * 0.4;
  const note = S.spec.caption ? bodyBlock(S, ctx, S.spec.caption, noteW, land ? W * 0.019 : W * 0.027, 4) : null;
  const bottomH = Math.max(note ? note.h : 0, facts.length * rowH) + 6;
  const R = { x: m, y, w: W - 2 * m, h: H - m * 1.05 - bottomH - m * 0.5 - y }, g = W * 0.011, caps = S.photos.slice(0, 4).some((p) => p.caption);
  if (caps) R.h -= 26;
  mosaic(n, R, g, false).forEach((q, i) => {
    frameRect(ctx, S, i, q, 0.5 + i * 0.15);
    if (S.photos[i].caption) mono(ctx, S, `${i + 1}. ${S.photos[i].caption}`, q.x, q.y + q.h + 20, { size: 12.5, color: S.colophon, t0: 1 + i * 0.1, maxW: q.w });
  });
  const by = R.y + R.h + (caps ? 26 : 0) + m * 0.5;
  if (note) paint(ctx, S, note, m, by, { color: mix(pal.ink, pal.background, 0.14), t0: 1.2 });
  facts.forEach(([label, value], i) => {
    const fy = by + i * rowH, a = appear(S, 1.3 + i * 0.1);
    ctx.fillStyle = rgba(pal.ink, 0.35 * a); ctx.fillRect(factX, fy, factW, 1);
    mono(ctx, S, label, factX, fy + 20, { size: 12.5, color: accent, t0: 1.3 + i * 0.1 });
    const v = block(S, ctx, value, { font: S.spec.typography.body, size: land ? 19 : 22, min: 15, w: factW - 122, maxLines: 1, weight: 400, lh: 1.2 });
    paint(ctx, S, v, factX + 122, fy + 6, { color: pal.ink, t0: 1.3 + i * 0.1 });
  });
};

const COLLAGE_SLOTS = {
  1: [[0.06, 0.05, 0.88, 0.88, -1.5]],
  2: [[0.02, 0.04, 0.6, 0.68, -2], [0.5, 0.38, 0.48, 0.58, 2.5]],
  3: [[0.02, 0.03, 0.58, 0.6, -2], [0.57, 0.1, 0.41, 0.42, 2], [0.3, 0.53, 0.5, 0.45, -1]],
  4: [[0.02, 0.03, 0.54, 0.5, -2], [0.58, 0.02, 0.4, 0.36, 2], [0.5, 0.4, 0.48, 0.34, -1.5], [0.06, 0.56, 0.42, 0.42, 1.5]],
  5: [[0.02, 0.03, 0.5, 0.46, -2], [0.55, 0.02, 0.43, 0.33, 2], [0.6, 0.37, 0.38, 0.3, -1.5], [0.04, 0.52, 0.4, 0.45, 1.5], [0.43, 0.62, 0.36, 0.36, -2.5]],
};
LAYOUT.collage = function (ctx, S) {
  const { W, H, pal, m, land } = S, n = Math.min(5, S.photos.length), tilt = S.spec.composition.tilt, accent = S.accentOn(pal.background);
  ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
  const R = land ? { x: m * 0.5, y: m * 0.5, w: W * 0.6, h: H - m * 1.5 } : { x: m * 0.5, y: m * 0.5, w: W - m, h: H * (H === W ? 0.58 : 0.61) };
  ctx.fillStyle = rgba(pal.accent2, 0.16); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(R.x + R.w * 0.32, R.y + R.h * 0.2, R.w * 0.66, R.h * 0.72, 28); else ctx.rect(R.x + R.w * 0.32, R.y + R.h * 0.2, R.w * 0.66, R.h * 0.72); ctx.fill();
  ctx.fillStyle = rgba(pal.accent, 0.2); ctx.beginPath(); ctx.arc(R.x + R.w * 0.2, R.y + R.h * 0.82, R.w * 0.2, 0, 6.3); ctx.fill();
  const slots = COLLAGE_SLOTS[n];
  for (let k = n - 1; k >= 0; k--) {
    const [fx, fy, fw, fh, fr] = slots[k], a = appear(S, 0.2 + (n - 1 - k) * 0.22, 0.9); if (a <= 0) continue;
    const w = fw * R.w, hgt = fh * R.h, cx = R.x + fx * R.w + w / 2, cy = R.y + fy * R.h + hgt / 2 - (1 - a) * 30;
    ctx.save(); ctx.globalAlpha = a;
    printBox(ctx, S, k, cx, cy, w, hgt, fr * (0.25 + tilt * 1.5) * Math.PI / 180, {});
    ctx.restore();
  }
  // палитра дня и слова настроения
  const tx = land ? R.x + R.w + m * 0.5 : m, tw = land ? W - tx - m : W - 2 * m, cs = land ? 40 : 46;
  let y = land ? m * 0.9 : R.y + R.h + m * 0.42;
  PALETTE_KEYS.forEach((k, i) => {
    const a = easeOut((S.ti - 0.9 - i * 0.07) / 0.5); if (a <= 0) return;
    ctx.globalAlpha = a; ctx.fillStyle = pal[k]; ctx.beginPath(); ctx.arc(tx + cs / 2 + i * (cs * 0.78), y + cs / 2, cs / 2 * a, 0, 6.3); ctx.fill();
    ctx.strokeStyle = rgba(pal.ink, 0.45); ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
  });
  const moods = S.spec.emotion.dominant.slice(0, 3).map((e) => e.name).join('  ·  ');
  if (moods && !land) mono(ctx, S, moods, tx, y + cs / 2 + 5, { size: 14, color: accent, align: 'right', w: tw, t0: 1.1, maxW: tw - cs * 5.4 });
  y += cs + (land ? 26 : 22);
  if (moods && land) { mono(ctx, S, moods, tx, y + 4, { size: 13, color: accent, t0: 1.1, maxW: tw }); y += 30; }
  const avail = H - m * 0.95 - y, ew = S.emblem && !land ? W * 0.13 : 0;
  const { T, C } = stack(S, ctx, tw - ew, land ? W * 0.05 : W * 0.086, 3, Math.min(tw - ew, W * 0.66), land ? W * 0.019 : W * 0.026, 3, avail, 46);
  mono(ctx, S, metaLine(S), tx, y + 12, { size: 14, color: S.colophon, t0: 1.0, maxW: tw - ew });
  paint(ctx, S, T, tx, y + 28, { color: pal.ink, t0: 1.1 });
  if (C) paint(ctx, S, C, tx, y + 28 + T.h + 16, { color: mix(pal.ink, pal.background, 0.22), t0: 1.4 });
  if (S.emblem) {
    const r0 = (land ? H : W) * 0.052, ex = land ? W - m - r0 : W - m - r0, ey = land ? H - m * 1.5 - r0 : y + 28 + r0 + 6, a = appear(S, 1.6);
    ctx.save(); ctx.globalAlpha = a * 0.9; ctx.translate(ex, ey); ctx.rotate(-0.14);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r0, 0, 6.3); ctx.stroke();
    drawEmblem(ctx, S, 0, 0, r0 * 1.15, accent, 2.4); ctx.restore();
  }
};
