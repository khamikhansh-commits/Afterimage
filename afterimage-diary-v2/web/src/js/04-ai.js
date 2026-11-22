/* ───────────── арт-дирекция ─────────────
   ИИ читает день (слова, снимки, место, погоду, песню) и пишет три варианта оформления.
   Каждый ответ проверяется по полям, прежде чем движок начнёт по нему рисовать.
   Если ИИ недоступен, работает маленький движок по ключевым словам — и прямо об этом говорит. */
const STAGES = ['Читаю ваш день', 'Нахожу его настроение', 'Подбираю цвета и художественное направление', 'Собираю варианты оформления', 'Готовлю предпросмотр'];
const TEMPLATE_NAMES = { film: 'Фотоплёнка', trip: 'Открытка из поездки', page: 'Страница дневника', collage: 'Коллаж настроения', poster: 'Афиша', desk: 'Снимки на столе', arch: 'Окно', filmstrip: 'Киноплёнка', editorial: 'Журнальная полоса', grid: 'Сетка', postcard: 'Открытка' };
const TEMPLATE_HINTS = { film: 'Крупная обложка, остальные кадры в ленте', trip: 'Фото, место, дата и детали поездки', page: 'Заголовок, коллаж, заметка и факты дня', collage: 'Кадры разного размера, палитра и детали', poster: 'Один кадр во весь лист и крупный заголовок', desk: 'Отпечатки с белой рамкой, разложенные от руки', arch: 'Один кадр в арке и много воздуха' };
const RU = {
  format: { portrait: 'вертикальный', square: 'квадрат', landscape: 'горизонтальный' },
  motif: { none: 'без эффекта', leaves: 'листья', petals: 'лепестки', rain: 'дождь', snow: 'снег', bokeh: 'боке', dust: 'пылинки', stars: 'звёзды', lightleak: 'засветка', rays: 'лучи', scan: 'строки экрана', waves: 'волны', fog: 'туман', confetti: 'конфетти', grid: 'сетка' },
  texture: { none: 'без текстуры', grain: 'плёночное зерно', paper: 'бумага', halftone: 'типографский растр', linen: 'холст', scratches: 'царапины плёнки' },
  frame: { none: 'без рамки', white: 'белая рамка', thin: 'тонкая линия' },
  entrance: { develop: 'проявление', fade: 'плавное появление', drift: 'медленный наезд', slide: 'цветная шторка', cut: 'резкая вспышка' },
  transition: { crossfade: 'наплыв', slide: 'сдвиг', cut: 'склейка', flicker: 'мерцание' },
  tempo: { slow: 'медленный', medium: 'средний', fast: 'быстрый' },
  align: { left: 'по левому краю', center: 'по центру', right: 'по правому краю' },
  kase: { sentence: 'обычные буквы', upper: 'прописные', lower: 'строчные' },
};

function pick(v, list, d) {
  const s = String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return d;
  return list.find((x) => x === s) || list.find((x) => s.startsWith(x) || x.startsWith(s)) || d;
}

/** Превращает ответ в полную и безопасную спецификацию. Ничего непроверенного до движка не доходит. */
function normalizeSpec(raw, ctx = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const r = rng(ctx.seed || 1);
  const photoCols = (ctx.photoColors || []).map(validHex).filter(Boolean);
  const e = raw.emotion || {}, d = raw.direction || {}, p = raw.palette || {}, ty = raw.typography || {}, co = raw.composition || {},
    ph = raw.photo || {}, tx = raw.texture || {}, mo = raw.motif || {}, mv = raw.motion || {};

  const background = validHex(p.background) || (photoCols[0] ? mix(photoCols[0], '#F2EFE8', 0.82) : '#ECE9E1');
  const ink = ensureContrast(validHex(p.ink) || (lum(background) > 0.4 ? '#1D1F21' : '#F2EFE8'), background, 5);
  const accent = validHex(p.accent) || photoCols.slice().sort((a, b) => hsl(b)[1] - hsl(a)[1])[0] || '#B5562F';
  const [ah, as, al] = hsl(accent);
  const palette = {
    background, ink,
    surface: validHex(p.surface) || mix(background, lum(background) > 0.4 ? '#FFFFFF' : '#000000', 0.45),
    accent,
    accent2: validHex(p.accent2) || hslToHex(ah + 28, as * 0.7, clamp(al * 0.8, 0.2, 0.7)),
    muted: validHex(p.muted) || mix(ink, background, 0.55),
    names: PALETTE_KEYS.map((k, i) => str(Array.isArray(p.names) ? p.names[i] : '', 28)),
  };
  const dominant = (Array.isArray(e.dominant) ? e.dominant : []).map((x) => (typeof x === 'string' ? { name: x, intensity: 0.6 } : x))
    .filter((x) => x && str(x.name, 28)).slice(0, 5).map((x) => ({ name: str(x.name, 28), intensity: clamp(num(x.intensity, 0.6), 0, 1) }));
  const display = fontOf(ty.display) && fontOf(ty.display).role !== 'body' ? ty.display : pick(ty.display, DISPLAY_KEYS, 'notoserif');
  const body = fontOf(ty.body) && fontOf(ty.body).role !== 'display' ? ty.body : pick(ty.body, BODY_KEYS, 'lora');

  let emblem = null;
  const em = raw.emblem;
  if (em && Array.isArray(em.paths)) {
    const paths = em.paths.filter((s) => typeof s === 'string' && s.length > 3 && s.length <= 900 && /^[MmLlHhVvCcSsQqTtAaZz0-9\s,.\-+eE]+$/.test(s))
      .filter((s) => { try { new Path2D(s); return true; } catch { return false; } }).slice(0, 5);
    if (paths.length) emblem = { subject: str(em.subject, 60), paths };
  }
  return {
    title: str(raw.title, 90).replace(/^["'«“]+|["'»”.]+$/g, '') || 'День без названия',
    caption: str(raw.caption, 320),
    tone: clamp(num(raw.tone, 0), -1, 1),
    emotion: {
      atmosphere: str(e.atmosphere, 260), dominant,
      energy: clamp(num(e.energy, 0.5), 0, 1), valence: clamp(num(e.valence, 0.5), 0, 1), intensity: clamp(num(e.intensity, 0.5), 0, 1),
      context: str(e.context, 160), sensory: (Array.isArray(e.sensory) ? e.sensory : []).map((s) => str(s, 80)).filter(Boolean).slice(0, 6),
    },
    relationship: str(raw.relationship, 420),
    direction: {
      name: str(d.name, 60) || 'Без названия', statement: str(d.statement, 260),
      references: (Array.isArray(d.references) ? d.references : []).map((s) => str(s, 70)).filter(Boolean).slice(0, 5),
      rationale: str(d.rationale, 640),
    },
    palette,
    typography: {
      display, body, weight: clamp(Math.round(num(ty.weight, 400) / 100) * 100, 300, 900), italic: !!ty.italic,
      case: pick(ty.case, ['sentence', 'upper', 'lower'], 'sentence'), tracking: clamp(num(ty.tracking, 0), -0.04, 0.3),
      scale: clamp(num(ty.scale, 1), 0.7, 1.4), note: str(ty.note, 220),
    },
    composition: {
      layout: pick(co.layout, [...LAYOUT_KEYS, ...OLD_LAYOUTS], LAYOUT_KEYS[Math.floor(r() * LAYOUT_KEYS.length)]), format: pick(co.format, FORMATS, 'portrait'),
      align: pick(co.align, ['left', 'center', 'right'], 'left'), titlePlacement: pick(co.titlePlacement, ['top', 'bottom'], 'bottom'),
      tilt: clamp(num(co.tilt, 0.4), 0, 1), note: str(co.note, 220),
    },
    photo: {
      saturation: clamp(num(ph.saturation, 1), 0, 1.6), contrast: clamp(num(ph.contrast, 1), 0.7, 1.5), brightness: clamp(num(ph.brightness, 0), -0.15, 0.15),
      warmth: clamp(num(ph.warmth, 0), -1, 1), fade: clamp(num(ph.fade, 0), 0, 0.5), tint: validHex(ph.tint) || accent,
      tintStrength: clamp(num(ph.tintStrength, validHex(ph.tint) ? 0.12 : 0), 0, 0.5), duotone: clamp(num(ph.duotone, 0), 0, 0.8),
      vignette: clamp(num(ph.vignette, 0.2), 0, 1), softness: clamp(num(ph.softness, 0), 0, 1), frame: pick(ph.frame, FRAMES, 'none'), note: str(ph.note, 220),
    },
    texture: { kind: pick(tx.kind, TEXTURES, 'grain'), intensity: clamp(num(tx.intensity, 0.35), 0, 1), note: str(tx.note, 220) },
    motif: { kind: pick(mo.kind, MOTIFS, 'none'), density: clamp(num(mo.density, 0.4), 0, 1), speed: clamp(num(mo.speed, 0.4), 0, 1), color: pick(mo.color, ['accent', 'accent2', 'ink', 'surface'], 'accent'), note: str(mo.note, 220) },
    motion: { entrance: pick(mv.entrance, ENTRANCES, 'fade'), transition: pick(mv.transition, TRANSITIONS, 'crossfade'), tempo: pick(mv.tempo, TEMPOS, 'medium'), kenBurns: clamp(num(mv.kenBurns, 0.4), 0, 1), note: str(mv.note, 220) },
    emblem,
  };
}

/** Ответ ИИ целиком: общий анализ, порядок кадров, температура, музыка и три варианта. */
function normalizeBrief(raw, ctx, n, by) {
  if (!raw || typeof raw !== 'object') throw { code: 'invalid_json' };
  const shared = { emotion: raw.emotion, relationship: raw.relationship, emblem: raw.emblem, tone: raw.tone };
  const list = Array.isArray(raw.variants) ? raw.variants : raw.palette ? [raw] : [];
  const variants = list.filter((v) => v && typeof v === 'object' && v.palette && v.title).slice(0, 4).map((v, i) => normalizeSpec({ ...v, ...shared }, { ...ctx, seed: (ctx.seed || 1) + i * 7919 }));
  if (!variants.length) throw { code: 'invalid_json' };
  let order = [...new Set((Array.isArray(raw.order) ? raw.order : []).map((x) => Math.round(num(x, 0)) - 1).filter((i) => i >= 0 && i < n))];
  for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
  const cover = clamp(Math.round(num(raw.cover, order[0] + 1)) - 1, 0, Math.max(0, n - 1));
  order = [cover, ...order.filter((i) => i !== cover)];
  return { variants, order, extras: normBriefExtras({ toneSuggested: raw.tone, toneWhy: raw.toneWhy, orderWhy: raw.orderWhy, moodboard: raw.moodboard, music: raw.music, musicBy: by }) };
}

const AI_COPY = {
  not_granted: 'вы не разрешили этой странице обращаться к Claude', sampling_disabled: 'Claude недоступен для этого аккаунта',
  not_declared: 'страница не подключена к Claude', capability_disabled: 'Claude не работает в этом окне', capability_removed: 'Claude не работает в этом окне',
  rate_limited: 'достигнут лимит обращений к ИИ', session_expired: 'сессия Claude закончилась — войдите снова',
  refused: 'ИИ отказался обрабатывать этот текст', empty_completion: 'ИИ ничего не ответил', invalid_json: 'ответ ИИ не удалось прочитать',
  prompt_too_large: 'рассказ слишком длинный для одного запроса', upstream_error: 'соединение с ИИ оборвалось',
  ai_not_configured: 'на сервере не задан ключ ИИ', unauthorized: 'нужно войти в аккаунт', network: 'сервер не отвечает', timeout: 'ИИ не успел ответить',
};

const AI = {
  via: '', sample: null, status: 'pending', limits: null, listeners: new Set(), whenReady: null,
  off: lsGet('afterimage-ai') === 'off', photosAllowed: lsGet('afterimage-ai-photos') !== 'off',
  init() { return this.whenReady || (this.whenReady = this.connect()); },
  /** После входа или выхода состав возможностей меняется. */
  refresh() { this.whenReady = null; this.status = 'pending'; return this.init(); },
  async connect() {
    this.via = ''; this.sample = null;
    const s = await cap('sample');
    if (s) { this.sample = s; this.via = 'claude-app'; try { this.limits = await s.limits(); } catch { this.limits = null; } }
    else if (await Srv.detect() && Srv.user && Srv.config.ai && Srv.config.ai.enabled) this.via = 'server';
    this.set(this.via ? 'ready' : 'absent');
  },
  onChange(fn) { this.listeners.add(fn); fn(this.status); },
  set(status) { this.status = status; this.listeners.forEach((fn) => fn(status)); },
  get live() { return this.status === 'ready' && !this.off; },
  /** Кто на самом деле оформляет: короткая подпись для шапки. */
  badge() { return this.status === 'pending' ? ['Проверяю', 'wait'] : this.off && this.status === 'ready' ? ['ИИ выключен', 'demo'] : this.status === 'ready' ? [this.via === 'server' ? 'ИИ через сервер' : 'Claude подключён', 'live'] : ['Демо-режим', 'demo']; },
  line() {
    if (this.status === 'pending') return 'Проверяю, доступен ли ИИ…';
    if (this.status === 'ready' && this.off) return 'ИИ доступен, но выключен в настройках: записи оформляет встроенный движок по ключевым словам. Это не ИИ.';
    if (this.status === 'ready') return this.via === 'server' ? 'ИИ подключён через сервер приложения. Арт-дирекция настоящая.' : 'Claude подключён. Арт-дирекция настоящая.';
    return RT ? 'Демо-режим. Claude в этом окне недоступен, поэтому записи оформляет встроенный движок по ключевым словам. Он везде подписан, и это не ИИ.'
      : Srv.on ? (Srv.user ? 'Демо-режим. На сервере не задан ключ ИИ, поэтому записи оформляет встроенный движок по ключевым словам. Это не ИИ.' : 'Демо-режим. ИИ на сервере доступен после входа в аккаунт; без входа работает встроенный движок по ключевым словам.')
        : 'Демо-режим. Страница открыта без Claude и без сервера, поэтому записи оформляет встроенный движок по ключевым словам. Это не ИИ.';
  },
  photosNote() {
    if (!this.live) return '';
    if (!this.photosAllowed) return 'Фотографии ИИ не передаются: только текст и измеренные цвета.';
    if (this.via === 'server') return Srv.config.ai.photos ? 'Фотографии передаются ИИ в уменьшенном виде.' : 'Сервер настроен не передавать фотографии: ИИ получает только текст и измеренные цвета.';
    return this.limits && this.limits.images ? 'Фотографии передаются Claude в уменьшенном виде.' : 'В этом окне Claude не принимает изображения: только текст и измеренные цвета.';
  },
};

function partialFromStream(text) {
  const g = (re) => { const m = re.exec(text); if (!m) return ''; try { return JSON.parse('"' + m[1].replace(/\\$/, '') + '"'); } catch { return m[1]; } };
  const pal = /"palette"\s*:\s*\{([^}]*)/.exec(text);
  return {
    atmosphere: g(/"atmosphere"\s*:\s*"((?:[^"\\]|\\.)*)/), direction: g(/"direction"\s*:\s*\{\s*"name"\s*:\s*"((?:[^"\\]|\\.)*)"/),
    colors: pal ? (pal[1].match(/#[0-9a-fA-F]{6}\b/g) || []).slice(0, 6) : [],
    stage: /"variants"\s*:/.test(text) ? 2 : /"atmosphere"\s*:\s*"/.test(text) ? 1 : 0,
  };
}
function looseJson(text) {
  if (typeof text !== 'string') return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
/** Ответ оборвался посреди списка вариантов (кончился лимит длины): оставляем варианты, которые дописаны целиком. */
function salvageBrief(text) {
  if (typeof text !== 'string') return null;
  const at = text.search(/"variants"\s*:\s*\[/), from = text.indexOf('{');
  if (at < 0 || from < 0) return null;
  const start = text.indexOf('[', at), done = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) objStart = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && objStart >= 0) { done.push(text.slice(objStart, i + 1)); objStart = -1; } }
    else if (c === ']' && depth === 0) break;
  }
  if (!done.length) return null;
  try { return JSON.parse(text.slice(from, start + 1) + done.join(',') + ']}'); } catch { return null; }
}
const photoMeta = (photos) => photos.map((p) => ({ w: p.w, h: p.h, colors: { dominant: p.colors.dominant, brightness: p.colors.brightness, saturation: p.colors.saturation, warmth: p.colors.warmth } }));

/** Один запрос к ИИ через тот канал, который есть на самом деле. Возвращает { data, saw }. */
async function aiRequest(kind, { input, photos = [], avoid, note, query, signal, onText }) {
  if (AI.via === 'claude-app') {
    const lim = AI.limits && AI.limits.images, want = kind === 'geo' || !AI.photosAllowed || !lim ? 0 : Math.min(photos.length, lim.maxCount || 1, 6);
    const imgs = [];
    for (let i = 0; i < want; i++) { try { imgs.push(await canvasToBlob(drawScaled(photos[i].canvas, 1024), 'image/jpeg', 0.82)); } catch { /* пропускаем кадр */ } }
    const run = (im) => {
      const prompt = kind === 'brief' ? buildBriefPrompt(input, photos, { seen: im.length, avoid, note }) : kind === 'music' ? buildMusicPrompt(input, photos, { seen: im.length }) : buildGeoPrompt(query);
      const opts = { signal, cache: false };
      if (onText) opts.onText = onText;
      if (im.length) opts.images = im;
      return AI.sample.json(prompt, opts);
    };
    try { return { data: await run(imgs), saw: imgs.length > 0 }; } catch (e) {
      const rescued = e && e.code === 'invalid_json' ? looseJson(e.text) || (kind === 'brief' ? salvageBrief(e.text) : null) : null;
      if (rescued) return { data: rescued, saw: imgs.length > 0 };
      if (e && (e.code === 'images_unavailable' || e.code === 'image_rejected') && imgs.length) return { data: await run([]), saw: false }; // одна попытка без снимков, не цикл
      throw e;
    }
  }
  const images = [];
  if (kind !== 'geo' && AI.photosAllowed && Srv.config.ai.photos) for (const p of photos.slice(0, 6)) { try { images.push(drawScaled(p.canvas, 1024).toDataURL('image/jpeg', 0.82).split(',')[1]); } catch { /* пропускаем кадр */ } }
  const r = await Srv.call('POST', '/api/ai/' + kind, { json: { input, photos: photoMeta(photos), images, avoid: avoid || null, note: note || '' }, signal });
  const data = looseJson(r.text) || (kind === 'brief' ? salvageBrief(r.text) : null);
  if (!data) throw { code: 'invalid_json' };
  return { data, saw: !!r.sawPhotos };
}
function aiFailure(e) {
  const code = (e && e.code) || 'upstream_error';
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) AI.set('denied');
  console.warn('ИИ не ответил:', code, e && e.message);
  return AI_COPY[code] || AI_COPY.upstream_error;
}
const whyNoAI = () => (AI.off && AI.status === 'ready' ? 'ИИ выключен в настройках' : AI.status === 'pending' ? 'ИИ не успел ответить' : RT ? 'Claude в этом окне недоступен' : Srv.on ? (Srv.user ? 'на сервере не задан ключ ИИ' : 'ИИ на сервере доступен после входа') : 'страница открыта без Claude и без сервера');

/**
 * Оформить один день. Возвращает { brief: { variants, order, extras }, engine }.
 * engine.kind равен 'claude' только тогда, когда спецификации действительно написал ИИ.
 */
async function directMemory({ input, photos, signal, onStage = () => {}, onPartial = () => {}, avoid, note }) {
  const seed = hashStr(input.story + input.date + (avoid ? avoid.name : ''));
  const ctx = { seed, photoColors: photos.flatMap((p) => p.colors.dominant) };
  onStage(0);
  if (AI.status === 'pending') await Promise.race([AI.init(), sleep(11000)]);
  if (signal && signal.aborted) throw { code: 'cancelled' };
  let why = whyNoAI();
  if (AI.live) {
    try {
      const { data, saw } = await aiRequest('brief', { input, photos, avoid, note, signal, onText: ({ text }) => { const p = partialFromStream(text); onStage(p.stage); onPartial(p); } });
      const brief = normalizeBrief(data, ctx, photos.length, 'claude');
      onStage(2);
      return { brief, engine: { kind: 'claude', sawPhotos: saw, at: new Date().toISOString(), note: saw ? '' : 'В этот раз ИИ не видел фотографий и работал по рассказу и измеренным цветам.' } };
    } catch (e) {
      if (e && e.code === 'cancelled') throw e;
      why = aiFailure(e);
    }
  }
  // Демо-режим: идёт с паузами, чтобы стадии можно было прочитать; везде подписан как демо.
  const brief = localBrief(input, photos, ctx);
  const first = brief.variants[0];
  for (const s of [0, 1, 2]) {
    if (signal && signal.aborted) throw { code: 'cancelled' };
    onStage(s);
    if (s === 1) onPartial({ atmosphere: first.emotion.atmosphere, colors: [], direction: '' });
    if (s === 2) onPartial({ atmosphere: first.emotion.atmosphere, colors: PALETTE_KEYS.map((k) => first.palette[k]), direction: first.direction.name });
    await sleep(reduceMotion() ? 200 : 850);
  }
  return { brief, engine: { kind: 'local', sawPhotos: false, at: new Date().toISOString(), note: `Собрано в демо-режиме: ${why}.` } };
}

/** Музыка по настроению. Каталог не подключён, поэтому это направления, а не конкретные песни. */
async function suggestMusic({ input, photos, signal }) {
  if (AI.status === 'pending') await Promise.race([AI.init(), sleep(8000)]);
  if (AI.live) {
    try {
      const { data } = await aiRequest('music', { input, photos, signal });
      const music = normBriefExtras({ music: data && data.music }).music;
      if (music.length) return { music, by: 'claude', basis: str(data.basis, 240) };
      throw { code: 'invalid_json' };
    } catch (e) { if (e && e.code === 'cancelled') throw e; return { ...localMusic(input), note: `ИИ не ответил (${aiFailure(e)}), поэтому показаны направления по ключевым словам.` }; }
  }
  return { ...localMusic(input), note: `Подобрано по ключевым словам рассказа, а не ИИ: ${whyNoAI()}.` };
}

/** Поиск места. Сервер ищет в OpenStreetMap; в Claude координаты приблизительные и так и подписаны. */
async function geocode(query, signal) {
  query = str(query, 120);
  if (query.length < 2) return { results: [], source: '' };
  if (Srv.on && Srv.user && Srv.config.geocoder) {
    const r = await Srv.call('GET', '/api/geocode?q=' + encodeURIComponent(query), { signal });
    return { results: cleanGeo(r.results), source: 'osm' };
  }
  if (AI.status === 'pending') await Promise.race([AI.init(), sleep(8000)]);
  if (AI.live && AI.via === 'claude-app') {
    const { data } = await aiRequest('geo', { query, signal });
    return { results: cleanGeo(data && data.results), source: 'claude' };
  }
  throw { code: 'no_geocoder' };
}
const cleanGeo = (list) => (Array.isArray(list) ? list : []).map((x) => ({ name: str(x && x.name, 160), lat: num(x && x.lat, NaN), lon: num(x && x.lon, NaN) })).filter((x) => x.name && isFinite(x.lat) && isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180 && !(x.lat === 0 && x.lon === 0)).slice(0, 5);
const geocoderKind = () => (Srv.on && Srv.user && Srv.config.geocoder ? 'osm' : AI.live && AI.via === 'claude-app' ? 'claude' : '');

/* ───────────── демо-режим: детерминированный движок по ключевым словам ─────────────
   Это не ИИ. Он ищет в рассказе слова восьми настроений, берёт пресет этого настроения
   и подкрашивает его цветами, измеренными на фотографиях. */
const EMO_RU = { nostalgia: 'ностальгия', warmth: 'тепло', tenderness: 'нежность', tension: 'напряжение', exhaustion: 'усталость', focus: 'сосредоточенность', calm: 'покой', openness: 'простор', relief: 'облегчение', joy: 'радость', belonging: 'близость', excitement: 'восторг', melancholy: 'меланхолия', longing: 'тоска', quiet: 'тишина', closeness: 'близость', freedom: 'свобода', awe: 'восхищение', effort: 'усилие', stillness: 'безмолвие', wonder: 'удивление', cold: 'холод', attention: 'внимание', presence: 'присутствие' };
const MOOD_MUSIC = {
  amber: [['мягкий инди-фолк', 'Акустическая гитара и тёплый голос под неторопливый день.', 'soft indie folk acoustic'], ['шансон середины века', 'Ностальгия и осенние бульвары.', 'chanson française classics'], ['лоу-фай джаз', 'Тёплый винил и приглушённое пианино.', 'lofi jazz piano']],
  night: [['ночной синтвейв', 'Пульс города и неоновые огни.', 'night synthwave'], ['эмбиент-техно', 'Ровный ритм для долгой сосредоточенности.', 'ambient techno focus'], ['даунтемпо-электроника', 'Медленный бит для уставшей головы.', 'downtempo electronica late night']],
  water: [['мечтательный эмбиент', 'Много воздуха и почти нет событий.', 'dreamy ambient'], ['неоклассическое фортепиано', 'Редкие ноты и тишина между ними.', 'neoclassical piano calm'], ['босса-нова', 'Лёгкость утра у воды.', 'bossa nova morning']],
  joy: [['диско-фанк', 'Танцевальный грув для громкой радости.', 'disco funk party'], ['инди-поп', 'Яркие припевы, которые поют хором.', 'upbeat indie pop'], ['латинский поп', 'Тёплый ритм и общий танец.', 'latin pop dance']],
  rain: [['дрим-поп', 'Размытые гитары, как дождь на стекле.', 'dream pop rainy'], ['тихий пост-рок', 'Медленное нарастание и негромкая грусть.', 'quiet post-rock'], ['фортепианный минимализм', 'Несколько нот для пустой комнаты.', 'minimal piano melancholy']],
  love: [['соул-баллады', 'Тёплый голос и близость.', 'soul ballads'], ['романтический джаз', 'Саксофон и вечерний свет.', 'romantic jazz'], ['акустический инди', 'Тихие песни для двоих.', 'acoustic indie love songs']],
  trail: [['американа и фолк-рок', 'Дорога, ветер и открытое небо.', 'americana folk rock road trip'], ['пост-рок', 'Широкие гитары для больших пейзажей.', 'post-rock landscapes'], ['инди-рок для дороги', 'Ровный драйв на долгий путь.', 'indie rock driving']],
  winter: [['северный эмбиент', 'Холодный свет и безмолвие.', 'nordic ambient winter'], ['зимний джаз', 'Щётки, контрабас и снег за окном.', 'winter jazz'], ['хоровая музыка', 'Чистые голоса в морозном воздухе.', 'choral winter']],
  plain: [['лоу-фай хип-хоп', 'Спокойный фон для обычного дня.', 'lofi hip hop'], ['инструментальный инди', 'Без слов, чтобы не мешать мыслям.', 'instrumental indie'], ['мягкий джаз', 'Неторопливо и внимательно.', 'soft jazz']],
};
const OLD_TO_NEW = { grid: 'collage', editorial: 'page', postcard: 'trip', filmstrip: 'film' };

function scoreMoods(input) {
  const text = (input.story + ' ' + (input.weather || '') + ' ' + ((input.song && input.song.title) || '') + ' ' + (input.tags || []).join(' ')).toLowerCase();
  const tokens = text.split(/[^a-zа-яё0-9]+/i).filter(Boolean);
  const scores = Object.entries(MOODS).map(([key, m]) => {
    // в found попадают слова так, как они стоят в рассказе, а не основы из словаря
    const found = [...new Set(m.words.map((w) => (w.includes(' ') ? (text.includes(w) ? w : '') : tokens.find((tk) => tk.startsWith(w) && tk.length <= w.length + 5) || '')).filter(Boolean))];
    return { key, m, found, score: found.length };
  }).sort((a, b) => b.score - a.score);
  return { scores, top: scores[0].score > 0 ? scores[0] : scores.find((s) => s.key === 'plain') };
}
function localMusic(input) {
  const { top } = scoreMoods(input);
  return { music: MOOD_MUSIC[top.key].map(([direction, why, query]) => ({ direction, why, query })), by: 'demo', basis: top.found.length ? `Слова рассказа: ${top.found.slice(0, 5).join(', ')}.` : 'В рассказе не нашлось слов с явным настроением, поэтому взяты нейтральные направления.' };
}

function localBrief(input, photos, ctx) {
  const { scores, top } = scoreMoods(input), ru = isCyrillic(input.story) || !input.story.trim();
  const total = Math.max(1, scores.reduce((a, s) => a + s.score, 0)), r = rng(ctx.seed);
  const sat = (ctx.photoColors || []).slice().sort((a, b) => hsl(b)[1] - hsl(a)[1])[0];
  const avg = photos[0] ? photos[0].colors.average : null;
  const exclaim = (input.story.match(/!/g) || []).length;
  const emoName = (n) => (ru ? EMO_RU[n] || n : n);
  const emo = top.key === 'plain' ? top.m.emo.map((n, i) => ({ name: emoName(n), intensity: 0.5 - i * 0.1 }))
    : scores.filter((s) => s.score > 0).slice(0, 4).map((s) => ({ name: emoName(s.m.emo[0]), intensity: clamp(0.35 + s.score / total * 0.6, 0, 1) }));
  const first = input.story.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s/)[0] || '';
  const caption = first.length > 150 ? first.slice(0, 147).replace(/\s\S*$/, '') + '…' : first;
  const tone = typeof input.tempC === 'number' ? clamp((input.tempC - 12) / 25, -1, 1) * 0.6 : clamp(top.m.photo[3] * 0.5, -1, 1);
  const second = scores.find((s) => s.score > 0 && s.key !== top.key);
  const plan = [[top, OLD_TO_NEW[top.m.comp[0]] || top.m.comp[0], top.m.comp[1]]];
  for (const lay of ['film', 'page', 'collage', 'trip']) { if (plan.length >= 3) break; if (!plan.some((p) => p[1] === lay)) plan.push([plan.length === 2 && second ? second : top, lay, 'portrait']); }
  const emotion = {
    atmosphere: top.found.length ? `Пресет «${top.m.ru}» подобран по словам рассказа: ${top.found.slice(0, 5).map((w) => '«' + w + '»').join(', ')}.` : 'В рассказе не нашлось слов с явным настроением, поэтому взят нейтральный пресет.',
    dominant: emo, energy: clamp(top.m.energy + exclaim * 0.03, 0, 1), valence: top.m.valence, intensity: clamp(0.35 + top.score * 0.08 + exclaim * 0.04, 0, 1),
    context: [input.location, input.weather].filter(Boolean).join(' · '), sensory: top.found.slice(0, 6),
  };
  const variants = plan.map(([s, layout, format], i) => {
    const m = s.m, dark = lum(m.pal[0]) < 0.3, titles = ru ? m.titlesRu : m.titles;
    const background = avg ? mix(m.pal[0], mix(avg, dark ? '#000000' : '#FFFFFF', 0.7), 0.3) : m.pal[0];
    return {
      title: titles[(Math.floor(r() * titles.length) + i) % titles.length], caption,
      direction: { name: `${m.ru} · ${TEMPLATE_NAMES[layout]}`, statement: 'Пресет по ключевым словам, подкрашенный цветами ваших фотографий.', references: m.refs,
        rationale: `Это встроенный демо-движок, а не ИИ. Он нашёл в рассказе слова настроения (${s.score} для этого пресета), взял готовую палитру и смешал её с цветами, измеренными на фотографиях. Фотографии и музыку он не понимает.` },
      palette: { background, surface: mix(background, '#FFFFFF', dark ? 0.08 : 0.5), ink: m.pal[2], accent: sat && hsl(sat)[1] > 0.3 ? mix(m.pal[3], sat, 0.45) : m.pal[3], accent2: m.pal[4], muted: m.pal[5], names: [] },
      typography: { display: m.type[0], body: m.type[1], weight: m.type[2], italic: m.type[3], case: m.type[4], tracking: m.type[5], scale: m.type[6] },
      composition: { layout, format, align: m.comp[2], titlePlacement: m.comp[3], tilt: m.comp[4] },
      photo: { saturation: m.photo[0], contrast: m.photo[1], brightness: m.photo[2], warmth: m.photo[3], fade: m.photo[4], tint: m.photo[5], tintStrength: m.photo[6], duotone: m.photo[7], vignette: m.photo[8], softness: m.photo[9], frame: m.photo[10] },
      texture: { kind: m.tex[0], intensity: m.tex[1] }, motif: { kind: m.motif[0], density: m.motif[1], speed: m.motif[2], color: m.motif[3] },
      motion: { entrance: m.motion[0], transition: m.motion[1], tempo: m.motion[2], kenBurns: m.motion[3] },
    };
  });
  return normalizeBrief({
    emotion, relationship: 'Демо-режим не понимает фотографии и музыку. Он только измерил цвета снимков и подмешал их в палитру.',
    cover: 1, order: photos.map((_, i) => i + 1), orderWhy: 'Порядок кадров оставлен вашим: демо-режим не видит, что на снимках.',
    tone, toneWhy: typeof input.tempC === 'number' ? 'Рассчитано по указанной температуре воздуха.' : 'Взято из пресета настроения.',
    music: localMusic(input).music, moodboard: [top.m.ru, input.weather, 'плёнка'].filter(Boolean).join(' ').toLocaleLowerCase(), variants,
  }, ctx, photos.length, 'demo');
}
