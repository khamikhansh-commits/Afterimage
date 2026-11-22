/* ───────────── utilities ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Tiny hyperscript. Text children are always inserted as text nodes, never as HTML. */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const p in v) el.style.setProperty(p, v[p]);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
/** Заменить содержимое элемента. В отличие от replaceChildren, пропускает null и раскрывает массивы. */
function fill(el, ...kids) { el.replaceChildren(); return append(el, kids); }
/** Inline SVG from a trusted, hard-coded string only. */
function svg(markup, cls) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild;
  if (cls) el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : d));
const str = (v, max = 400) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, label = 'timeout') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))]);

function hashStr(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);

/* ── colour ── */
function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let s = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const toHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const validHex = (hex) => { const c = parseHex(hex); return c ? toHex(c) : null; };
function mix(a, b, t) {
  const A = parseHex(a) || [0, 0, 0], B = parseHex(b) || [0, 0, 0];
  return toHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
function rgba(hex, a) { const c = parseHex(hex) || [0, 0, 0]; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function lum(hex) {
  const c = (parseHex(hex) || [0, 0, 0]).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function ensureContrast(fg, bg, min = 4.5) {
  if (contrast(fg, bg) >= min) return fg;
  const target = lum(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0.15; t <= 1.001; t += 0.1) { const c = mix(fg, target, t); if (contrast(c, bg) >= min) return c; }
  return target;
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh /= 6;
  }
  return [hh * 360, s, l];
}
function hslToHex(hh, s, l) {
  hh = (((hh % 360) + 360) % 360) / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (s === 0) return toHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return toHex([f(p, q, hh + 1 / 3) * 255, f(p, q, hh) * 255, f(p, q, hh - 1 / 3) * 255]);
}
const hsl = (hex) => rgbToHsl(parseHex(hex) || [0, 0, 0]);

/* ── dates ── */
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseISO(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); }
function fmtDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  try { return parseISO(iso).toLocaleDateString('ru-RU', opts).replace(/\s*г\.$/, ''); } catch { return iso; }
}
const dotDate = (iso) => { const d = parseISO(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const pad4 = (n) => String(n || 0).padStart(4, '0');

/* ── images ── */
function makeCanvas(w, hgt) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hgt)); return c; }
function drawScaled(src, maxEdge) {
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  const k = Math.min(1, maxEdge / Math.max(sw, sh));
  const c = makeCanvas(sw * k, sh * k);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function blobToCanvas(blob, maxEdge = 1800) {
  let src = null;
  if (window.createImageBitmap) {
    try { src = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { try { src = await createImageBitmap(blob); } catch { src = null; } }
  }
  if (!src) {
    src = await new Promise((res, rej) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This file could not be read as an image.')); };
      img.src = url;
    });
  }
  const c = drawScaled(src, maxEdge);
  if (src.close) src.close();
  return c;
}
const canvasToBlob = (c, type = 'image/jpeg', q = 0.86) => new Promise((res, rej) => {
  try { c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image.'))), type, q); } catch (e) { rej(e); }
});

/** Dominant colours and tone of a photograph, measured locally in the browser. */
function measureColors(canvas) {
  const s = drawScaled(canvas, 56), d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
  const bins = new Map();
  let L = 0, S = 0, warm = 0, n = 0, R = 0, G = 0, B = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = bins.get(key) || [0, 0, 0, 0];
    e[0] += r; e[1] += g; e[2] += b; e[3]++; bins.set(key, e);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    L += (0.299 * r + 0.587 * g + 0.114 * b) / 255; S += mx ? (mx - mn) / mx : 0; warm += (r - b) / 255; n++;
    R += r; G += g; B += b;
  }
  const ranked = [...bins.values()].map((e) => {
    const c = [e[0] / e[3], e[1] / e[3], e[2] / e[3]], mx = Math.max(...c), mn = Math.min(...c);
    return { c, w: e[3] * (0.35 + (mx ? (mx - mn) / mx : 0)) };
  }).sort((a, b) => b.w - a.w);
  const picked = [];
  for (const r of ranked) {
    if (picked.every((p) => Math.abs(p[0] - r.c[0]) + Math.abs(p[1] - r.c[1]) + Math.abs(p[2] - r.c[2]) > 70)) picked.push(r.c);
    if (picked.length >= 5) break;
  }
  return {
    dominant: picked.map(toHex), average: toHex([R / n, G / n, B / n]),
    brightness: +(L / n).toFixed(2), saturation: +(S / n).toFixed(2), warmth: +(warm / n).toFixed(2),
  };
}

/* ── small UI helpers ── */
let toastTimer = 0;
function toast(msg, action) {
  const host = $('#toast');
  host.replaceChildren(h('span', null, msg));
  if (action) host.append(h('button', { class: 'linkish', onclick: () => { host.hidden = true; action.run(); } }, action.label));
  host.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.hidden = true; }, action ? 9000 : 4200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const isCyrillic = (s) => { const m = (s || '').match(/[Ѐ-ӿ]/g); return !!m && m.length > (s || '').replace(/\s/g, '').length * 0.3; };
