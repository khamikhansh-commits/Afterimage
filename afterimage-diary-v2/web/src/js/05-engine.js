/* ───────────── composition engine ─────────────
   Draws a memory on a canvas from its design specification: treated photographs, type,
   texture and an animated motif, in one of seven layouts. Everything is drawn in logical
   units (W×H) and scaled to the canvas, so the same code makes the live artwork, the
   archive thumbnail and the exported image. */
const DIMS = { portrait: [1200, 1500], square: [1200, 1200], landscape: [1500, 1000] };
const TEMPO = { slow: 0.6, medium: 1, fast: 1.7 };
const treated = new WeakMap(); // обработанные копии снимков: одно и то же оформление не пересчитывается заново
const tempLabel = (t) => (typeof t === 'number' && isFinite(t) ? `${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(Math.round(t))} °C` : '');
/** Визуальная температура: сдвигает только цветовой тон палитры, читаемость текста сохраняется. */
function tonePalette(pal, tone) {
  if (!tone) return pal;
  const target = tone > 0 ? '#F0A23E' : '#4C8EDB', a = Math.abs(tone), out = { ...pal };
  for (const k of ['background', 'surface', 'muted']) out[k] = mix(pal[k], target, a * 0.17);
  for (const k of ['accent', 'accent2']) out[k] = mix(pal[k], target, a * 0.12);
  out.ink = ensureContrast(mix(pal.ink, target, a * 0.06), out.background, 5);
  return out;
}
const MONO = 'plexmono';

/* ── photographic treatment: real per-pixel processing, kept photographic so subjects stay recognisable ── */
function treatPhoto(src, ph, pal, maxEdge = 1400) {
  const c = drawScaled(src, maxEdge), x = c.getContext('2d', { willReadFrequently: true });
  let im;
  try { im = x.getImageData(0, 0, c.width, c.height); } catch { return c; }
  const d = im.data, tint = (parseHex(ph.tint) || [128, 128, 128]).map((v) => v / 255);
  const darkTone = lum(pal.ink) < lum(pal.background) ? pal.ink : pal.background, lightTone = darkTone === pal.ink ? pal.background : pal.ink;
  const lo = parseHex(mix(darkTone, '#000000', 0.35)).map((v) => v / 255), hi = parseHex(mix(lightTone, '#FFFFFF', 0.25)).map((v) => v / 255);
  const mid = parseHex(mix(pal.accent, mix(darkTone, lightTone, 0.5), 0.45)).map((v) => v / 255);
  const { saturation: sat, contrast: con, brightness: bri, warmth: warm, fade, tintStrength: ts, duotone: duo } = ph;
  const lift = fade * 0.5;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    r = (r - 0.5) * con + 0.5 + bri; g = (g - 0.5) * con + 0.5 + bri; b = (b - 0.5) * con + 0.5 + bri;
    r += warm * 0.06; g += warm * 0.012; b -= warm * 0.07;
    let l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    if (lift) { r = r * (1 - lift) + lift * (0.42 + tint[0] * 0.3); g = g * (1 - lift) + lift * (0.42 + tint[1] * 0.3); b = b * (1 - lift) + lift * (0.42 + tint[2] * 0.3); }
    if (ts) { const k = 0.3 + 0.95 * l, a = ts * 1.3; r += (tint[0] * k - r) * a; g += (tint[1] * k - g) * a; b += (tint[2] * k - b) * a; }
    if (duo) {
      l = clamp(0.299 * r + 0.587 * g + 0.114 * b, 0, 1);
      const u = l < 0.5 ? l * 2 : (l - 0.5) * 2, A = l < 0.5 ? lo : mid, B = l < 0.5 ? mid : hi;
      r += (A[0] + (B[0] - A[0]) * u - r) * duo; g += (A[1] + (B[1] - A[1]) * u - g) * duo; b += (A[2] + (B[2] - A[2]) * u - b) * duo;
    }
    d[i] = r < 0 ? 0 : r > 1 ? 255 : r * 255; d[i + 1] = g < 0 ? 0 : g > 1 ? 255 : g * 255; d[i + 2] = b < 0 ? 0 : b > 1 ? 255 : b * 255;
  }
  x.putImageData(im, 0, 0);
  return c;
}
function blurCopy(c) {
  const a = drawScaled(c, 96), b = makeCanvas(a.width * 2, a.height * 2), x = b.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(a, 0, 0, b.width, b.height);
  return b;
}

/* ── texture tiles ── */
function noiseTile(size, seed, lowFreq) {
  const c = makeCanvas(size, size), x = c.getContext('2d'), im = x.createImageData(size, size), r = rng(seed);
  for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() - 0.5) * 150; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  if (lowFreq) { // paper: soft blotches and a few fibres
    const s = drawScaled(c, 40); x.globalAlpha = 0.75; x.imageSmoothingQuality = 'high'; x.drawImage(s, 0, 0, size, size); x.globalAlpha = 1;
    x.strokeStyle = 'rgba(96,96,96,0.5)'; x.lineWidth = 0.7;
    for (let i = 0; i < 70; i++) { const px = r() * size, py = r() * size, a = r() * 6.28, l = 6 + r() * 18; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, py + Math.sin(a) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  }
  return c;
}
function linenTile() {
  const c = makeCanvas(8, 8), x = c.getContext('2d');
  x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, 8, 8);
  x.fillStyle = 'rgb(168,168,168)'; x.fillRect(0, 0, 8, 1); x.fillRect(0, 4, 8, 1);
  x.fillStyle = 'rgb(92,92,92)'; x.fillRect(0, 0, 1, 8); x.fillRect(4, 0, 1, 8);
  return c;
}

/* ── scene ── */
async function buildScene({ spec, canvases, meta, maxEdge = 1400 }) {
  await Promise.all([loadFont(spec.typography.display), loadFont(spec.typography.body), loadFont(MONO)]);
  const [W, H] = DIMS[spec.composition.format] || DIMS.portrait;
  const tone = clamp(num(spec.tone, 0), -1, 1), pal = tonePalette(spec.palette, tone), seed = hashStr((meta.id || 'x') + spec.title + spec.composition.layout);
  const ph = tone ? { ...spec.photo, warmth: clamp(spec.photo.warmth + tone * 0.7, -1, 1) } : spec.photo, tkey = JSON.stringify([ph, PALETTE_KEYS.map((k) => pal[k]), maxEdge]);
  const photos = [];
  for (let i = 0; i < Math.min(6, canvases.length); i++) {
    const c = canvases[i], mp = (meta.photos && meta.photos[i]) || {};
    let per = treated.get(c); if (!per) { per = new Map(); treated.set(c, per); }
    let t = per.get(tkey);
    if (!t) { const tc = treatPhoto(c, ph, pal, maxEdge); t = { c: tc, soft: blurCopy(tc) }; if (per.size > 5) per.delete(per.keys().next().value); per.set(tkey, t); await sleep(0); }
    const fixed = mp.fx != null || mp.fy != null || (mp.zoom && mp.zoom !== 1);
    photos.push({ c: t.c, soft: t.soft, w: t.c.width, h: t.c.height, fx: clamp(num(mp.fx, 0.5), 0, 1), fy: clamp(num(mp.fy, 0.5), 0, 1), zoom: clamp(num(mp.zoom, 1), 1, 3), fixed, caption: str(mp.caption, 90) });
  }
  const r = rng(seed), parts = [];
  for (let i = 0; i < 160; i++) parts.push({ x: r(), y: r(), s: r(), s2: r(), r: r(), ph: r() * 6.283 });
  const ty = spec.typography;
  const title = ty.case === 'upper' ? spec.title.toLocaleUpperCase() : ty.case === 'lower' ? spec.title.toLocaleLowerCase() : spec.title;
  const song = songText(meta.song);
  return {
    spec, pal, W, H, m: Math.round(W * 0.065), land: W > H * 1.2, seed, photos, parts, title, song,
    meta: { no: meta.no || 0, date: meta.date, location: meta.location || '', weather: [meta.weather, tempLabel(meta.tempC)].filter(Boolean).join(', '), tags: (meta.tags || []).slice(0, 4) },
    tempo: TEMPO[spec.motion.tempo] || 1, cache: new Map(), tiles: {}, pulse: 0, tm: 0, ti: 99,
    emblem: spec.emblem ? spec.emblem.paths.map((p) => new Path2D(p)) : null,
    accentOn: (bg) => (contrast(pal.accent, bg) >= 2.6 ? pal.accent : pal.ink),
    soften: (c, t) => mix(c, pal.background, t),
    colophon: mix(pal.ink, pal.background, 0.42),
  };
}

/* ── type ── */
function setFont(ctx, key, size, weight, italic, track) {
  ctx.font = fontCss(key, size, weight, italic);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (track ? track * size : 0).toFixed(2) + 'px';
}
function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (ctx.measureText(word).width > maxW && word.length > 1) { // a single word wider than the column
        if (line) { out.push(line); line = ''; }
        let cut = word.length - 1;
        while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxW) cut--;
        out.push(word.slice(0, cut)); word = word.slice(cut);
      }
      const next = line ? line + ' ' + word : word;
      if (!line || ctx.measureText(next).width <= maxW) line = next; else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}
/** Fit text into a column: shrink until it fits the allowed lines, then ellipsise. Cached per scene. */
function block(S, ctx, text, o) {
  const key = [text, o.font, Math.round(o.size), Math.round(o.w), o.maxLines, o.weight, o.italic, o.track, o.lh, Math.round(o.maxH || 0)].join('|');
  let b = S.cache.get(key);
  if (b) return b;
  let size = o.size, lines;
  const min = o.min || o.size * 0.5;
  const wordsIn = String(text).split(/\s+/).filter(Boolean);
  for (;;) {
    setFont(ctx, o.font, size, o.weight, o.italic, o.track);
    lines = wrapText(ctx, text, o.w);
    const widest = wordsIn.reduce((mx, w) => Math.max(mx, ctx.measureText(w).width), 0);
    if (size <= min || (lines.length <= o.maxLines && widest <= o.w && (!o.maxH || lines.length * (o.lh || 1.1) * size <= o.maxH))) break;
    size *= 0.94;
  }
  if (lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    let last = lines[o.maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > o.w) last = last.slice(0, -1);
    lines[o.maxLines - 1] = last.replace(/[\s,.;:—-]+$/, '') + '…';
  }
  const lh = (o.lh || 1.1) * size;
  b = { lines, size, lh, h: lines.length * lh, font: o.font, weight: o.weight, italic: o.italic, track: o.track, w: lines.reduce((mx, l) => Math.max(mx, ctx.measureText(l).width), 0) };
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  S.cache.set(key, b);
  return b;
}
function paint(ctx, S, b, x, y, { color, align = 'left', w = b.w, alpha = 1, t0 = 0 } = {}) {
  setFont(ctx, b.font, b.size, b.weight, b.italic, b.track);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = align; ctx.fillStyle = color;
  const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  b.lines.forEach((ln, i) => {
    const a = easeOut((S.ti - t0 - i * 0.14) / 0.9);
    if (a <= 0) return;
    ctx.globalAlpha = alpha * a;
    ctx.fillText(ln, ax, y + i * b.lh + b.size * 0.82 + (1 - a) * b.size * 0.2);
  });
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
const titleBlock = (S, ctx, w, size, maxLines, lh, maxH) => { const ty = S.spec.typography; return block(S, ctx, S.title, { font: ty.display, size: size * ty.scale, min: size * 0.4, w, maxLines, maxH, weight: ty.weight, italic: ty.italic, track: ty.tracking, lh: lh || (ty.case === 'upper' ? 1.02 : 1.08) }); };
/** Title and caption sized together so they fit the height a layout has left (`fixed` = gaps and labels between them). */
function stack(S, ctx, tw, size, maxLines, cw, csize, clines, avail, fixed) {
  let C = S.spec.caption ? bodyBlock(S, ctx, S.spec.caption, cw, csize, clines) : null;
  let T = titleBlock(S, ctx, tw, size, maxLines, 0, Math.max(size * 0.45, avail - fixed - (C ? C.h : 0)));
  if (C && fixed + T.h + C.h > avail) { C = null; T = titleBlock(S, ctx, tw, size, maxLines, 0, Math.max(size * 0.45, avail - fixed)); }
  return { T, C };
}
const bodyBlock = (S, ctx, text, w, size, maxLines) => block(S, ctx, text, { font: S.spec.typography.body, size, min: size * 0.8, w, maxLines, weight: 400, italic: false, track: 0, lh: 1.42 });
function mono(ctx, S, text, x, y, { size = 16, color, align = 'left', w = 0, alpha = 1, t0 = 0, weight = 400, maxW = 0 } = {}) {
  let s = String(text).toLocaleUpperCase();
  setFont(ctx, MONO, size, weight, false, 0.12);
  if (maxW) while (s.length > 2 && ctx.measureText(s).width > maxW) s = s.slice(0, -2).trimEnd() + '…';
  const a = easeOut((S.ti - t0) / 0.8);
  ctx.globalAlpha = alpha * a; ctx.fillStyle = color || S.colophon; ctx.textBaseline = 'alphabetic'; ctx.textAlign = align;
  ctx.fillText(s, align === 'center' ? x + w / 2 : align === 'right' ? x + w : x, y);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
const metaLine = (S) => [fmtDate(S.meta.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }), S.meta.location, S.meta.weather].filter(Boolean).join('  ·  ');

/* ── photographs ── */
function coverDraw(ctx, img, x, y, w, hgt, zoom = 1, fx = 0.5, fy = 0.5) {
  const ir = img.width / img.height, r = w / hgt;
  let sw, sh;
  if (ir > r) { sh = img.height; sw = sh * r; } else { sw = img.width; sh = sw / r; }
  sw /= zoom; sh /= zoom;
  ctx.drawImage(img, (img.width - sw) * fx, (img.height - sh) * fy, sw, sh, x, y, w, hgt);
}
function photoFill(ctx, S, i, x, y, w, hgt) {
  const P = S.photos[i % S.photos.length], k = S.spec.motion.kenBurns, a = S.tm * 0.05 * S.tempo + i * 1.7;
  const amp = P.fixed ? 0.2 : 1, zoom = P.zoom * (1.03 + k * 0.14 * (0.5 + 0.5 * Math.sin(a)) + S.pulse * 0.012), fx = clamp(P.fx + k * 0.3 * amp * Math.sin(a * 0.7 + 1), 0, 1), fy = clamp(P.fy + k * 0.25 * amp * Math.cos(a * 0.6 + 2), 0, 1);
  coverDraw(ctx, P.c, x, y, w, hgt, zoom, fx, fy);
  const soft = S.spec.photo.softness;
  if (soft > 0.03) { ctx.save(); ctx.globalAlpha *= soft * 0.42; ctx.globalCompositeOperation = 'screen'; coverDraw(ctx, P.soft, x, y, w, hgt, zoom, fx, fy); ctx.restore(); }
  const v = S.spec.photo.vignette;
  if (v > 0.03) {
    const g = ctx.createRadialGradient(x + w / 2, y + hgt / 2, Math.min(w, hgt) * 0.3, x + w / 2, y + hgt / 2, Math.hypot(w, hgt) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${(v * 0.6).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, hgt);
  }
}
/** The lead photograph; with several photographs it moves through them using the chosen transition. */
function heroFill(ctx, S, x, y, w, hgt, offset = 0) {
  const n = S.photos.length;
  if (n === 1) return photoFill(ctx, S, 0, x, y, w, hgt);
  const period = 6.5 / S.tempo, tr = S.spec.motion.transition, dur = tr === 'cut' ? 0 : Math.min(1.5, period * 0.28);
  const tt = Math.max(0, S.tm - 1.5), k = Math.floor(tt / period), f = tt - k * period;
  const a = (k + offset) % n, b = (k + 1 + offset) % n, into = dur && f > period - dur ? (f - (period - dur)) / dur : 0;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hgt); ctx.clip();
  if (tr === 'flicker' && into > 0) photoFill(ctx, S, Math.floor(into * 9) % 2 ? b : a, x, y, w, hgt);
  else {
    photoFill(ctx, S, a, x, y, w, hgt);
    if (into > 0 && tr === 'slide') { const e = ease(into); ctx.beginPath(); ctx.rect(x + w * (1 - e), y, w * e, hgt); ctx.clip(); photoFill(ctx, S, b, x, y, w, hgt); }
    else if (into > 0) { ctx.globalAlpha *= ease(into); photoFill(ctx, S, b, x, y, w, hgt); }
  }
  ctx.restore();
}
/** A print: optional border, shadow, rotation. */
function printBox(ctx, S, i, cx, cy, w, hgt, rot, { hero = false, frame, shadow = true, bottom = 0 } = {}) {
  const fr = frame || S.spec.photo.frame, pal = S.pal;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  if (fr === 'white') {
    const p = w * 0.045, paper = contrast(pal.surface, pal.background) < 1.12 ? mix(pal.surface, lum(pal.background) > 0.5 ? '#FFFFFF' : '#E9E6DF', 0.6) : pal.surface;
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14; }
    ctx.fillStyle = paper; ctx.fillRect(-w / 2 - p, -hgt / 2 - p, w + 2 * p, hgt + 2 * p + bottom);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  } else if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; ctx.fillStyle = pal.ink; ctx.fillRect(-w / 2, -hgt / 2, w, hgt); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -hgt / 2, w, hgt); ctx.clip();
  if (hero) heroFill(ctx, S, -w / 2, -hgt / 2, w, hgt); else photoFill(ctx, S, i, -w / 2, -hgt / 2, w, hgt);
  ctx.restore();
  if (fr === 'thin') { ctx.strokeStyle = rgba(pal.ink, 0.7); ctx.lineWidth = 1.5; ctx.strokeRect(-w / 2 - 10, -hgt / 2 - 10, w + 20, hgt + 20); }
  ctx.restore();
}
function drawEmblem(ctx, S, cx, cy, size, color, lw = 2.2) {
  if (!S.emblem) return false;
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 100, size / 100);
  ctx.lineWidth = lw * 100 / size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  for (const p of S.emblem) ctx.stroke(p);
  ctx.restore();
  return true;
}
const appear = (S, t0, d = 0.8) => easeOut((S.ti - t0) / d);

/* ───────────── layouts ───────────── */
const LAYOUT = {
  poster(ctx, S) {
    const { W, H, pal, m, land } = S, bottom = S.spec.composition.titlePlacement !== 'top', al = S.spec.composition.align;
    heroFill(ctx, S, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, bottom ? H * 0.34 : H * 0.66, 0, bottom ? H : 0);
    g.addColorStop(0, rgba(pal.background, 0)); g.addColorStop(0.5, rgba(pal.background, 0.74)); g.addColorStop(1, rgba(pal.background, 0.95));
    ctx.fillStyle = g; ctx.fillRect(0, bottom ? H * 0.34 : 0, W, H * 0.66);
    if (!bottom) { const g2 = ctx.createLinearGradient(0, H * 0.86, 0, H); g2.addColorStop(0, rgba(pal.background, 0)); g2.addColorStop(1, rgba(pal.background, 0.85)); ctx.fillStyle = g2; ctx.fillRect(0, H * 0.86, W, H * 0.14); }
    const tw = land ? W * 0.6 : W - 2 * m, tx = al === 'right' ? W - m - tw : al === 'center' ? (W - tw) / 2 : m;
    const { T, C } = stack(S, ctx, tw, land ? H * 0.15 : W * 0.125, land ? 3 : 4, Math.min(tw, W * 0.7), land ? W * 0.02 : W * 0.027, 3, H * 0.6 - m * 1.2, 52);
    const cx = al === 'right' ? W - m - Math.min(tw, W * 0.7) : al === 'center' ? (W - Math.min(tw, W * 0.7)) / 2 : m;
    const total = 30 + T.h + (C ? C.h + 22 : 0);
    let y = bottom ? H - m * 1.2 - total : m * 0.95;
    mono(ctx, S, metaLine(S), tx, y + 14, { size: 16, color: S.accentOn(pal.background), align: al, w: tw, t0: 0.5, maxW: tw });
    y += 30; paint(ctx, S, T, tx, y, { color: pal.ink, align: al, w: tw, t0: 0.6 });
    if (C) paint(ctx, S, C, cx, y + T.h + 22, { color: mix(pal.ink, pal.background, 0.14), align: al, w: Math.min(tw, W * 0.7), t0: 1.1 });
    const extra = Math.min(3, S.photos.length - 1), s = W * 0.135;
    for (let i = 0; i < extra; i++) {
      const a = appear(S, 0.9 + i * 0.15); if (a <= 0) continue;
      ctx.globalAlpha = a;
      const px = W - m - s / 2, py = (bottom ? m + s / 2 + i * (s + 16) : H - m * 1.5 - s / 2 - i * (s + 16));
      ctx.fillStyle = pal.surface; ctx.fillRect(px - s / 2 - 5, py - s / 2 - 5, s + 10, s + 10);
      ctx.save(); ctx.beginPath(); ctx.rect(px - s / 2, py - s / 2, s, s); ctx.clip(); photoFill(ctx, S, i + 1, px - s / 2, py - s / 2, s, s); ctx.restore();
      ctx.globalAlpha = 1;
    }
    S.colophonNow = mix(pal.ink, pal.background, 0.3);
  },

  desk(ctx, S) {
    const { W, H, pal, m, land } = S, tilt = S.spec.composition.tilt, n = Math.min(5, S.photos.length);
    ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba(pal.accent2, 0.12); ctx.beginPath(); ctx.arc(W * 0.8, H * 0.18, W * 0.42, 0, 6.3); ctx.fill();
    const R = land ? { x: m * 0.5, y: m * 0.6, w: W * 0.6, h: H - m * 1.9 } : { x: m * 0.5, y: m * 0.6, w: W - m, h: H * 0.635 };
    const SLOTS = {
      1: [[0.5, 0.5, 0.74, -2.5]], 2: [[0.36, 0.4, 0.56, -5], [0.66, 0.6, 0.54, 4]], 3: [[0.3, 0.34, 0.5, -6], [0.71, 0.38, 0.46, 5], [0.5, 0.7, 0.5, -1.5]],
      4: [[0.28, 0.3, 0.44, -6], [0.72, 0.3, 0.42, 4], [0.31, 0.72, 0.42, 3], [0.71, 0.71, 0.44, -4]],
      5: [[0.25, 0.28, 0.4, -6], [0.74, 0.27, 0.38, 5], [0.5, 0.52, 0.4, -1], [0.26, 0.76, 0.38, 4], [0.75, 0.76, 0.38, -4]],
    }[n];
    const white = S.spec.photo.frame !== 'none';
    for (let k = n - 1; k >= 0; k--) {
      const [fx, fy, fw, fr] = SLOTS[k], P = S.photos[k], asp = clamp(P.w / P.h, 0.72, 1.45), p = S.parts[k];
      let pw = fw * R.w, ph = pw / asp; const maxH = R.h * (n === 1 ? 0.86 : n === 2 ? 0.62 : 0.5);
      if (ph > maxH) { ph = maxH; pw = ph * asp; }
      const a = appear(S, 0.25 + (n - 1 - k) * 0.28, 0.9); if (a <= 0) continue;
      const rot = (fr + (p.r - 0.5) * 3) * (0.3 + tilt * 1.35) * Math.PI / 180, cx = R.x + fx * R.w, cy = R.y + fy * R.h - (1 - a) * 34;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(1.07 - 0.07 * a, 1.07 - 0.07 * a); ctx.translate(-cx, -cy);
      printBox(ctx, S, k, cx, cy, pw, ph, rot, { frame: white ? 'white' : 'none', bottom: white ? pw * 0.07 : 0 });
      if (white) { ctx.translate(cx, cy); ctx.rotate(rot + (p.s - 0.5) * 0.16); ctx.fillStyle = rgba(pal.accent, 0.55); ctx.fillRect(-pw * 0.11, -ph / 2 - pw * 0.045 - 15, pw * 0.22, 30); }
      ctx.restore();
    }
    const tx = land ? R.x + R.w + m * 0.5 : m, tw = land ? W - tx - m : W - 2 * m - (S.emblem ? W * 0.15 : 0);
    const { T, C } = stack(S, ctx, tw, land ? W * 0.058 : W * 0.086, 3, Math.min(tw, W * 0.66), land ? W * 0.02 : W * 0.027, 3, land ? H - m * 2.4 : H - m * 0.95 - (R.y + R.h + m * 0.35), 52);
    let y = land ? (H - (T.h + (C ? C.h + 20 : 0) + 34)) / 2 : R.y + R.h + m * 0.35;
    mono(ctx, S, metaLine(S), tx, y + 14, { color: S.accentOn(pal.background), t0: 0.9, maxW: tw });
    paint(ctx, S, T, tx, y + 34, { color: pal.ink, t0: 1.0 });
    if (C) paint(ctx, S, C, tx, y + 34 + T.h + 18, { color: mix(pal.ink, pal.background, 0.22), t0: 1.4 });
    if (S.emblem) {
      const a = appear(S, 1.6), ex = W - m - W * 0.062, ey = land ? H - m * 1.5 - W * 0.062 : y + 34 + W * 0.07, r0 = W * 0.062;
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.translate(ex, ey); ctx.rotate(-0.16);
      ctx.strokeStyle = S.accentOn(pal.background); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r0, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r0 - 7, 0, 6.3); ctx.lineWidth = 1; ctx.stroke();
      drawEmblem(ctx, S, 0, 0, r0 * 1.15, S.accentOn(pal.background), 2.4); ctx.restore();
    }
  },

  filmstrip(ctx, S) {
    const { W, H, pal, m, land } = S, top = S.spec.composition.titlePlacement === 'top', n = S.photos.length;
    ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
    const bandH = land ? H * 0.46 : H * 0.34, by = top ? H * 0.5 : H * 0.11, film = lum(pal.background) < 0.1 ? mix(pal.background, pal.ink, 0.17) : '#0C0C0E';
    const a0 = appear(S, 0.1, 1.2);
    ctx.save(); ctx.globalAlpha = a0; ctx.translate(W / 2, by + bandH / 2); ctx.rotate(-(S.spec.composition.tilt * 4.5) * Math.PI / 180); ctx.translate(-W / 2, -(by + bandH / 2));
    ctx.fillStyle = film; ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; ctx.fillRect(-200, by, W + 400, bandH); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const fh = bandH * 0.66, fw = fh * 1.5, gap = fh * 0.07, pitch = fw + gap, off = S.tm * 26 * S.tempo + 40, first = Math.floor(off / pitch), holeW = pitch / 8 * 0.52, holeH = bandH * 0.075;
    for (let k = -2; k < Math.ceil((W + 400) / pitch) + 1; k++) {
      const x = k * pitch - (off % pitch), idx = (((k + first) % n) + n) % n, frameNo = ((k + first) % 36 + 36) % 36 + 1;
      ctx.save(); ctx.beginPath(); ctx.rect(x, by + bandH * 0.17, fw, fh); ctx.clip(); photoFill(ctx, S, idx, x, by + bandH * 0.17, fw, fh); ctx.restore();
      ctx.fillStyle = pal.background;
      for (let hh = 0; hh < 8; hh++) { // eight perforations per frame, as on 35mm stock
        const hx = x + hh * (pitch / 8) + (pitch / 8 - holeW) / 2;
        for (const hy of [by + bandH * 0.04, by + bandH * (0.96 - 0.075)]) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(hx, hy, holeW, holeH, 4); else ctx.rect(hx, hy, holeW, holeH); ctx.fill(); }
      }
      setFont(ctx, MONO, bandH * 0.032, 500, false, 0.1); ctx.fillStyle = S.accentOn(film); ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(frameNo), x + 4, by + bandH * 0.158); ctx.fillText(frameNo + 'A', x + fw * 0.52, by + bandH * 0.158);
      ctx.fillText(k % 2 ? 'AFTERIMAGE 400' : '▸ ' + dotDate(S.meta.date), x + 4, by + bandH * 0.868);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.restore();
    const tw = land ? W * 0.7 : W - 2 * m, al = S.spec.composition.align, tx = al === 'right' ? W - m - tw : al === 'center' ? (W - tw) / 2 : m;
    const zoneY = top ? m * 0.9 : by + bandH + m * 0.7, zoneH = top ? by - m * 1.4 : H - zoneY - m * 1.0;
    const { T, C } = stack(S, ctx, tw, land ? H * 0.12 : W * 0.115, land ? 2 : 3, Math.min(tw, W * 0.7), land ? W * 0.02 : W * 0.027, 3, zoneH, 52);
    let y = zoneY + Math.max(0, (zoneH - (30 + T.h + (C ? C.h + 20 : 0))) * (top ? 0.5 : 0.3));
    mono(ctx, S, metaLine(S), tx, y + 14, { color: S.accentOn(pal.background), align: al, w: tw, t0: 0.6, maxW: tw });
    paint(ctx, S, T, tx, y + 32, { color: pal.ink, align: al, w: tw, t0: 0.7 });
    if (C) paint(ctx, S, C, al === 'right' ? W - m - Math.min(tw, W * 0.7) : al === 'center' ? (W - Math.min(tw, W * 0.7)) / 2 : m, y + 32 + T.h + 20, { color: mix(pal.ink, pal.background, 0.25), align: al, w: Math.min(tw, W * 0.7), t0: 1.2 });
  },

  editorial(ctx, S) {
    const { W, H, pal, m, land } = S, n = S.photos.length, top = m * 0.78;
    ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
    mono(ctx, S, 'Afterimage', m, top + 12, { size: 15, color: pal.ink, t0: 0.1, weight: 500 });
    mono(ctx, S, fmtDate(S.meta.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), m, top + 12, { size: 15, color: pal.ink, align: 'center', w: W - 2 * m, t0: 0.1 });
    mono(ctx, S, '№ ' + pad4(S.meta.no), m, top + 12, { size: 15, color: pal.ink, align: 'right', w: W - 2 * m, t0: 0.1 });
    ctx.fillStyle = rgba(pal.ink, 0.85 * appear(S, 0.1)); ctx.fillRect(m, top + 28, (W - 2 * m) * appear(S, 0.1, 1.2), 1.5);
    const py = top + 50, px = m, pw = land ? W * 0.53 : W - 2 * m, ph = land ? H - py - m * 1.25 : H * (S.H === S.W ? 0.43 : 0.465);
    const a = appear(S, 0.3, 1.1);
    ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip(); heroFill(ctx, S, px, py, pw, ph); ctx.restore();
    const fig = ['Илл. 1', S.meta.location, S.meta.weather].filter(Boolean).join(' — ');
    const tx = land ? px + pw + m * 0.7 : m, colW = land ? W - tx - m : W - 2 * m, small = n > 1 && !land;
    mono(ctx, S, fig, px, py + ph + 24, { size: 13, color: S.colophon, align: land ? 'left' : 'right', w: pw, t0: 0.8 });
    const hw = small ? colW * 0.7 : colW;
    const { T, C } = stack(S, ctx, hw, land ? W * 0.06 : W * 0.096, land ? 4 : 3, Math.min(hw, land ? colW : W * 0.56), land ? W * 0.019 : W * 0.027, 4, land ? (n > 1 ? H * 0.5 : H - py - m * 1.6) : H - m * 1.3 - (py + ph + 58), 80);
    let y = land ? py + 6 : py + ph + 58;
    paint(ctx, S, T, tx, y, { color: pal.ink, t0: 0.8 }); y += T.h + 22;
    ctx.fillStyle = S.accentOn(pal.background); ctx.globalAlpha = appear(S, 1.2); ctx.fillRect(tx, y, 56, 4); ctx.globalAlpha = 1; y += 26;
    if (C) { paint(ctx, S, C, tx, y, { color: mix(pal.ink, pal.background, 0.18), t0: 1.3 }); y += C.h + 22; }
    const emo = S.spec.emotion.dominant.map((e) => e.name).slice(0, 3).join('  ·  ');
    if (emo && y < H - m * 1.5) mono(ctx, S, emo, tx, y + 8, { size: 14, color: S.accentOn(pal.background), t0: 1.6, maxW: hw });
    if (n > 1) {
      const sw = land ? colW * 0.62 : W * 0.215, sh = sw * 1.22, sx = land ? tx + sw / 2 : W - m - sw / 2, sy = H - m * 1.3 - sh / 2, a2 = appear(S, 1.1);
      if (!land || y + 30 < sy - sh / 2) { ctx.globalAlpha = a2; printBox(ctx, S, 1, sx, sy, sw, sh, 0, { frame: 'thin', shadow: false }); ctx.globalAlpha = 1; }
    } else if (!land) {
      const day = String(parseISO(S.meta.date).getDate());
      setFont(ctx, S.spec.typography.display, W * 0.26, S.spec.typography.weight, S.spec.typography.italic, 0);
      ctx.textAlign = 'right'; ctx.fillStyle = rgba(S.accentOn(pal.background), 0.9 * appear(S, 1.2)); ctx.fillText(day, W - m, H - m * 1.15); ctx.textAlign = 'left';
    }
  },

  grid(ctx, S) {
    const { W, H, pal, m } = S, n = S.photos.length, fmt = S.spec.composition.format;
    ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
    const MAP = {
      portrait: { cols: 6, rows: 8, A: [0, 0, 4, 5], X: [4, 0, 2, 2], B: [4, 2, 2, 3], T: [0, 5, 6, 2], C: [0, 7, 2, 1], M: [2, 7, 4, 1] },
      square: { cols: 6, rows: 6, A: [0, 0, 4, 3.6], X: [4, 0, 2, 1.4], B: [4, 1.4, 2, 2.2], T: [0, 3.6, 6, 1.6], C: [0, 5.2, 1.5, 0.8], M: [1.5, 5.2, 4.5, 0.8] },
      landscape: { cols: 9, rows: 4, A: [0, 0, 4, 4], X: [4, 0, 2, 1.2], B: [6, 0, 3, 2], T: [4, 2, 5, 1.3], C: [4, 1.2, 2, 0.8], M: [4, 3.3, 5, 0.7] },
    }[fmt] || null;
    const ox = m * 0.6, oy = m * 0.6, gw = W - m * 1.2, gh = H - m * 1.2 - 44, g = W * 0.011, cw = gw / MAP.cols, ch = gh / MAP.rows;
    const rect = ([c, r, cs, rs]) => ({ x: ox + c * cw + g / 2, y: oy + r * ch + g / 2, w: cs * cw - g, h: rs * ch - g });
    let order = 0;
    const cell = (def, fn) => {
      const q = rect(def), a = easeOut((S.ti - 0.12 * order++) / 0.55); if (a <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(q.x, q.y, q.w * a, q.h); ctx.clip(); fn(q); ctx.restore();
    };
    cell(MAP.A, (q) => heroFill(ctx, S, q.x, q.y, q.w, q.h));
    cell(MAP.X, (q) => {
      ctx.fillStyle = pal.accent; ctx.fillRect(q.x, q.y, q.w, q.h);
      const on = contrast(pal.background, pal.accent) > contrast(pal.ink, pal.accent) ? pal.background : pal.ink, d = parseISO(S.meta.date);
      setFont(ctx, S.spec.typography.display, Math.min(q.h * 0.62, q.w * 0.5), Math.max(600, S.spec.typography.weight), false, -0.02);
      ctx.fillStyle = on; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(d.getDate()).padStart(2, '0'), q.x + q.w * 0.08, q.y + q.h * 0.66);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      mono(ctx, S, d.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }).replace(/\s*г\.$/, ''), q.x + q.w * 0.08, q.y + q.h * 0.88, { size: Math.max(13, q.h * 0.09), color: on, weight: 500 });
    });
    cell(MAP.B, (q) => {
      if (n > 1) return photoFill(ctx, S, 1, q.x, q.y, q.w, q.h);
      ctx.fillStyle = pal.ink; ctx.fillRect(q.x, q.y, q.w, q.h);
      if (!drawEmblem(ctx, S, q.x + q.w / 2, q.y + q.h / 2, Math.min(q.w, q.h) * 0.6, pal.background, 2.6)) { ctx.strokeStyle = pal.background; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x + q.w / 2, q.y + q.h / 2, Math.min(q.w, q.h) * 0.28, 0, 6.3); ctx.stroke(); }
    });
    cell(MAP.T, (q) => {
      ctx.fillStyle = pal.ink; ctx.fillRect(q.x, q.y + 4, q.w, 4);
      const T = titleBlock(S, ctx, q.w, Math.min(W * 0.105, q.h * 0.46), fmt === 'portrait' ? 3 : 2, 1.0, q.h - 34);
      paint(ctx, S, T, q.x, q.y + 26 + Math.max(0, (q.h - 26 - T.h) * 0.35), { color: pal.ink, t0: 0.5 });
    });
    cell(MAP.C, (q) => {
      if (n > 2) return photoFill(ctx, S, 2, q.x, q.y, q.w, q.h);
      ctx.fillStyle = pal.accent2; ctx.fillRect(q.x, q.y, q.w, q.h);
      ctx.strokeStyle = contrast(pal.background, pal.accent2) > 2 ? pal.background : pal.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q.x + q.w * 0.2, q.y + q.h * 0.8); ctx.lineTo(q.x + q.w * 0.8, q.y + q.h * 0.2); ctx.stroke();
    });
    cell(MAP.M, (q) => {
      ctx.fillStyle = rgba(pal.ink, 0.8); ctx.fillRect(q.x, q.y + 2, q.w, 1.5);
      const lines = [[S.meta.location, S.meta.weather].filter(Boolean).join(' · '), S.spec.emotion.dominant.map((e) => e.name).slice(0, 3).join(' / '), S.spec.caption].filter(Boolean);
      const sz = Math.min(15, q.h * 0.16), C = S.spec.caption ? block(S, ctx, S.spec.caption, { font: S.spec.typography.body, size: Math.min(W * 0.022, q.h * 0.17), w: q.w * 0.62, maxLines: 3, weight: 400, lh: 1.35 }) : null;
      if (C) paint(ctx, S, C, q.x, q.y + 18, { color: mix(pal.ink, pal.background, 0.15), t0: 0.9 });
      mono(ctx, S, lines[0] === S.spec.caption ? '' : lines[0], q.x, q.y + 30, { size: sz, color: S.accentOn(pal.background), align: 'right', w: q.w, t0: 0.9, maxW: q.w * 0.34 });
      mono(ctx, S, S.spec.emotion.dominant.map((e) => e.name).slice(0, 2).join(' / '), q.x, q.y + 30 + sz * 1.7, { size: sz, color: S.colophon, align: 'right', w: q.w, t0: 1.0, maxW: q.w * 0.34 });
    });
    ctx.strokeStyle = rgba(pal.muted, 0.7 * appear(S, 1)); ctx.lineWidth = 1.5;
    for (const [c, r] of [[0, 0], [MAP.cols, 0], [0, MAP.rows], [MAP.cols, MAP.rows]]) { const x = ox + c * cw, y = oy + r * ch; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke(); }
  },

  arch(ctx, S) {
    const { W, H, pal, m, land } = S, al = S.spec.composition.align, n = S.photos.length;
    ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
    const aw = land ? H * 0.5 : W * 0.56, ah = land ? H * 0.76 : H * 0.5, ay = land ? H * 0.09 : H * 0.082;
    const ax = land ? m * 1.5 : al === 'left' ? m * 1.5 : al === 'right' ? W - aw - m * 1.5 : (W - aw) / 2;
    const rise = appear(S, 0.2, 1.6), dr = (land ? H : W) * 0.2;
    ctx.fillStyle = rgba(pal.accent, 0.94 * rise); ctx.beginPath(); ctx.arc(ax + aw * 0.94, ay + ah * 0.2 + (1 - rise) * 70 + Math.sin(S.tm * 0.25) * 6, dr, 0, 6.3); ctx.fill();
    ctx.fillStyle = rgba(pal.accent2, 0.85 * rise); ctx.beginPath(); ctx.arc(ax - aw * 0.07, ay + ah * 0.82, dr * 0.22, 0, 6.3); ctx.fill();
    const path = (x, y, w, hgt) => { ctx.beginPath(); ctx.moveTo(x, y + hgt); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + hgt); ctx.closePath(); };
    ctx.save(); ctx.globalAlpha = appear(S, 0.4, 1.2); path(ax, ay, aw, ah); ctx.clip(); heroFill(ctx, S, ax, ay, aw, ah); ctx.restore();
    ctx.strokeStyle = rgba(pal.ink, 0.5 * appear(S, 0.9)); ctx.lineWidth = 1.5; path(ax - 13, ay - 13, aw + 26, ah + 13); ctx.stroke();
    const tx = land ? ax + aw + m * 1.3 : m * 1.1, tw = land ? W - tx - m : W - m * 2.2, tal = land ? 'left' : 'center';
    const cw = Math.min(tw, W * 0.64), y0 = ay + ah + H * 0.045;
    const { T, C } = stack(S, ctx, tw, land ? W * 0.056 : W * 0.086, 3, cw, land ? W * 0.019 : W * 0.026, 3, land ? H * 0.74 : H - m * 1.1 - y0, 80);
    let y = land ? (H - (T.h + (C ? C.h + 24 : 0) + 40)) / 2 : ay + ah + H * 0.045;
    mono(ctx, S, metaLine(S), tx, y + 12, { size: 15, color: S.accentOn(pal.background), align: tal, w: tw, t0: 0.9, maxW: tw });
    paint(ctx, S, T, tx, y + 34, { color: pal.ink, align: tal, w: tw, t0: 1.0 }); y += 34 + T.h + 20;
    if (C) { paint(ctx, S, C, land ? tx : (W - cw) / 2, y, { color: mix(pal.ink, pal.background, 0.22), align: tal, w: cw, t0: 1.4 }); y += C.h + 26; }
    const extra = Math.min(3, n - 1), d = (land ? H : W) * 0.1;
    if (extra && y + d < H - m) for (let i = 0; i < extra; i++) {
      const cx = land ? tx + d / 2 + i * (d + 16) : W / 2 + (i - (extra - 1) / 2) * (d + 18), cy = y + d / 2, a = appear(S, 1.5 + i * 0.15);
      ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, 6.3); ctx.clip(); photoFill(ctx, S, i + 1, cx - d / 2, cy - d / 2, d, d); ctx.restore();
    }
  },

  postcard(ctx, S) {
    const { W, H, pal, m, land } = S;
    ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba(pal.accent2, 0.14); ctx.fillRect(0, H * 0.58, W, H * 0.42);
    const cw = W - m * 1.6, ch = H - m * 2.5, cx = W / 2, cy = H / 2 - m * 0.25, p = cw * 0.036;
    const card = contrast(pal.surface, pal.background) < 1.1 ? mix(pal.surface, lum(pal.background) > 0.5 ? '#FFFFFF' : pal.ink, 0.12) : pal.surface;
    const on = ensureContrast(pal.ink, card, 5), soft = mix(on, card, 0.45), a = appear(S, 0.15, 1.1);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy + (1 - a) * 40); ctx.rotate(-(0.5 + S.spec.composition.tilt * 2.2) * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20; ctx.fillStyle = card; ctx.fillRect(-cw / 2, -ch / 2, cw, ch); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const P = land ? { x: -cw / 2 + p, y: -ch / 2 + p, w: cw * 0.5 - p * 1.5, h: ch - 2 * p } : { x: -cw / 2 + p, y: -ch / 2 + p, w: cw - 2 * p, h: ch * 0.54 };
    heroFill(ctx, S, P.x, P.y, P.w, P.h);
    const B = land ? { x: P.x + P.w + p * 1.2, y: -ch / 2 + p * 1.2, w: cw / 2 - p * 1.7, h: ch - p * 2.4 } : { x: -cw / 2 + p * 1.3, y: P.y + P.h + p * 1.1, w: cw - p * 2.6, h: ch - P.h - p * 3.2 };
    const leftW = B.w * 0.57, rx = B.x + B.w * 0.63, rw = B.w * 0.37;
    ctx.strokeStyle = rgba(soft, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(B.x + B.w * 0.6, B.y + 4); ctx.lineTo(B.x + B.w * 0.6, B.y + B.h); ctx.stroke();
    const T = titleBlock(S, ctx, leftW, cw * (land ? 0.05 : 0.078), 3, 0, B.h * 0.52);
    paint(ctx, S, T, B.x, B.y, { color: on, t0: 0.8 });
    const lh = Math.max(34, B.h * 0.105), cs = Math.min(lh * 0.62, cw * 0.03), ly0 = B.y + T.h + lh * 0.9, C = S.spec.caption ? block(S, ctx, S.spec.caption, { font: S.spec.typography.body, size: cs, w: leftW, maxLines: Math.max(1, Math.floor((B.y + B.h - ly0) / lh) + 1), weight: 400, lh: lh / cs }) : null;
    for (let ly = ly0 + lh * 0.2; ly <= B.y + B.h + 2; ly += lh) { ctx.strokeStyle = rgba(soft, 0.4); ctx.beginPath(); ctx.moveTo(B.x, ly); ctx.lineTo(B.x + leftW, ly); ctx.stroke(); }
    if (C) paint(ctx, S, C, B.x, ly0 + lh * 0.2 - cs * 0.82 - 7 - (C.lh - lh), { color: mix(on, card, 0.12), t0: 1.2 });
    const sw = Math.min(rw * 0.44, B.h * 0.42), sh = sw * 1.22, sx = B.x + B.w - sw, sy = B.y;
    ctx.fillStyle = pal.accent; ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = card; ctx.lineWidth = 5; ctx.setLineDash([1, 9]); ctx.lineCap = 'round'; ctx.strokeRect(sx, sy, sw, sh); ctx.setLineDash([]); ctx.lineCap = 'butt';
    const stampInk = contrast(card, pal.accent) > contrast(pal.ink, pal.accent) ? card : pal.ink;
    if (!drawEmblem(ctx, S, sx + sw / 2, sy + sh * 0.46, sw * 0.66, stampInk, 2.6)) { ctx.strokeStyle = stampInk; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx + sw / 2, sy + sh * 0.46, sw * 0.24, 0, 6.3); ctx.stroke(); }
    setFont(ctx, MONO, sw * 0.085, 500, false, 0.1); ctx.fillStyle = stampInk; ctx.textAlign = 'center'; ctx.fillText('AFTERIMAGE', sx + sw / 2, sy + sh * 0.93); ctx.textAlign = 'left';
    const pr = sw * 0.52, pcx = sx - pr * 0.45, pcy = sy + sh * 0.55, pa = appear(S, 1.5, 0.3);
    ctx.save(); ctx.globalAlpha *= 0.62 * pa; ctx.translate(pcx, pcy); ctx.rotate(-0.2); ctx.strokeStyle = on; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, pr * 0.7, 0, 6.3); ctx.lineWidth = 1.2; ctx.stroke();
    setFont(ctx, MONO, pr * 0.22, 500, false, 0.06); ctx.fillStyle = on; ctx.textAlign = 'center'; ctx.fillText(dotDate(S.meta.date), 0, pr * 0.08); ctx.textAlign = 'left';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); for (let u = 0; u <= 1.001; u += 0.05) { const wx = pr + u * sw * 1.15, wy = -pr * 0.45 + i * pr * 0.3 + Math.sin(u * 12.5) * 4; u ? ctx.lineTo(wx, wy) : ctx.moveTo(wx, wy); } ctx.lineWidth = 1.6; ctx.stroke(); }
    ctx.restore();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const lines = [S.meta.location, fmtDate(S.meta.date, { day: 'numeric', month: 'long', year: 'numeric' }), S.song ? '♪ ' + S.song : S.meta.weather].filter(Boolean), base = Math.max(sy + sh + lh * 1.1, B.y + B.h - (lines.length - 1) * lh);
    lines.forEach((ln, i) => {
      const ly = base + i * lh; if (ly > B.y + B.h + 4) return;
      ctx.strokeStyle = rgba(soft, 0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(rx, ly); ctx.lineTo(B.x + B.w, ly); ctx.stroke();
      mono(ctx, S, ln, rx, ly - 9, { size: Math.min(15, lh * 0.36), color: on, t0: 1.3 + i * 0.1, maxW: rw });
    });
    ctx.restore();
  },
};

/* ───────────── animated motifs ───────────── */
const MOTIF = {
  leaves(ctx, S, t, n, c, sp) {
    for (let i = 0; i < n * 0.5; i++) {
      const p = S.parts[i], sz = 13 + 24 * p.r, y = ((p.y * (S.H + 120) + t * (26 + 60 * p.s) * sp) % (S.H + 120)) - 60, x = p.x * S.W + Math.sin(t * 0.5 * (0.5 + p.s2) + p.ph) * 46;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.ph + t * (0.25 + p.s) * sp); ctx.scale(1, 0.55 + 0.45 * Math.cos(t * (0.6 + p.s2) + p.ph));
      ctx.globalAlpha = 0.5 + 0.4 * p.s2; ctx.fillStyle = mix(c, S.pal.accent2, p.r * 0.8);
      ctx.beginPath(); ctx.moveTo(0, -sz); ctx.quadraticCurveTo(sz * 0.78, -sz * 0.15, 0, sz); ctx.quadraticCurveTo(-sz * 0.78, -sz * 0.15, 0, -sz); ctx.fill(); ctx.restore();
    }
  },
  petals(ctx, S, t, n, c, sp) {
    for (let i = 0; i < n * 0.5; i++) {
      const p = S.parts[i], sz = 8 + 14 * p.r, y = ((p.y * (S.H + 80) + t * (18 + 40 * p.s) * sp) % (S.H + 80)) - 40, x = p.x * S.W + Math.sin(t * 0.4 * (0.5 + p.s2) + p.ph) * 60;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.ph + t * 0.4 * sp); ctx.globalAlpha = 0.45 + 0.35 * p.s2; ctx.fillStyle = mix(c, S.pal.surface, p.r * 0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.55, 0, 0, 6.3); ctx.fill(); ctx.restore();
    }
  },
  confetti(ctx, S, t, n, c, sp) {
    const cols = [c, S.pal.accent2, S.pal.surface, S.pal.accent];
    for (let i = 0; i < n * 0.7; i++) {
      const p = S.parts[i], y = ((p.y * (S.H + 60) + t * (60 + 120 * p.s) * sp) % (S.H + 60)) - 30, x = p.x * S.W + Math.sin(t * (0.8 + p.s2) + p.ph) * 30;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.ph + t * (1 + p.s * 2)); ctx.scale(1, Math.cos(t * (2 + p.s2 * 3) + p.ph)); ctx.globalAlpha = 0.85; ctx.fillStyle = cols[i % 4];
      ctx.fillRect(-7 - p.r * 6, -4, 14 + p.r * 12, 8); ctx.restore();
    }
  },
  rain(ctx, S, t, n, c, sp) {
    ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const p = S.parts[i], len = 40 + 70 * p.r, y = ((p.y * (S.H + 200) + t * (700 + 700 * p.s) * (0.4 + sp)) % (S.H + 200)) - 100, x = p.x * S.W * 1.25 - y * 0.16;
      ctx.globalAlpha = 0.14 + 0.26 * p.s2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.16, y + len); ctx.stroke();
    }
  },
  snow(ctx, S, t, n, c, sp) {
    ctx.fillStyle = lum(c) > 0.55 ? c : '#FFFFFF';
    for (let i = 0; i < n; i++) {
      const p = S.parts[i], y = ((p.y * (S.H + 40) + t * (16 + 44 * p.s) * (0.4 + sp)) % (S.H + 40)) - 20, x = p.x * S.W + Math.sin(t * 0.5 * (0.4 + p.s2) + p.ph) * 34;
      ctx.globalAlpha = 0.35 + 0.55 * p.s2; ctx.beginPath(); ctx.arc(x, y, 1.8 + 5.5 * p.r * p.r, 0, 6.3); ctx.fill();
    }
  },
  bokeh(ctx, S, t, n, c, sp) {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < n * 0.22; i++) {
      const p = S.parts[i], rad = 46 + 130 * p.r, x = p.x * S.W + Math.sin(t * 0.12 * sp + p.ph) * 70, y = p.y * S.H + Math.cos(t * 0.1 * sp + p.ph * 2) * 50, col = i % 3 ? c : S.pal.accent2;
      const g = ctx.createRadialGradient(x, y, rad * 0.55, x, y, rad); g.addColorStop(0, rgba(col, 0.16 + 0.1 * S.pulse)); g.addColorStop(0.92, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0));
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.3 + p.ph) ** 2; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.3); ctx.fill();
    }
  },
  dust(ctx, S, t, n, c, sp) {
    ctx.fillStyle = lum(c) > 0.4 ? c : mix(c, '#FFFFFF', 0.7);
    for (let i = 0; i < n; i++) {
      const p = S.parts[i], y = (((p.y * S.H - t * (5 + 14 * p.s) * sp) % S.H) + S.H) % S.H, x = p.x * S.W + Math.sin(t * 0.2 + p.ph) * 26;
      ctx.globalAlpha = (0.2 + 0.6 * p.s2) * (0.5 + 0.5 * Math.sin(t * (0.6 + p.r) + p.ph)); ctx.beginPath(); ctx.arc(x, y, 0.9 + 2.2 * p.r, 0, 6.3); ctx.fill();
    }
  },
  stars(ctx, S, t, n, c) {
    ctx.fillStyle = lum(c) > 0.5 ? c : '#FFFFFF'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i++) {
      const p = S.parts[i], x = p.x * S.W, y = p.y * S.H * 0.7, tw = 0.35 + 0.65 * Math.sin(t * (0.5 + p.s * 1.5) + p.ph) ** 2;
      ctx.globalAlpha = tw * (0.4 + 0.6 * p.s2);
      if (p.r > 0.86) { const s = 7 + 8 * p.s; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(x, y, 0.8 + 1.8 * p.r, 0, 6.3); ctx.fill(); }
    }
  },
  lightleak(ctx, S, t, n, c, sp) {
    ctx.globalCompositeOperation = 'screen';
    [[0, 0.25, c], [1, 0.75, S.pal.accent2], [0.3, 1.05, c]].forEach(([fx, fy, col], i) => {
      const x = fx * S.W + Math.sin(t * 0.13 * sp + i * 2) * S.W * 0.14, y = fy * S.H + Math.cos(t * 0.1 * sp + i) * S.H * 0.1, rad = S.W * (0.5 + 0.12 * Math.sin(t * 0.2 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba(col, 0.5 * (0.35 + S.spec.motif.density))); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.H);
    });
  },
  rays(ctx, S, t, n, c, sp) {
    ctx.globalCompositeOperation = 'soft-light'; ctx.translate(S.W * 0.86, -S.H * 0.05); ctx.rotate(Math.sin(t * 0.08 * sp) * 0.06);
    ctx.fillStyle = mix(c, '#FFFFFF', 0.55);
    for (let i = 0; i < 9; i++) { const a = 1.75 + i * 0.19; ctx.globalAlpha = (0.1 + 0.16 * S.spec.motif.density) * (0.6 + 0.4 * Math.sin(t * 0.3 + i)); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * S.H * 2, Math.sin(a) * S.H * 2); ctx.lineTo(Math.cos(a + 0.085) * S.H * 2, Math.sin(a + 0.085) * S.H * 2); ctx.closePath(); ctx.fill(); }
  },
  scan(ctx, S, t, n, c, sp) {
    ctx.fillStyle = rgba(S.pal.ink, 0.07); for (let y = 0; y < S.H; y += 6) ctx.fillRect(0, y, S.W, 1.5);
    const by = (t * 190 * (0.4 + sp)) % (S.H * 1.4) - S.H * 0.2, g = ctx.createLinearGradient(0, by - 70, 0, by + 70);
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.5, rgba(c, 0.16)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, by - 70, S.W, 140);
    const r = rng(S.seed + Math.floor(t * 7 * (0.5 + sp)));
    if (r() < 0.2 + S.spec.motif.density * 0.5) for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba(i % 2 ? c : S.pal.accent2, 0.5 + 0.3 * r()); ctx.fillRect(r() * S.W * 0.8, r() * S.H, 60 + r() * S.W * 0.3, 2 + r() * 7); }
  },
  waves(ctx, S, t, n, c, sp) {
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.5 - i * 0.07; ctx.beginPath(); const y0 = S.H * (0.86 + i * 0.026);
      for (let x = -10; x <= S.W + 10; x += 14) { const y = y0 + Math.sin(x * 0.012 + t * (0.5 + i * 0.12) * (0.3 + sp) + i * 1.3) * (10 + i * 3); x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  fog(ctx, S, t, n, c, sp) {
    const col = mix(S.pal.surface, '#FFFFFF', lum(S.pal.background) > 0.5 ? 0.6 : 0.1);
    for (let i = 0; i < 6; i++) {
      const p = S.parts[i], rad = S.W * (0.35 + 0.3 * p.r), x = ((p.x * S.W * 1.6 + t * (12 + 20 * p.s) * (0.3 + sp)) % (S.W * 1.6 + rad)) - rad * 0.5, y = S.H * (0.25 + 0.6 * p.y);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba(col, 0.1 + 0.2 * S.spec.motif.density)); g.addColorStop(1, rgba(col, 0));
      ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.42); ctx.translate(0, -y); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.3); ctx.fill(); ctx.restore();
    }
  },
  grid(ctx, S, t, n, c) {
    const step = S.W / 12; ctx.strokeStyle = rgba(S.pal.ink, 0.07); ctx.lineWidth = 1;
    for (let x = step; x < S.W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke(); }
    for (let y = step; y < S.H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.W, y); ctx.stroke(); }
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    for (let i = 0; i < n * 0.12; i++) { const p = S.parts[i], x = Math.round(p.x * 12) * step, y = Math.round(p.y * (S.H / step)) * step; ctx.globalAlpha = 0.25 + 0.7 * Math.sin(t * (0.6 + p.s) + p.ph) ** 2; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke(); }
  },
};

function drawTexture(ctx, S) {
  const { kind, intensity } = S.spec.texture;
  if (kind === 'none' || intensity < 0.02) return;
  ctx.save();
  const T = S.tiles;
  if (kind === 'grain') {
    T.grain = T.grain || noiseTile(256, S.seed);
    const r = rng(S.seed + Math.floor(S.tm * 12));
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.12 + intensity * 0.5; ctx.translate(-r() * 256, -r() * 256); ctx.fillStyle = ctx.createPattern(T.grain, 'repeat'); ctx.fillRect(0, 0, S.W + 256, S.H + 256);
  } else if (kind === 'paper') {
    T.paper = T.paper || noiseTile(512, S.seed + 7, true);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.25 + intensity * 0.6; ctx.fillStyle = ctx.createPattern(T.paper, 'repeat'); ctx.fillRect(0, 0, S.W, S.H);
  } else if (kind === 'linen') {
    T.linen = T.linen || linenTile();
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.18 + intensity * 0.5; ctx.fillStyle = ctx.createPattern(T.linen, 'repeat'); ctx.fillRect(0, 0, S.W, S.H);
  } else if (kind === 'halftone') {
    if (!T.half) { const c = makeCanvas(14, 14), x = c.getContext('2d'); x.fillStyle = S.pal.ink; x.beginPath(); x.arc(3.5, 3.5, 2.1, 0, 6.3); x.arc(10.5, 10.5, 2.1, 0, 6.3); x.fill(); T.half = c; }
    ctx.globalAlpha = 0.06 + intensity * 0.2; ctx.fillStyle = ctx.createPattern(T.half, 'repeat'); ctx.fillRect(0, 0, S.W, S.H);
  } else if (kind === 'scratches') {
    T.grain = T.grain || noiseTile(256, S.seed);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.1 + intensity * 0.3; ctx.fillStyle = ctx.createPattern(T.grain, 'repeat'); ctx.fillRect(0, 0, S.W, S.H);
    ctx.globalCompositeOperation = 'source-over';
    const r = rng(S.seed + Math.floor(S.tm * 9)); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 2 + intensity * 7; i++) { ctx.globalAlpha = 0.1 + r() * 0.3 * intensity; ctx.lineWidth = 0.6 + r(); const x = r() * S.W, y = r() * S.H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 12, y + 60 + r() * S.H * 0.4); ctx.stroke(); ctx.beginPath(); ctx.arc(r() * S.W, r() * S.H, r() * 2.4, 0, 6.3); ctx.fill(); }
  }
  ctx.restore();
}

/** One frame. `tm` drives motion; `ti` drives the entrance (a still uses a settled entrance). */
function drawFrame(ctx, S, k, tm, ti) {
  const { W, H, pal } = S, sp = S.spec;
  S.tm = tm; S.ti = ti; S.colophonNow = null;
  ctx.setTransform(k, 0, 0, k, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = pal.background; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (sp.motion.entrance === 'drift') { const s = 1.07 - 0.07 * easeOut(ti / (3.2 / S.tempo)); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }
  ctx.save(); (LAYOUT[sp.composition.layout] || LAYOUT.editorial)(ctx, S); ctx.restore();
  if (sp.motif.kind !== 'none' && MOTIF[sp.motif.kind]) {
    ctx.save(); ctx.globalAlpha = 1;
    MOTIF[sp.motif.kind](ctx, S, tm, Math.round(18 + sp.motif.density * 140), pal[sp.motif.color] || pal.accent, 0.25 + sp.motif.speed * 1.5);
    ctx.restore();
  }
  ctx.restore();
  drawTexture(ctx, S);
  const cc = S.colophonNow || S.colophon;
  mono(ctx, S, `Afterimage  ·  № ${pad4(S.meta.no)}  ·  ${dotDate(S.meta.date)}`, S.m, H - S.m * 0.42, { size: 14, color: cc, t0: 1.6 });
  if (S.song) mono(ctx, S, '♪ ' + S.song, S.m, H - S.m * 0.42, { size: 14, color: cc, align: 'right', w: W - 2 * S.m, t0: 1.7, maxW: W * 0.44 });
  // entrance
  const e = sp.motion.entrance, d = e === 'develop' ? 2.8 / S.tempo : e === 'fade' || e === 'drift' ? 1.2 : e === 'slide' ? 1.1 : 0.2;
  if (ti < d) {
    if (e === 'slide') { const u = ease(ti / d); ctx.fillStyle = pal.accent; ctx.fillRect(W * u, 0, W * (1 - u) + 1, H); }
    else if (e === 'cut') { ctx.fillStyle = rgba(pal.surface, 1 - ti / d); ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = rgba(e === 'develop' ? mix(pal.background, pal.surface, 0.5) : pal.background, 1 - ease(ti / d)); ctx.fillRect(0, 0, W, H); }
  }
}

function renderStill(S, pxW) {
  const c = makeCanvas(pxW, pxW * S.H / S.W);
  drawFrame(c.getContext('2d'), S, pxW / S.W, 4, 99);
  return c;
}
const sceneThumb = (S) => { try { return renderStill(S, 460).toDataURL('image/jpeg', 0.74); } catch { return ''; } };

const liveArt = new Set();
/** Attach a scene to a canvas. Animates while visible; honours reduced-motion; returns a controller. */
function mountArtwork(canvas, S, { animate = true, intro = true } = {}) {
  const ctx = canvas.getContext('2d');
  let raf = 0, start = 0, last = 0, visible = true, dead = false;
  canvas.style.aspectRatio = `${S.W} / ${S.H}`;
  canvas.style.setProperty('--ar', (S.W / S.H).toFixed(4));
  const still = !animate || reduceMotion();
  const size = () => {
    const w = canvas.clientWidth || 600, px = Math.min(1500, Math.round(w * Math.min(2, window.devicePixelRatio || 1)));
    if (Math.abs(canvas.width - px) > 2) { canvas.width = px; canvas.height = Math.round(px * S.H / S.W); return true; }
    return false;
  };
  const paintStill = () => { size(); drawFrame(ctx, S, canvas.width / S.W, 4, 99); };
  const frame = (now) => {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden || now - last < 31) return;
    last = now; if (!start) start = now;
    size();
    const t = (now - start) / 1000;
    try { drawFrame(ctx, S, canvas.width / S.W, t, intro ? t : 99); } catch (e) { console.error(e); dead = true; }
  };
  let io = null, ro = null;
  if (still) { paintStill(); if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (size()) paintStill(); }); ro.observe(canvas); } }
  else {
    if (window.IntersectionObserver) { io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '120px' }); io.observe(canvas); }
    paintStill(); raf = requestAnimationFrame(frame);
  }
  const ctl = {
    scene: S,
    stop() { dead = true; cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); liveArt.delete(ctl); },
    replay() { start = 0; },
  };
  liveArt.add(ctl);
  return ctl;
}
const stopAllArt = () => { [...liveArt].forEach((c) => c.stop()); };
