/* ───────────── новое воспоминание, изменение записи, студия оформления ───────────── */
const MAX_PHOTOS = 8;
const WEATHERS = ['Ясно', 'Облачно', 'Пасмурно', 'Дождь', 'Снег', 'Туман', 'Ветрено', 'Жара', 'Гроза', 'Холодно и ясно'];
const emptySong = () => ({ mode: 'none', title: '', artist: '', url: '', direction: '', why: '', query: '', by: '' });
const emptyDraft = () => ({ id: null, story: '', date: todayISO(), location: '', geo: null, weather: '', tempC: '', tags: '', song: emptySong(), audio: null, keepAudio: null, dropAudio: [], photos: [], removedRefs: [], cols: new Set(), sug: null });
const noSubmit = (e) => { if (e.key === 'Enter') e.preventDefault(); };
const photoThumbUrl = (c) => { try { return drawScaled(c, 420).toDataURL('image/jpeg', 0.8); } catch { return ''; } };

function ensureDraft() {
  if (!App.draft) {
    let s = {};
    try { s = JSON.parse(lsGet('afterimage-draft') || '{}') || {}; } catch { s = {}; }
    const d = emptyDraft();
    d.story = typeof s.story === 'string' ? s.story.slice(0, 12000) : '';
    d.location = str(s.location, 80); d.weather = str(s.weather, 40); d.tags = str(s.tags, 200);
    Object.assign(d.song, { title: str(s.title, 120), artist: str(s.artist, 120), url: str(s.url, 500) });
    d.song.mode = d.song.url ? 'link' : d.song.title || d.song.artist ? 'manual' : 'none';
    App.draft = d;
  }
  if (App.presetDate) { App.draft.date = App.presetDate; App.presetDate = ''; }
  return App.draft;
}
/** Черновик новой записи переживает перезагрузку только текстом: фотографии в браузере не копятся. */
function saveDraftText(D) { if (D && D === App.draft) lsSet('afterimage-draft', JSON.stringify({ story: D.story, location: D.location, weather: D.weather, tags: D.tags, title: D.song.title, artist: D.song.artist, url: D.song.url })); }
/** Образец дня заполняет форму. В дневник он попадёт, только если человек сам его сохранит. */
function loadSampleDay(key) {
  const day = SAMPLE_DAYS.find((d) => d.key === key);
  if (!day) return;
  const d = emptyDraft();
  Object.assign(d, { story: day.story, location: day.location, weather: day.weather, tempC: String(day.tempC), tags: day.tags.join(', ') });
  Object.assign(d.song, { mode: 'manual', title: day.song.title, artist: day.song.artist });
  d.photos = day.photos.map((k) => { const c = samplePhoto(k); return { id: newId(), canvas: c, blob: null, url: photoThumbUrl(c), colors: measureColors(c), sample: k, ref: { k: 's', key: k }, caption: '' }; });
  App.draft = d; saveDraftText(d);
}

/* ── снимки сохранённой записи ── */
const rememberCanvases = (id, canvases) => { App.canvasCache.delete(id); App.canvasCache.set(id, canvases); while (App.canvasCache.size > 3) App.canvasCache.delete(App.canvasCache.keys().next().value); };
function missingCanvas(p) {
  const k = 700 / Math.max(p.w, p.h), c = makeCanvas(p.w * k, p.h * k), x = c.getContext('2d');
  x.fillStyle = '#8D8F8B'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2;
  for (let i = -c.height; i < c.width; i += 26) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + c.height, c.height); x.stroke(); }
  c.dataset.missing = '1';
  return c;
}
async function memoryCanvases(mem) {
  if (App.canvasCache.has(mem.id) && App.canvasCache.get(mem.id).length === Math.max(1, mem.photos.length)) return App.canvasCache.get(mem.id);
  const out = [];
  for (const p of mem.photos) {
    let c = null;
    try {
      if (p.ref && p.ref.k === 's') c = samplePhoto(SAMPLE_KEYS.includes(p.ref.key) ? p.ref.key : 'shore');
      else if (p.ref) c = await Store.photoCanvas(p.ref);
    } catch { c = null; }
    out.push(c || missingCanvas(p));
  }
  if (!out.length) out.push(missingCanvas({ w: 4, h: 3 }));
  rememberCanvases(mem.id, out);
  return out;
}
async function draftFromMemory(mem) {
  const cs = await memoryCanvases(mem), d = emptyDraft(), s = mem.song;
  Object.assign(d, { id: mem.id, story: mem.story, date: mem.date, location: mem.location, geo: mem.geo ? { ...mem.geo } : null, weather: mem.weather, tempC: mem.tempC == null ? '' : String(mem.tempC), tags: mem.tags.join(', ') });
  if (s) {
    Object.assign(d.song, { title: s.title, artist: s.artist, url: s.url, direction: s.direction, why: s.why, query: s.query, by: s.by });
    d.song.mode = s.url ? 'link' : s.title || s.artist ? 'manual' : s.direction ? 'vibe' : 'none';
    d.keepAudio = s.audio ? { ...s.audio } : null;
  }
  d.photos = mem.photos.map((p, i) => {
    const c = cs[i], missing = !!c.dataset.missing;
    return { id: newId(), canvas: c, blob: null, url: photoThumbUrl(c), colors: missing ? { dominant: p.colors, average: p.colors[0] || '#888888', brightness: 0.5, saturation: 0.3, warmth: 0 } : measureColors(c),
      sample: p.ref && p.ref.k === 's' ? p.ref.key : null, ref: p.ref, caption: p.caption || '', fx: p.fx, fy: p.fy, zoom: p.zoom, missing, w: p.w, h: p.h };
  });
  const docs = await Store.load();
  d.cols = new Set([...docs.col.values()].filter((c) => c.items.includes(mem.id)).map((c) => c.id));
  return d;
}

/* ── из черновика в запись ── */
const photoDoc = (p) => ({ ref: p.ref || null, w: p.missing ? p.w : p.canvas.width, h: p.missing ? p.h : p.canvas.height, colors: p.colors.dominant, caption: str(p.caption, 90), ...(p.fx != null || p.fy != null || (p.zoom && p.zoom !== 1) ? { fx: clamp(num(p.fx, 0.5), 0, 1), fy: clamp(num(p.fy, 0.5), 0, 1), zoom: clamp(num(p.zoom, 1), 1, 3) } : {}) });
function draftSong(D) {
  const s = D.song;
  const base = s.mode === 'link' ? { url: safeUrl(s.url), title: s.title, artist: s.artist } : s.mode === 'manual' ? { title: s.title, artist: s.artist } : s.mode === 'vibe' && s.direction ? { direction: s.direction, why: s.why, query: s.query, by: s.by } : {};
  return normSong({ ...base, audio: D.keepAudio || null }) || (D.audio ? { title: '', artist: '', url: '', direction: '', why: '', query: '', by: '', audio: null } : null);
}
function applyDraftFields(mem, D) {
  const t = String(D.tempC == null ? '' : D.tempC).trim().replace(',', '.').replace('−', '-');
  return Object.assign(mem, { story: D.story.trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(D.date) ? D.date : todayISO(), location: str(D.location, 80), geo: normGeo(D.geo), weather: str(D.weather, 40),
    tempC: t !== '' && isFinite(+t) ? clamp(Math.round(+t), -90, 60) : null, tags: normTags(D.tags), song: draftSong(D) });
}
const dayInput = (m, newAudio) => ({ story: m.story, date: m.date, location: m.location, weather: m.weather, tempC: m.tempC, tags: m.tags, song: m.song ? { title: m.song.title, artist: m.song.artist, url: m.song.url, hasAudio: !!(m.song.audio || newAudio) } : null });
const aiPhotosOf = (list) => list.map((p) => ({ canvas: p.canvas, colors: p.colors, w: p.canvas.width, h: p.canvas.height }));
const avoidOf = (sp) => ({ name: sp.direction.name, layout: sp.composition.layout, display: sp.typography.display, background: sp.palette.background, accent: sp.palette.accent, motif: sp.motif.kind });
const explain = (e) => (e && e.code === 'quota_exceeded' ? 'Хранилище дневника заполнено. Удалите что-нибудь ненужное и попробуйте ещё раз.' : e && e.status && e.message ? e.message : 'Что-то пошло не так. Ничего не потеряно — попробуйте ещё раз.');
async function applyCollections(memId, sel) {
  const d = await Store.load();
  for (const c of [...d.col.values()]) {
    const has = c.items.includes(memId), want = sel.has(c.id);
    if (has === want) continue;
    c.items = want ? [...c.items, memId] : c.items.filter((x) => x !== memId);
    if (!want && c.cover === memId) c.cover = '';
    await Store.saveCollection(c);
  }
}
/** После успешного сохранения: убрать старый аудиофайл, если его заменили или удалили. */
function dropOldAudio(D) { for (const a of D.dropAudio.splice(0)) { if (a.ref) Store._delBlob(a.ref); else if (a.key && !(D.audio && Store.mode !== 'server')) IDB.del('blobs', a.key); } }
function releaseDraft(D) { D.photos.forEach((p) => { if (p.blob && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url); }); if (D.audio) URL.revokeObjectURL(D.audio.url); }

/** Перетаскивание для смены порядка: handle тянут, на row бросают. */
function dragSort(handle, row, id, state, onDrop) {
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => { state.id = id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* некоторые браузеры */ } row.classList.add('dragging'); });
  handle.addEventListener('dragend', () => { state.id = null; row.classList.remove('dragging'); });
  row.addEventListener('dragover', (e) => { if (state.id && state.id !== id) { e.preventDefault(); row.classList.add('target'); } });
  row.addEventListener('dragleave', () => row.classList.remove('target'));
  row.addEventListener('drop', (e) => { if (!state.id) return; e.preventDefault(); row.classList.remove('target'); onDrop(state.id, id); });
}

/** Выбор коллекций для записи. Сам ничего не добавляет: подсказка по месту ждёт нажатия. */
function collectionPicker(sel, getPlace, memId) {
  const host = h('div', { class: 'col-pick' });
  const draw = async () => {
    let cols, d;
    try { cols = await Store.collections(); d = await Store.load(); } catch { return fill(host, h('p', { class: 'fine' }, 'Коллекции сейчас не открылись. Запись можно добавить в коллекцию позже.')); }
    const place = str(getPlace(), 80).toLocaleLowerCase();
    const hint = place ? cols.find((c) => !sel.has(c.id) && c.items.some((mid) => { const m = d.mem.get(mid); return m && mid !== memId && m.location.toLocaleLowerCase() === place; })) : null;
    const name = h('input', { type: 'text', class: 'field', id: 'newColName', maxlength: 80, placeholder: 'Название новой коллекции', 'aria-label': 'Название новой коллекции' });
    const add = btn('Создать', async () => {
      const t = str(name.value, 80);
      if (!t) return name.focus();
      add.disabled = true;
      try { const c = await Store.saveCollection(newCollection({ title: t })); sel.add(c.id); toast(`Коллекция «${t}» создана.`); draw(); } catch (e) { console.error(e); add.disabled = false; toast('Коллекцию не удалось создать.'); }
    }, 'small');
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } });
    fill(host, 
      cols.length ? h('ul', { class: 'check-list' }, cols.map((c) => { const cb = h('input', { type: 'checkbox', id: 'col-' + c.id, checked: sel.has(c.id), onchange: () => { if (cb.checked) sel.add(c.id); else sel.delete(c.id); } }); return h('li', null, cb, h('label', { for: 'col-' + c.id }, h('span', null, c.title), h('span', { class: 'mono' }, plural(c.items.length, F_REC)))); }))
        : h('p', { class: 'fine' }, 'Коллекций пока нет. Первую можно создать прямо здесь.'),
      hint ? h('p', { class: 'hint-row' }, h('span', null, `В коллекции «${hint.title}» уже есть записи из этого места.`), btn('Добавить и эту', () => { sel.add(hint.id); draw(); }, 'small')) : null,
      h('div', { class: 'row-add' }, name, add));
  };
  draw();
  return { el: host, refresh: draw };
}

/* ── место: название, поиск, метка вручную ── */
function placeBlock(D, changed) {
  const name = h('input', { type: 'text', id: 'location', class: 'field', maxlength: 80, placeholder: 'Город, парк, кафе…', autocomplete: 'off' });
  name.value = D.location;
  const status = h('p', { class: 'fine', role: 'status' }), results = h('div', { class: 'geo-results' }), mapHost = h('div', { class: 'geo-map', hidden: true }), state = h('div', { class: 'geo-state' });
  let map = null, ctl = null;
  const setGeo = (g, note) => { D.geo = g; results.replaceChildren(); status.textContent = note || ''; if (map) map.set({ pin: g }); paint(); changed(); };
  const openMap = () => {
    if (!map) {
      map = createMap({ pick: (lat, lon) => setGeo({ lat: +lat.toFixed(5), lon: +lon.toFixed(5), src: 'pin', label: '' }, 'Метка поставлена вручную.'), pin: D.geo, label: 'Карта: выберите место' });
      App.cleaners.push(() => map.destroy());
      fill(mapHost, map.el, h('p', { class: 'fine' }, 'Нажмите на карту, чтобы поставить метку, или приблизьте нужное место и нажмите «Метка в центре». Карта схематичная, города на ней не подписаны: точнее всего работает поиск по названию.'));
    }
    mapHost.hidden = false;
    if (D.geo) map.focus(D.geo.lat, D.geo.lon, 3); else map.fit();
    paint();
  };
  const search = async () => {
    const q = str(name.value, 120);
    if (q.length < 2) { status.textContent = 'Сначала напишите название места.'; return name.focus(); }
    if (ctl) ctl.abort();
    ctl = new AbortController();
    findBtn.disabled = true; status.textContent = 'Ищу…'; results.replaceChildren();
    try {
      const r = await geocode(q, ctl.signal);
      if (!r.results.length) status.textContent = 'Ничего не нашлось. Уточните название или поставьте метку вручную.';
      else {
        status.textContent = r.source === 'claude' ? 'Координаты подсказал Claude по названию: они приблизительные и могут быть неточными. Выберите вариант и проверьте метку на карте.' : 'Найдено в OpenStreetMap. Выберите нужный вариант.';
        fill(results, ...r.results.map((x) => h('button', { type: 'button', class: 'geo-hit', onclick: () => { setGeo({ lat: x.lat, lon: x.lon, src: r.source === 'osm' ? 'search' : 'ai', label: x.name }, r.source === 'claude' ? 'Метка стоит приблизительно. Её можно поправить на карте.' : 'Метка поставлена по результату поиска.'); openMap(); } },
          h('strong', null, x.name), h('span', { class: 'mono' }, fmtCoord(x.lat, x.lon)))));
      }
    } catch (e) {
      if (e && e.code === 'cancelled') return;
      status.textContent = e && e.code === 'no_geocoder' ? `Поиск по названию сейчас недоступен: ${RT ? 'Claude в этом окне не отвечает' : Srv.on ? (Srv.user ? 'на сервере он не включён' : 'он работает после входа в аккаунт') : 'страница открыта без сервера'}. Метку можно поставить вручную.`
        : (e && e.status && e.message) || 'Поиск не ответил. Попробуйте ещё раз или поставьте метку вручную.';
    } finally { findBtn.disabled = false; }
  };
  const findBtn = btn('Найти на карте', search, 'small'), pinBtn = btn('Поставить метку вручную', openMap, 'small');
  name.addEventListener('input', () => { D.location = name.value; changed(); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  function paint() {
    const g = D.geo;
    fill(state, g ? h('p', { class: 'geo-line' }, h('span', { class: 'mono' }, 'Метка: ' + fmtCoord(g.lat, g.lon)), h('span', { class: 'fine' }, g.src === 'ai' ? 'приблизительно, по подсказке ИИ' : g.src === 'search' ? 'по поиску в OpenStreetMap' : 'поставлена вручную'),
      btn('Убрать метку', () => setGeo(null, 'Метка убрана. Название места осталось в записи.'), 'small')) : h('p', { class: 'fine' }, 'Метки на карте нет. Местоположение устройства приложение не запрашивает: место указываете только вы.'));
    pinBtn.textContent = g ? 'Поправить метку на карте' : 'Поставить метку вручную';
    pinBtn.hidden = !mapHost.hidden;
  }
  paint();
  return h('div', { class: 'place' }, h('div', { class: 'f' }, h('label', { class: 'mono', for: 'location' }, 'Место (необязательно)'), name), h('div', { class: 'actions' }, findBtn, pinBtn), status, results, state, mapHost);
}

/* ── музыка: ссылка, название вручную или подбор по настроению; плюс свой аудиофайл ── */
function musicBlock(D, getInput, changed) {
  const S = D.song, body = h('div', { class: 'music-body' }), audioBox = h('div', { class: 'audio-box' });
  const MODES = [['none', 'Без музыки'], ['link', 'Ссылка'], ['manual', 'Название'], ['vibe', 'По настроению']];
  const tabs = h('div', { class: 'tabs seg', role: 'group', 'aria-label': 'Как добавить музыку' }, MODES.map(([k, label]) => h('button', { type: 'button', dataset: { k }, onclick: () => { S.mode = k; paint(); changed(); } }, label)));
  const inp = (id, key, ph, max = 120) => {
    const el = h('input', { type: 'text', id, class: 'field', placeholder: ph, maxlength: max, autocomplete: 'off' });
    if (key === 'url') el.setAttribute('inputmode', 'url');
    el.value = S[key] || '';
    el.addEventListener('input', () => { S[key] = el.value; changed(); if (key === 'url') preview(); });
    el.addEventListener('keydown', noSubmit);
    return el;
  };
  const card = h('div', { class: 'link-preview' });
  const preview = debounce(() => {
    const raw = S.url.trim();
    fill(card, !raw ? h('p', { class: 'fine' }, 'Вставьте ссылку на трек, альбом или плейлист: Spotify, YouTube, Apple Music, Яндекс Музыка, SoundCloud и другие сервисы. Ссылка остаётся ссылкой: музыка не скачивается и сама не включается.')
      : linkCard(raw) || h('p', { class: 'form-error' }, 'Это не похоже на ссылку. В запись она не попадёт.'));
  }, 250);
  const titleRow = () => h('div', { class: 'row2' }, field('songTitle', 'Название', inp('songTitle', 'title', 'Название песни')), field('songArtist', 'Исполнитель', inp('songArtist', 'artist', 'Исполнитель')));
  const vibeStatus = h('p', { class: 'fine', role: 'status' });
  let vibeCtl = null;
  async function runVibe(b) {
    const input = getInput();
    if (input.story.trim().length < 12) { vibeStatus.textContent = 'Сначала напишите несколько предложений о дне: пока подбирать не из чего.'; return; }
    if (vibeCtl) vibeCtl.abort();
    vibeCtl = new AbortController();
    b.disabled = true; vibeStatus.textContent = AI.live ? 'ИИ читает рассказ и подбирает направления…' : 'Подбираю по ключевым словам…';
    try { D.sug = await suggestMusic({ input, photos: aiPhotosOf(D.photos.filter((p) => !p.missing)), signal: vibeCtl.signal }); vibeStatus.textContent = ''; paint(); }
    catch (e) { if (!(e && e.code === 'cancelled')) vibeStatus.textContent = 'Подобрать не получилось. Попробуйте ещё раз.'; }
    finally { b.disabled = false; }
  }
  function paint() {
    $$('button', tabs).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === S.mode)));
    if (S.mode === 'none') fill(body, h('p', { class: 'fine' }, 'Музыка необязательна. Её можно добавить и позже, когда будете менять запись.'));
    else if (S.mode === 'link') { fill(body, field('songUrl', 'Ссылка на песню', inp('songUrl', 'url', 'https://…', 500)), card, titleRow(), h('p', { class: 'fine' }, 'Название и исполнителя можно дописать вручную: по ссылке приложение их не узнаёт, потому что к каталогам сервисов оно не подключено.')); preview(); }
    else if (S.mode === 'manual') fill(body, titleRow(), h('p', { class: 'fine' }, 'Название сохранится в записи как текст. Послушать песню можно будет по ссылкам на поиск в музыкальных сервисах.'));
    else {
      const go4 = btn(D.sug ? 'Подобрать заново' : 'Подобрать музыку по настроению', () => runVibe(go4), 'small solid');
      fill(body, h('p', { class: 'fine' }, AI.live ? 'ИИ прочитает рассказ, место, погоду и предложит музыкальные направления с объяснением.' : `Сейчас подбор работает по ключевым словам рассказа, а не через ИИ: ${whyNoAI()}.`), h('div', { class: 'actions' }, go4), vibeStatus,
        S.direction ? h('p', { class: 'picked-dir' }, h('span', { class: 'mono' }, 'Выбрано'), ' ', cap1(S.direction), ' ', btn('Убрать', () => { Object.assign(S, { direction: '', why: '', query: '', by: '' }); paint(); changed(); }, 'small')) : null,
        D.sug ? [D.sug.basis ? h('p', { class: 'fine' }, D.sug.basis) : null, D.sug.note ? h('p', { class: 'fine' }, D.sug.note) : null,
          directionsList(D.sug.music, { by: D.sug.by, picked: S.direction, onPick: (d) => { Object.assign(S, { direction: d.direction, why: d.why, query: d.query, by: D.sug.by }); paint(); changed(); } })] : null);
    }
  }
  /* свой аудиофайл */
  const audioIn = h('input', { type: 'file', id: 'audioFile', accept: 'audio/*', class: 'sr' });
  const whereAudio = () => (Store.mode === 'server' ? 'Файл загрузится на сервер вместе с записью и будет играть только внутри неё.' : Store.mode === 'cloud' ? 'Файл останется в этом браузере: в хранилище Claude аудио не загружается, на другом устройстве его не будет.' : 'Файл останется в этом браузере.');
  function drawAudio() {
    if (D.audio) {
      const player = h('audio', { controls: true, preload: 'metadata', src: D.audio.url });
      return fill(audioBox, player, h('div', { class: 'audio-meta' }, h('span', { class: 'mono' }, str(D.audio.name, 60)), h('button', { type: 'button', class: 'linkish', onclick: () => { URL.revokeObjectURL(D.audio.url); D.audio = null; drawAudio(); changed(); } }, 'Убрать файл')));
    }
    if (D.keepAudio) return fill(audioBox, h('div', { class: 'audio-meta' }, h('span', { class: 'mono' }, '♪ ' + (str(D.keepAudio.name, 60) || 'аудиофайл')), h('span', { class: 'fine' }, 'уже прикреплён к записи'),
      h('button', { type: 'button', class: 'linkish', onclick: () => { D.dropAudio.push(D.keepAudio); D.keepAudio = null; drawAudio(); changed(); } }, 'Убрать файл')), h('label', { class: 'btn small', for: 'audioFile' }, 'Заменить файл'));
    fill(audioBox, h('label', { class: 'btn small', for: 'audioFile' }, 'Прикрепить аудиофайл'), h('span', { class: 'fine' }, 'Необязательно. ' + whereAudio() + ' Сам он не включается.'));
  }
  audioIn.addEventListener('change', () => {
    const f = audioIn.files[0]; audioIn.value = '';
    if (!f) return;
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i.test(f.name)) return toast('Это не аудиофайл.');
    const max = (Store.mode === 'server' && Srv.config && Srv.config.limits && num(Srv.config.limits.audioMb, 0) > 0 ? Srv.config.limits.audioMb : 40) * 1048576;
    if (f.size > max) return toast(`Можно прикрепить аудио до ${fmtSize(max)}.`);
    if (D.audio) URL.revokeObjectURL(D.audio.url);
    if (D.keepAudio) { D.dropAudio.push(D.keepAudio); D.keepAudio = null; }
    D.audio = { blob: f, name: f.name, url: URL.createObjectURL(f) };
    drawAudio(); changed();
  });
  paint(); drawAudio();
  Store.ready().then(() => { if (!D.audio && !D.keepAudio && audioBox.isConnected) drawAudio(); });
  return h('fieldset', null, h('legend', { class: 'mono' }, 'Музыка дня (необязательно)'), tabs, body, audioIn, audioBox);
}

/* ── форма записи ── */
async function viewCreate(id) {
  const root = view(); root.className = 'create';
  let mem = null, D;
  if (id) {
    fill(root, h('div', { class: 'wrap' }, h('p', { class: 'loading mono' }, 'Открываю запись…')));
    try { mem = await Store.get(id); } catch { mem = null; }
    if (location.hash !== '#edit-' + id) return;
    if (!mem) return fill(root, h('div', { class: 'wrap' }, emptyState('Этой записи нет в дневнике.', 'Возможно, её удалили или она сохранена в другом браузере.', h('a', { class: 'btn', href: '#diary' }, 'Вернуться в дневник'))));
    if (!App.edit || App.edit.id !== id) {
      try { App.edit = await draftFromMemory(mem); } catch (e) { console.error(e); return fill(root, h('div', { class: 'wrap' }, emptyState('Запись не удалось открыть для изменения.', 'Попробуйте ещё раз.', h('a', { class: 'btn', href: '#m-' + id }, 'Вернуться к записи')))); }
      if (location.hash !== '#edit-' + id) return;
    }
    D = App.edit;
  } else D = ensureDraft();

  const words = h('span', { class: 'mono' }), err = h('p', { class: 'form-error', role: 'alert' }), grid = h('div', { class: 'photo-grid' });
  const changed = () => saveDraftText(D);
  const story = h('textarea', { id: 'story', class: 'story-input', rows: 11, maxlength: 12000, placeholder: 'Что произошло и каким был этот день? Пишите так, как рассказали бы другу: погода, звуки, о чём думали.' });
  story.value = D.story;
  const count = () => { const n = (story.value.trim().match(/\S+/g) || []).length; words.textContent = plural(n, F_WORD); };
  story.addEventListener('input', () => { D.story = story.value; count(); changed(); });
  const text = (elId, key, ph, max, extra = {}) => { const el = h('input', { type: 'text', id: elId, class: 'field', placeholder: ph, maxlength: max, autocomplete: 'off', ...extra }); el.value = D[key] == null ? '' : D[key]; el.addEventListener('input', () => { D[key] = el.value; changed(); }); el.addEventListener('keydown', noSubmit); return el; };
  const date = h('input', { type: 'date', id: 'date', class: 'field', max: todayISO() });
  date.value = D.date;
  date.addEventListener('change', () => { D.date = /^\d{4}-\d{2}-\d{2}$/.test(date.value) ? date.value : todayISO(); });

  /* фотографии */
  const fileIn = h('input', { type: 'file', id: 'photoFiles', accept: 'image/*', multiple: true, class: 'sr' });
  const drop = h('label', { class: 'drop', for: 'photoFiles' }, h('strong', null, 'Добавить фотографии'), h('span', null, `Перетащите сюда или выберите файлы. До ${MAX_PHOTOS} снимков; первый станет обложкой.`));
  async function addFiles(files) {
    for (const f of [...files].filter((x) => x && x.size)) {
      if (D.photos.length >= MAX_PHOTOS) { toast(`В одной записи до ${MAX_PHOTOS} фотографий.`); break; }
      try {
        const canvas = await blobToCanvas(f, 1600), blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
        D.photos.push({ id: newId(), canvas, blob, url: URL.createObjectURL(blob), colors: measureColors(canvas), sample: null, ref: null, caption: '' });
        drawPhotos();
      } catch { toast(`«${str(f.name, 40)}» не получилось прочитать как изображение. Снимки HEIC сначала нужно сохранить как JPEG.`); }
    }
    err.textContent = '';
  }
  fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  const dragState = { id: null };
  const move = (from, to) => { if (from < 0 || to < 0 || to >= D.photos.length || from === to) return; D.photos.splice(to, 0, D.photos.splice(from, 1)[0]); drawPhotos(); };
  function drawPhotos() {
    fill(grid, ...D.photos.map((p, i) => {
      const n = i + 1;
      const el = h('div', { class: 'ph' + (i === 0 ? ' cover' : ''), dataset: { id: p.id } },
        p.url ? h('img', { src: p.url, alt: `Фотография ${n}${p.sample ? ' (образец)' : ''}`, draggable: false }) : null,
        i === 0 ? h('span', { class: 'mono ph-tag' }, 'Обложка') : null, p.sample ? h('span', { class: 'mono ph-tag sample' }, 'Образец') : p.missing ? h('span', { class: 'mono ph-tag sample' }, 'Нет на этом устройстве') : null,
        h('div', { class: 'ph-tools' },
          i > 0 ? h('button', { type: 'button', 'aria-label': `Сделать фотографию ${n} обложкой`, title: 'Сделать обложкой', onclick: () => move(i, 0) }, '★') : null,
          h('button', { type: 'button', 'aria-label': `Передвинуть фотографию ${n} раньше`, title: 'Раньше', disabled: i === 0, onclick: () => move(i, i - 1) }, '←'),
          h('button', { type: 'button', 'aria-label': `Передвинуть фотографию ${n} позже`, title: 'Позже', disabled: i === D.photos.length - 1, onclick: () => move(i, i + 1) }, '→'),
          h('button', { type: 'button', 'aria-label': `Убрать фотографию ${n}`, title: 'Убрать', onclick: () => { const [gone] = D.photos.splice(i, 1); if (gone.ref && gone.ref.k !== 's') D.removedRefs.push(gone.ref); if (gone.blob) URL.revokeObjectURL(gone.url); drawPhotos(); } }, '×')));
      dragSort(el, el, p.id, dragState, (a, b) => move(D.photos.findIndex((q) => q.id === a), D.photos.findIndex((q) => q.id === b)));
      return el;
    }));
    grid.hidden = !D.photos.length;
  }

  const picker = collectionPicker(D.cols, () => D.location, D.id);
  const check = () => {
    const problems = [];
    if (D.story.trim().length < 12) problems.push('Сначала напишите несколько предложений о дне.');
    if (!D.photos.length) problems.push('Добавьте хотя бы одну фотографию.');
    err.textContent = problems.join(' ');
    if (problems.length) { (D.story.trim().length < 12 ? story : drop).scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); if (D.story.trim().length < 12) story.focus(); }
    return !problems.length;
  };
  const submit = h('button', { type: 'submit', class: 'btn mark big' }, mem ? 'Сохранить и переоформить' : 'Оформить воспоминание');
  const keep = mem ? btn('Сохранить изменения', async () => {
    if (!check()) return;
    keep.disabled = true; submit.disabled = true; keep.textContent = 'Сохраняю…';
    try { await saveEdit(D, mem); } catch (e) { console.error(e); err.textContent = explain(e); keep.disabled = false; submit.disabled = false; keep.textContent = 'Сохранить изменения'; }
  }, 'solid big') : null;
  const form = h('form', { id: 'createForm', novalidate: true, class: 'create-form' },
    h('div', { class: 'col-story' },
      h('label', { class: 'mono', for: 'story' }, 'День своими словами'), story, words,
      h('div', { class: 'row3' }, field('date', 'Дата', date),
        field('weather', 'Погода (необязательно)', text('weather', 'weather', 'Холодно и ясно', 40, { list: 'weatherList' })),
        field('tempC', 'Температура, °C', text('tempC', 'tempC', '−3', 6, { inputmode: 'text' }))),
      h('datalist', { id: 'weatherList' }, WEATHERS.map((w) => h('option', { value: w }))),
      placeBlock(D, changed),
      field('tags', 'Метки (необязательно)', text('tags', 'tags', 'поездка, семья, осень', 200), 'Через запятую. По меткам запись находится в поиске.')),
    h('div', { class: 'col-media' },
      h('fieldset', null, h('legend', { class: 'mono' }, 'Фотографии'), fileIn, drop, grid, h('p', { class: 'fine' }, 'Порядок меняется перетаскиванием или стрелками, звёздочка делает снимок обложкой. Кадрирование и подписи — на следующем шаге.')),
      musicBlock(D, () => applyDraftFields({}, D), changed),
      h('fieldset', null, h('legend', { class: 'mono' }, 'Коллекции (необязательно)'), picker.el)),
    h('div', { class: 'create-foot' }, err, h('div', { class: 'foot-row' },
      h('div', null, h('p', { class: 'fine', 'data-engine-line': '' }, AI.line()), h('p', { class: 'fine', id: 'photosNote' }, AI.photosNote())),
      h('div', { class: 'actions' }, mem ? h('a', { class: 'btn', href: '#m-' + mem.id, onclick: () => { App.edit = null; } }, 'Отмена') : null, keep, submit))));
  form.addEventListener('submit', (e) => { e.preventDefault(); if (check()) generateFromDraft(D, mem); });
  fill(root, h('div', { class: 'wrap' },
    mem ? h('p', { class: 'crumb' }, h('a', { class: 'mono', href: '#m-' + mem.id }, '← К записи')) : null,
    pageHead(mem ? `Запись № ${pad4(mem.no)}` : 'Новое воспоминание', mem ? 'Изменить запись' : 'Каким был этот день?', mem ? '«Сохранить изменения» оставит оформление прежним. «Сохранить и переоформить» предложит новые варианты.' : ''),
    mem ? null : h('p', { class: 'samples' }, h('span', { class: 'mono' }, 'Нет ничего под рукой? Попробуйте на образце'), SAMPLE_DAYS.map((d) => h('button', { type: 'button', class: 'chip', onclick: () => { loadSampleDay(d.key); viewCreate(null); toast('Образец загружен в форму. Его снимки нарисованы программой, это не настоящие фотографии.'); } }, d.label)),
      D.story || D.photos.length ? h('button', { type: 'button', class: 'linkish', onclick: () => { releaseDraft(D); App.draft = null; lsSet('afterimage-draft', null); viewCreate(null); } }, 'Очистить форму') : null),
    form));
  count(); drawPhotos();
}

/** Сохранить изменения записи, оставив её оформление прежним. */
async function saveEdit(D, mem) {
  const next = applyDraftFields(clone(mem), D), canvases = D.photos.map((p) => p.canvas);
  next.photos = D.photos.map(photoDoc);
  if (!D.photos.some((p) => p.missing)) { const scene = await buildScene({ spec: next.spec, canvases, meta: next }); next.thumb = sceneThumb(scene) || next.thumb; }
  await Store.persist(next, D.photos.map((p) => p.blob), D.audio ? { blob: D.audio.blob, name: D.audio.name } : null, D.removedRefs);
  dropOldAudio(D);
  let colsOk = true;
  try { await applyCollections(next.id, D.cols); } catch (e) { console.error(e); colsOk = false; }
  rememberCanvases(next.id, canvases); releaseDraft(D);
  App.edit = null; App.studio = null;
  go('m-' + next.id);
  toast(colsOk ? 'Изменения сохранены.' : 'Запись сохранена, но коллекции обновить не удалось.');
}

/* ── проявка: пять стадий оформления ── */
function showLoader(cover, onStop) {
  const host = $('#overlay'), print = drawScaled(cover, 820);
  print.className = 'dev-print';
  const stageEls = STAGES.map((s) => h('li', { dataset: { state: 'todo' } }, h('span', { class: 'tick', 'aria-hidden': 'true' }), h('span', null, s)));
  const atmo = h('p', { class: 'dev-atmo', 'aria-live': 'polite' }), sw = h('div', { class: 'dev-swatches', 'aria-hidden': 'true' }), dir = h('p', { class: 'mono dev-dir' }), clock = h('span', null, '00:00'), who = h('span');
  const stop = btn('Остановить', onStop, 'on-film small');
  fill(host, h('div', { class: 'dev', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Оформляю воспоминание' },
    h('div', { class: 'dev-tray' }, h('div', { class: 'dev-sheet' }, print)),
    h('div', { class: 'dev-side' }, h('p', { class: 'mono dev-kicker' }, 'Afterimage  ·  проявка'), h('ol', { class: 'stages' }, stageEls), atmo, sw, dir, h('p', { class: 'mono dev-foot' }, clock, '  ·  ', who), stop)));
  host.hidden = false; document.body.classList.add('locked'); stop.focus();
  let cur = -1;
  const t0 = Date.now(), DEV = [0.08, 0.3, 0.55, 0.85, 1];
  const timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 500);
  const api = {
    stage(i) {
      who.textContent = AI.live ? (i === 0 ? `${AI.via === 'server' ? 'ИИ' : 'Claude'} читает ваш рассказ${AI.via === 'claude-app' ? '. В первый раз он может спросить разрешение' : ''}.` : `Арт-дирекция: ${AI.via === 'server' ? 'ИИ через сервер' : 'Claude'}`) : 'Демо-режим: встроенный движок, не ИИ';
      if (i <= cur) return;
      cur = i;
      stageEls.forEach((el, k) => { el.dataset.state = k < i ? 'done' : k === i ? 'now' : 'todo'; if (k === i) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
      const d = DEV[i];
      print.style.filter = `blur(${((1 - d) * 15).toFixed(1)}px) contrast(${(0.4 + d * 0.6).toFixed(2)}) saturate(${d.toFixed(2)}) brightness(${(1.45 - d * 0.45).toFixed(2)})`;
      print.style.opacity = (0.12 + d * 0.88).toFixed(2);
      if (i >= 3) stop.hidden = true;
    },
    partial(p) {
      if (p.atmosphere) atmo.textContent = p.atmosphere;
      if (p.colors && p.colors.length) fill(sw, ...p.colors.map(validHex).filter(Boolean).map((c) => h('i', { style: { background: c } })));
      if (p.direction) dir.textContent = p.direction;
    },
    close() { clearInterval(timer); host.hidden = true; host.replaceChildren(); document.body.classList.remove('locked'); },
  };
  api.stage(0);
  return api;
}

const studioMeta = (S) => ({ ...S.mem, photos: S.photos.map(photoDoc) });
const studioScene = (S, spec, maxEdge = 1400) => buildScene({ spec, canvases: S.photos.map((p) => p.canvas), meta: studioMeta(S), maxEdge });
async function variantThumbs(S) { for (const v of S.variants) { if (!v.thumb) { try { v.thumb = renderStill(await studioScene(S, v.spec, 520), 320); } catch (e) { console.error(e); v.thumb = null; } } } }
const engineLabel = (en) => (en.kind === 'claude' ? 'ИИ' : 'демо');

/** Прочитать день, получить варианты оформления и открыть студию. */
async function generateFromDraft(D, mem = null) {
  const usable = D.photos.filter((p) => !p.missing), ctl = new AbortController(), ui = showLoader((usable[0] || D.photos[0]).canvas, () => ctl.abort());
  try {
    const base = applyDraftFields(mem ? clone(mem) : { id: newId(), kind: 'memory', v: 2, no: 0, createdAt: new Date().toISOString(), thumb: '', spec: null, prevSpec: null, brief: null, example: false }, D);
    if (!mem) base.no = await Store.nextNumber().catch(() => 1);
    const { brief, engine } = await directMemory({ input: dayInput(base, !!D.audio), photos: aiPhotosOf(usable.length ? usable : D.photos), signal: ctl.signal, onStage: ui.stage, onPartial: ui.partial, avoid: mem ? avoidOf(mem.spec) : null });
    const first = brief.variants[0];
    ui.stage(3); ui.partial({ atmosphere: first.emotion.atmosphere, colors: PALETTE_KEYS.map((k) => first.palette[k]), direction: first.direction.name });
    // Порядок кадров от ИИ применяется, только если он действительно видел снимки. Свой порядок можно вернуть одной кнопкой.
    const aiOrdered = engine.kind === 'claude' && engine.sawPhotos && usable.length === D.photos.length && brief.order.some((v, i) => v !== i);
    const variants = brief.variants.map((spec, i) => ({ spec, label: `Вариант ${i + 1}`, engine }));
    if (mem) variants.push({ spec: clone(mem.spec), label: 'Текущее оформление', engine: mem.engine, saved: true });
    const S = { mem: base, isNew: !mem, D, photos: aiOrdered ? brief.order.map((i) => D.photos[i]) : D.photos.slice(), userOrder: D.photos.slice(), aiOrder: aiOrdered ? brief.order.map((i) => D.photos[i]) : null,
      variants, sel: 0, spec: clone(first), originalSpec: mem ? clone(mem.spec) : null, extras: brief.extras, edited: false, cols: D.cols };
    const started = Date.now();
    await variantThumbs(S);
    await sleep(Math.max(0, (reduceMotion() ? 150 : 900) - (Date.now() - started)));
    ui.stage(4);
    await sleep(reduceMotion() ? 100 : 600);
    App.studio = S;
    ui.close();
    go('studio');
  } catch (e) {
    ui.close();
    if (e && e.code === 'cancelled') toast('Остановлено. Ваш текст и фотографии на месте.'); else { console.error(e); toast(explain(e)); }
  }
}
/** Открыть студию для уже сохранённой записи: поправить оформление вручную, без обращения к ИИ. */
async function openStudio(mem) {
  const D = await draftFromMemory(mem);
  App.edit = D;
  const variants = [{ spec: clone(mem.spec), label: 'Текущее оформление', engine: mem.engine, saved: true }];
  if (mem.prevSpec) variants.push({ spec: clone(mem.prevSpec), label: 'Предыдущее оформление', engine: mem.engine, saved: true });
  const S = { mem: clone(mem), isNew: false, D, photos: D.photos.slice(), userOrder: D.photos.slice(), aiOrder: null, variants, sel: 0, spec: clone(mem.spec), originalSpec: clone(mem.spec), extras: mem.brief, edited: mem.engine.edited, cols: D.cols };
  await variantThumbs(S);
  App.studio = S;
  go('studio');
}

/** Кадрирование: точка, вокруг которой кадр обрезается, и приближение. Исходный снимок не меняется. */
function cropDialog(p, n, done) {
  const img = drawScaled(p.canvas, 900), prev = makeCanvas(240, 300), px = prev.getContext('2d');
  img.className = 'crop-img'; img.setAttribute('role', 'img'); img.setAttribute('aria-label', `Фотография ${n} целиком`);
  let fx = p.fx == null ? 0.5 : p.fx, fy = p.fy == null ? 0.5 : p.fy, zoom = p.zoom || 1;
  const dot = h('button', { type: 'button', class: 'crop-dot', 'aria-label': 'Центр кадра. Стрелки на клавиатуре двигают точку.' });
  const box = h('div', { class: 'crop-box' }, img, dot);
  const zr = h('input', { type: 'range', id: 'cropZoom', min: 100, max: 300, step: 5, value: Math.round(zoom * 100) }), zl = h('span', { class: 'mono' });
  const paint = () => { dot.style.left = (fx * 100).toFixed(1) + '%'; dot.style.top = (fy * 100).toFixed(1) + '%'; zl.textContent = '×' + zoom.toFixed(2).replace('.', ','); px.clearRect(0, 0, 240, 300); coverDraw(px, p.canvas, 0, 0, 240, 300, zoom, fx, fy); };
  const at = (e) => { const r = img.getBoundingClientRect(); fx = clamp((e.clientX - r.left) / r.width, 0, 1); fy = clamp((e.clientY - r.top) / r.height, 0, 1); paint(); };
  let down = false;
  box.addEventListener('pointerdown', (e) => { down = true; try { box.setPointerCapture(e.pointerId); } catch { /* не критично */ } at(e); });
  box.addEventListener('pointermove', (e) => { if (down) at(e); });
  ['pointerup', 'pointercancel'].forEach((ev) => box.addEventListener(ev, () => { down = false; }));
  dot.addEventListener('keydown', (e) => { const d = { ArrowLeft: [-0.03, 0], ArrowRight: [0.03, 0], ArrowUp: [0, -0.03], ArrowDown: [0, 0.03] }[e.key]; if (!d) return; e.preventDefault(); fx = clamp(fx + d[0], 0, 1); fy = clamp(fy + d[1], 0, 1); paint(); });
  zr.addEventListener('input', () => { zoom = clamp(+zr.value / 100, 1, 3); paint(); });
  const close = modal(h('div', { class: 'sheet-modal crop' }, h('p', { class: 'mono' }, `Кадрирование  ·  фотография ${n}`),
    h('div', { class: 'crop-in' }, box, h('div', { class: 'crop-side' }, h('p', { class: 'mono' }, 'Как обрежется'), prev,
      h('div', { class: 'f' }, h('label', { class: 'mono', for: 'cropZoom' }, 'Приближение'), zr, zl),
      h('p', { class: 'fine' }, 'Нажмите на снимок там, где главное: кадр будет обрезаться вокруг этой точки в любом шаблоне. Сам снимок остаётся целым.'),
      h('div', { class: 'actions' }, btn('Готово', () => { p.fx = +fx.toFixed(3); p.fy = +fy.toFixed(3); p.zoom = +zoom.toFixed(2); close(); done(); }, 'small solid'), btn('Сбросить', () => { delete p.fx; delete p.fy; delete p.zoom; close(); done(); }, 'small on-film'))))), 'Кадрирование фотографии');
  paint();
}

/* ── студия: варианты, шаблон, снимки, температура, подписи ── */
function viewStudio() {
  const S = App.studio, root = view();
  if (!S) return go('new');
  root.className = 'studio';
  const mem = S.mem, back = S.isNew ? 'new' : 'edit-' + mem.id;
  const canvas = h('canvas', { class: 'art', role: 'img', 'aria-label': 'Предпросмотр оформления' }), stageNote = h('p', { class: 'mono st-note', role: 'status' }), tplSlots = {};
  let art = null, seq = 0, tseq = 0, alive = true;
  App.cleaners.push(() => { alive = false; });
  const cur = () => S.variants[S.sel];
  async function redraw(intro) {
    const my = ++seq;
    let scene;
    try { scene = await studioScene(S, S.spec); } catch (e) { console.error(e); stageNote.textContent = 'Предпросмотр не удалось нарисовать в этом браузере.'; return; }
    if (my !== seq || !alive) return;
    if (art) art.stop();
    art = mountArtwork(canvas, scene, { intro: !!intro });
    stageNote.textContent = `Шаблон «${TEMPLATE_NAMES[S.spec.composition.layout]}»  ·  ${RU.format[S.spec.composition.format]}${S.photos.length > 6 ? '  ·  в композиции первые 6 кадров' : ''}`;
  }
  const soon = debounce(() => { redraw(false); drawTemplates(); }, 220);
  const drawTemplates = debounce(async () => {
    const my = ++tseq;
    for (const key of LAYOUT_KEYS) {
      try {
        const sc = await studioScene(S, { ...S.spec, composition: { ...S.spec.composition, layout: key } }, 420);
        if (my !== tseq || !alive) return;
        const c = renderStill(sc, 260); c.setAttribute('aria-hidden', 'true');
        fill(tplSlots[key], c);
      } catch (e) { console.error(e); }
      await sleep(0);
    }
  }, 350);
  const touch = (fast) => { S.edited = true; if (fast) { redraw(false); drawTemplates(); } else soon(); };
  const rerender = () => { cleanup(); viewStudio(); };
  const sec = (kicker, title, ...kids) => h('section', { class: 'st-sec' }, h('p', { class: 'mono' }, kicker), title ? h('h2', null, title) : null, kids);

  /* варианты */
  const ai = cur().engine.kind === 'claude';
  const variantCards = h('div', { class: 'var-grid' }, S.variants.map((v, i) => {
    const sp = v.spec, thumb = v.thumb ? drawScaled(v.thumb, 320) : h('span', { class: 'thumb no-thumb' }, sp.title);
    if (v.thumb) thumb.setAttribute('aria-hidden', 'true');
    return h('button', { type: 'button', class: 'var-card', 'aria-pressed': String(i === S.sel), onclick: () => { if (i === S.sel && !S.edited) return; S.sel = i; S.spec = clone(v.spec); S.edited = false; rerender(); } },
      thumb, h('span', { class: 'mono' }, `${v.label}  ·  ${v.saved ? 'сохранено' : engineLabel(v.engine)}`), h('strong', null, sp.direction.name), h('span', { class: 'var-tpl' }, `${TEMPLATE_NAMES[sp.composition.layout]}  ·  ${FONTS[sp.typography.display].family}`), paletteDots(sp.palette));
  }));
  const regenNote = h('input', { type: 'text', id: 'regenNote', class: 'field', maxlength: 300, placeholder: 'Пожелание: «спокойнее», «меньше коричневого», «ближе к песне»…', 'aria-label': 'Пожелание для новых вариантов' });
  const regenBtn = btn(AI.live ? 'Новые варианты от ИИ' : 'Новые варианты', async () => {
    const usable = S.photos.filter((p) => !p.missing), ctl = new AbortController(), ui = showLoader((usable[0] || S.photos[0]).canvas, () => ctl.abort());
    try {
      const { brief, engine } = await directMemory({ input: dayInput(mem, !!S.D.audio), photos: aiPhotosOf(usable.length ? usable : S.photos), signal: ctl.signal, onStage: ui.stage, onPartial: ui.partial, avoid: avoidOf(S.spec), note: str(regenNote.value, 300) });
      ui.stage(3);
      const keepCur = { spec: clone(S.spec), label: 'Прежний выбор', engine: cur().engine, saved: cur().saved && !S.edited };
      S.variants = [...brief.variants.map((spec, i) => ({ spec, label: `Вариант ${i + 1}`, engine })), keepCur, ...S.variants.filter((v) => v.saved && v.label === 'Текущее оформление' && v !== cur())].slice(0, 5);
      S.extras = { ...brief.extras, music: brief.extras.music.length ? brief.extras.music : S.extras.music };
      S.sel = 0; S.spec = clone(brief.variants[0]); S.edited = false;
      await variantThumbs(S);
      ui.stage(4); await sleep(reduceMotion() ? 100 : 500);
      ui.close(); rerender(); window.scrollTo(0, 0);
      toast(engine.kind === 'claude' ? 'ИИ предложил новые варианты. Прежний выбор тоже остался.' : `Новые варианты собраны в демо-режиме: ${whyNoAI()}.`);
    } catch (e) { ui.close(); if (e && e.code === 'cancelled') toast('Остановлено. Оформление не изменилось.'); else { console.error(e); toast(explain(e)); } }
  }, 'small');
  const sp = S.spec, v0 = cur().spec;
  const why = h('div', { class: 'why-box' }, h('p', { class: 'mono' }, cur().saved ? 'Об этом оформлении' : ai ? 'Почему ИИ предлагает так' : 'Как это собрано'),
    v0.direction.statement ? h('p', { class: 'atmo' }, v0.direction.statement) : null, v0.direction.rationale ? h('p', null, v0.direction.rationale) : null,
    v0.emotion.atmosphere ? h('p', { class: 'fine' }, 'Настроение дня: ' + v0.emotion.atmosphere) : null,
    h('p', { class: 'fine' }, cur().engine.kind === 'claude' ? `Варианты написал ИИ${cur().engine.sawPhotos ? ', он видел уменьшенные копии фотографий' : ' по тексту и измеренным цветам снимков, самих фотографий он не видел'}. Событий он не добавляет: в записи остаётся только ваш текст.` : cur().engine.note || 'Собрано встроенным демо-движком, не ИИ.'));

  /* шаблон */
  const suggested = v0.composition.layout;
  const tplGrid = h('div', { class: 'tpl-grid' }, LAYOUT_KEYS.map((key) => {
    tplSlots[key] = h('span', { class: 'tpl-thumb' });
    return h('button', { type: 'button', class: 'tpl-card', 'aria-pressed': String(sp.composition.layout === key), onclick: () => { if (sp.composition.layout === key) return; sp.composition.layout = key; S.edited = true; $$('.tpl-card', tplGrid).forEach((b) => b.setAttribute('aria-pressed', String(b === tplSlots[key].parentNode))); redraw(true); } },
      tplSlots[key], h('strong', null, TEMPLATE_NAMES[key]), h('span', { class: 'tpl-hint' }, TEMPLATE_HINTS[key]), key === suggested && !cur().saved ? h('span', { class: 'mono tpl-ai' }, ai ? 'предложение ИИ' : 'предложение демо') : null);
  }));
  const oldLayout = OLD_LAYOUTS.includes(sp.composition.layout) ? h('p', { class: 'fine' }, `Сейчас запись оформлена шаблоном первой версии «${TEMPLATE_NAMES[sp.composition.layout]}». Он сохранится, пока вы не выберете другой.`) : null;
  const formatTabs = h('div', { class: 'tabs seg', role: 'group', 'aria-label': 'Формат листа' }, FORMATS.map((f) => h('button', { type: 'button', 'aria-pressed': String(sp.composition.format === f), onclick: (e) => { sp.composition.format = f; $$('button', formatTabs).forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); touch(true); } }, cap1(RU.format[f]))));

  /* фотографии */
  const photoList = h('ol', { class: 'st-photos' }), orderNote = h('div', { class: 'order-note' }), dragState = { id: null };
  const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const movePhoto = (from, to) => { if (from < 0 || to < 0 || to >= S.photos.length || from === to) return; S.photos.splice(to, 0, S.photos.splice(from, 1)[0]); drawPhotoList(); touch(true); };
  function drawPhotoList() {
    fill(photoList, ...S.photos.map((p, i) => {
      const n = i + 1, capIn = h('input', { type: 'text', class: 'field', id: 'cap-' + p.id, maxlength: 90, placeholder: 'Подпись (необязательно)', 'aria-label': `Подпись к фотографии ${n}` });
      capIn.value = p.caption || '';
      capIn.addEventListener('input', () => { p.caption = capIn.value; touch(); });
      const thumb = h('span', { class: 'st-thumb', title: 'Потяните, чтобы изменить порядок' }, p.url ? h('img', { src: p.url, alt: `Фотография ${n}`, draggable: false }) : null, i === 0 ? h('span', { class: 'mono ph-tag' }, 'Обложка') : null);
      const row = h('li', { class: 'st-photo' }, thumb, h('div', { class: 'st-photo-body' }, capIn,
        h('div', { class: 'actions' },
          i > 0 ? btn('Обложка', () => movePhoto(i, 0), 'small', { 'aria-label': `Сделать фотографию ${n} обложкой` }) : null,
          btn('↑', () => movePhoto(i, i - 1), 'small', { 'aria-label': `Передвинуть фотографию ${n} раньше`, disabled: i === 0 }),
          btn('↓', () => movePhoto(i, i + 1), 'small', { 'aria-label': `Передвинуть фотографию ${n} позже`, disabled: i === S.photos.length - 1 }),
          p.missing ? null : btn(p.fx != null || (p.zoom && p.zoom !== 1) ? 'Кадрирование ✓' : 'Кадрировать', () => cropDialog(p, n, () => { drawPhotoList(); touch(true); }), 'small', { 'aria-label': `Кадрировать фотографию ${n}` }))));
      dragSort(thumb, row, p.id, dragState, (a, b) => movePhoto(S.photos.findIndex((q) => q.id === a), S.photos.findIndex((q) => q.id === b)));
      return row;
    }));
    const isAi = S.aiOrder && sameOrder(S.photos, S.aiOrder), isUser = sameOrder(S.photos, S.userOrder);
    fill(orderNote, 
      S.aiOrder ? h('p', { class: 'fine' }, isAi ? 'Обложку и порядок кадров предложил ИИ. ' : 'ИИ предлагал другой порядок кадров. ', S.extras.orderWhy || '') : S.extras.orderWhy && !cur().saved ? h('p', { class: 'fine' }, S.extras.orderWhy) : null,
      S.aiOrder ? h('div', { class: 'actions' }, isAi ? null : btn('Порядок, предложенный ИИ', () => { S.photos = S.aiOrder.slice(); drawPhotoList(); touch(true); }, 'small'), isUser ? null : btn('Вернуть мой порядок', () => { S.photos = S.userOrder.slice(); drawPhotoList(); touch(true); }, 'small')) : null);
  }

  /* цветовая температура */
  const toneText = (t) => { const v = Math.round(t * 100); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}  ·  ${v < -8 ? 'холоднее' : v > 8 ? 'теплее' : 'нейтрально'}`; };
  const toneOut = h('output', { class: 'mono', for: 'toneRange' }, toneText(sp.tone));
  const tone = h('input', { type: 'range', id: 'toneRange', class: 'tone-range', min: -100, max: 100, step: 5, value: Math.round(sp.tone * 100), 'aria-label': 'Цветовая температура оформления: от холодной к тёплой' });
  const setTone = (t, fromSlider) => { sp.tone = clamp(t, -1, 1); if (!fromSlider) tone.value = String(Math.round(sp.tone * 100)); toneOut.textContent = toneText(sp.tone); touch(); };
  tone.addEventListener('input', () => setTone(+tone.value / 100, true));
  const sugTone = S.extras.toneSuggested, facts = [mem.weather, tempLabel(mem.tempC)].filter(Boolean).join(', ');

  /* подписи */
  const titleIn = h('input', { type: 'text', id: 'stTitle', class: 'field', maxlength: 90 }), capIn2 = h('textarea', { id: 'stCaption', class: 'field area', rows: 3, maxlength: 320 });
  titleIn.value = sp.title; capIn2.value = sp.caption;
  titleIn.addEventListener('input', () => { sp.title = str(titleIn.value, 90) || cur().spec.title; touch(); });
  capIn2.addEventListener('input', () => { sp.caption = str(capIn2.value, 320); touch(); });

  /* тонкая настройка */
  const sel = (id, label, options, get, set) => field(id, label, selectEl(id, label, options, get(), (v) => { set(v); touch(true); }));
  const fine = h('details', { class: 'st-fine' }, h('summary', null, 'Шрифты, рамки, фактура и движение'),
    h('div', { class: 'row2' },
      sel('stDisplay', 'Шрифт заголовка', DISPLAY_KEYS.map((k) => [k, FONTS[k].family]), () => sp.typography.display, (v) => { sp.typography.display = v; }),
      sel('stBody', 'Шрифт текста', BODY_KEYS.map((k) => [k, FONTS[k].family]), () => sp.typography.body, (v) => { sp.typography.body = v; }),
      sel('stFrame', 'Рамка фотографий', FRAMES.map((k) => [k, cap1(RU.frame[k])]), () => sp.photo.frame, (v) => { sp.photo.frame = v; }),
      sel('stTexture', 'Фактура', TEXTURES.map((k) => [k, cap1(RU.texture[k])]), () => sp.texture.kind, (v) => { sp.texture.kind = v; if (v !== 'none' && sp.texture.intensity < 0.15) sp.texture.intensity = 0.4; }),
      sel('stMotif', 'Эффект поверх', MOTIFS.map((k) => [k, cap1(RU.motif[k])]), () => sp.motif.kind, (v) => { sp.motif.kind = v; if (v !== 'none' && sp.motif.density < 0.15) sp.motif.density = 0.4; }),
      sel('stAlign', 'Выравнивание текста', ['left', 'center', 'right'].map((k) => [k, cap1(RU.align[k])]), () => sp.composition.align, (v) => { sp.composition.align = v; }),
      sel('stEntrance', 'Появление', ENTRANCES.map((k) => [k, cap1(RU.entrance[k])]), () => sp.motion.entrance, (v) => { sp.motion.entrance = v; }),
      sel('stTempo', 'Темп движения', TEMPOS.map((k) => [k, cap1(RU.tempo[k])]), () => sp.motion.tempo, (v) => { sp.motion.tempo = v; })),
    h('p', { class: 'fine' }, reduceMotion() ? 'В системе включено уменьшение движения, поэтому предпросмотр неподвижен. Настройки движения сохранятся в записи.' : 'Движение видно в предпросмотре: кнопка «Повторить появление» запускает его заново.'));

  /* музыка */
  const hasFixedSong = !!(mem.song && (mem.song.title || mem.song.artist || mem.song.url || mem.song.audio || S.D.audio));
  const musicSec = hasFixedSong ? sec('Музыка', '', h('p', { class: 'song-line' }, h('span', { class: 'note', 'aria-hidden': 'true' }, '♪'), h('span', null, songText(mem.song) || 'Аудиофайл без названия')), h('p', { class: 'fine' }, 'Музыку можно заменить или убрать в форме записи: «Назад к тексту».'))
    : S.extras.music.length ? sec('Музыка', 'Что могло бы звучать', h('p', { class: 'fine' }, 'В записи нет музыки. Если хочется, выберите направление — оно сохранится в записи как подсказка, а не как конкретная песня.'),
      directionsList(S.extras.music, { by: S.extras.musicBy || 'demo', picked: mem.song ? mem.song.direction : '', onPick: (d) => { const same = mem.song && mem.song.direction === d.direction; mem.song = same ? null : normSong({ direction: d.direction, why: d.why, query: d.query, by: S.extras.musicBy || 'demo' }); Object.assign(S.D.song, same ? emptySong() : { mode: 'vibe', direction: d.direction, why: d.why, query: d.query, by: S.extras.musicBy || 'demo' }); rerender(); } }),
      mem.song && mem.song.direction ? h('p', { class: 'fine' }, 'Нажмите «Выбрано» ещё раз, чтобы убрать направление.') : null) : null;

  /* сохранение */
  const status = h('p', { class: 'form-error', role: 'alert' });
  const saveBtn = btn(S.isNew ? 'Сохранить воспоминание' : 'Сохранить оформление', async () => {
    saveBtn.disabled = true; status.textContent = ''; const idle = saveBtn.textContent; saveBtn.textContent = 'Сохраняю…';
    try { await saveStudio(S); } catch (e) { console.error(e); status.textContent = explain(e); saveBtn.disabled = false; saveBtn.textContent = idle; }
  }, 'mark big');
  const picker = collectionPicker(S.cols, () => mem.location, mem.id);

  fill(root, h('div', { class: 'wrap' },
    pageHead(S.isNew ? 'Шаг 2 из 2  ·  оформление' : `Запись № ${pad4(mem.no)}  ·  оформление`, S.isNew ? 'Как сохранить этот день?' : 'Оформление записи', h('p', { class: 'mono', 'data-engine-line': '' }, AI.line())),
    h('div', { class: 'studio-in' },
      h('div', { class: 'studio-stage' }, canvas, stageNote,
        h('div', { class: 'actions' }, saveBtn, h('a', { class: 'btn', href: '#' + back }, 'Назад к тексту'), btn('Повторить появление', () => { if (art) art.replay(); }, 'small')), status,
        h('p', { class: 'fine' }, S.isNew ? 'Запись появится в дневнике только после сохранения.' : 'Прежнее оформление сохранится как «предыдущее», к нему можно вернуться.')),
      h('div', { class: 'studio-side' },
        sec(cur().saved ? 'Оформление' : ai ? 'Варианты от ИИ' : 'Варианты · демо-режим', cur().saved && S.variants.length === 1 ? 'Сейчас запись выглядит так' : 'Выберите вариант', variantCards, why,
          h('div', { class: 'regen' }, regenNote, regenBtn), AI.live ? null : h('p', { class: 'fine' }, `Сейчас новые варианты соберёт демо-движок: ${whyNoAI()}.`)),
        sec('Шаблон', 'Композиция', h('p', { class: 'fine' }, 'Миниатюры собраны из ваших фотографий с текущими цветами и шрифтом. Шаблоны отличаются композицией, а не только цветом.'), tplGrid, oldLayout, h('div', { class: 'f' }, h('span', { class: 'mono' }, 'Формат листа'), formatTabs)),
        sec('Фотографии', plural(S.photos.length, F_PHOTO), orderNote, photoList, h('p', { class: 'fine' }, 'Первый снимок — обложка. Порядок меняется кнопками или перетаскиванием миниатюры. Подписи видны в шаблонах «Страница дневника» и «Фотоплёнка» и под оригиналами.')),
        sec('Цвет', 'Цветовая температура', h('div', { class: 'tone' }, h('span', { class: 'mono' }, 'Холодно'), tone, h('span', { class: 'mono' }, 'Тепло')), toneOut,
          h('div', { class: 'actions' }, S.extras.toneWhy || sugTone ? btn(`${S.extras.musicBy === 'claude' ? 'Как предлагает ИИ' : 'Как предлагает демо'}: ${toneText(sugTone).split('  ·  ')[0]}`, () => setTone(sugTone), 'small') : null, btn('Нейтрально', () => setTone(0), 'small')),
          S.extras.toneWhy ? h('p', { class: 'fine' }, S.extras.toneWhy) : null,
          h('p', { class: 'fine' }, `Ползунок меняет только цвет оформления. Погода и температура воздуха в записи остаются такими, как вы их указали${facts ? ': ' + facts : ''}.`)),
        sec('Текст', 'Заголовок и подпись', field('stTitle', 'Заголовок', titleIn), field('stCaption', 'Подпись под заголовком', capIn2), fine),
        musicSec,
        sec('Идеи', 'Референсы', pinterestBlock(sp, S.extras)),
        sec('Коллекции', '', picker.el)))));
  drawPhotoList(); redraw(true); drawTemplates();
}

async function saveStudio(S) {
  const mem = S.mem, D = S.D, v = S.variants[S.sel];
  mem.photos = S.photos.map(photoDoc);
  if (!S.isNew && S.originalSpec && JSON.stringify(S.originalSpec) !== JSON.stringify(S.spec)) mem.prevSpec = clone(S.originalSpec);
  mem.spec = clone(S.spec); mem.brief = S.extras;
  mem.engine = { kind: v.engine.kind, sawPhotos: !!v.engine.sawPhotos, at: v.engine.at || new Date().toISOString(), note: v.engine.note || '', edited: !!S.edited || !!(v.saved && v.engine.edited) };
  const canvases = S.photos.map((p) => p.canvas);
  if (!S.photos.some((p) => p.missing) || !mem.thumb) { const scene = await buildScene({ spec: mem.spec, canvases, meta: mem }); mem.thumb = sceneThumb(scene) || mem.thumb; }
  const where = await Store.persist(mem, S.photos.map((p) => p.blob), D.audio ? { blob: D.audio.blob, name: D.audio.name } : null, D.removedRefs);
  dropOldAudio(D);
  let colsOk = true;
  try { await applyCollections(mem.id, S.cols); } catch (e) { console.error(e); colsOk = false; }
  rememberCanvases(mem.id, canvases); releaseDraft(D);
  if (S.isNew) { App.draft = null; lsSet('afterimage-draft', null); } else App.edit = null;
  App.studio = null; App.fresh = mem.id;
  go('m-' + mem.id);
  toast(!colsOk ? 'Запись сохранена, но коллекции обновить не удалось.' : !S.isNew ? 'Оформление сохранено.' : where === 'local' ? 'Сохранено в дневнике в этом браузере.' : 'Сохранено в дневнике.');
}
