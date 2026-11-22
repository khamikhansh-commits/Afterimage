/* ───────────── платформа и хранение ─────────────
   Три дома для дневника, один и тот же интерфейс:
   · cloud  — страница открыта в Claude: приватный раздел хранилища страницы + хранилище файлов
   · server — приложение запущено со своим сервером, человек вошёл по почте и паролю
   · local  — без аккаунта: IndexedDB этого браузера
   Паролей, ключей и токенов в этом коде нет: личность подтверждает платформа или сервер (cookie HttpOnly). */
const RT = (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') ? window.claude : null;
const capCache = new Map();
function cap(name) {
  if (!RT) return Promise.resolve(null);
  if (!capCache.has(name)) capCache.set(name, Promise.resolve().then(() => RT.use(name)).catch(() => null));
  return capCache.get(name);
}

/* ── клиент своего сервера ── */
const Srv = {
  on: false, config: null, user: null, _detect: null,
  detect() { return this._detect || (this._detect = this.probe()); },
  async probe() {
    if (RT || !/^https?:$/.test(location.protocol)) return false;
    try {
      const r = await withTimeout(fetch('/api/config', { headers: { Accept: 'application/json' } }), 5000);
      const c = r.ok ? await r.json() : null;
      if (!c || c.app !== 'afterimage') return false;
      this.on = true; this.config = c;
    } catch { return false; }
    try { this.user = (await this.call('GET', '/api/auth/me')).user || null; } catch { this.user = null; }
    return true;
  },
  /** Запрос к серверу. Ошибки приходят как { code, status, message } с русским текстом. */
  async call(method, path, { json, blob, raw = false, signal } = {}) {
    const headers = { Accept: 'application/json', 'X-Afterimage': '1' };
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    else if (blob) { headers['Content-Type'] = blob.type || 'application/octet-stream'; body = blob; }
    let r;
    try { r = await fetch(path, { method, headers, body, signal, credentials: 'same-origin' }); }
    catch (e) { throw (e && e.name === 'AbortError') ? { code: 'cancelled' } : { code: 'network', status: 0, message: 'Сервер не отвечает. Проверьте соединение и попробуйте ещё раз.' }; }
    if (r.status === 401 && this.user && !path.startsWith('/api/auth/')) { this.user = null; throw { code: 'unauthorized', status: 401, message: 'Сессия закончилась. Войдите снова.' }; }
    if (!r.ok) { let e = {}; try { e = await r.json(); } catch { /* не JSON */ } throw { code: str(e.error, 60) || 'error', status: r.status, message: str(e.message, 300) || 'Не получилось выполнить запрос. Попробуйте ещё раз.' }; }
    if (raw) return r;
    return r.status === 204 ? {} : r.json();
  },
};

/* ── IndexedDB: локальный дом и место для аудио, когда его некуда загрузить ── */
const IDB = {
  db: null, mem: { memories: new Map(), blobs: new Map() }, ok: false,
  async open() {
    if (this.db || this.tried) return;
    this.tried = true;
    try {
      this.db = await withTimeout(new Promise((res, rej) => {
        const rq = indexedDB.open('afterimage-diary', 1);
        rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('memories')) d.createObjectStore('memories'); if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); rq.onblocked = () => rej(new Error('blocked'));
      }), 4000);
      this.ok = true;
    } catch { this.db = null; this.ok = false; }
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), rq = fn(t.objectStore(store));
      t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  async get(store, key) { await this.open(); if (!this.db) return this.mem[store].get(key) ?? null; try { return (await this.tx(store, 'readonly', (s) => s.get(key))) ?? null; } catch { return this.mem[store].get(key) ?? null; } },
  async put(store, key, val) { await this.open(); if (!this.db) { this.mem[store].set(key, val); return; } try { await this.tx(store, 'readwrite', (s) => s.put(val, key)); } catch { this.mem[store].set(key, val); } },
  async del(store, key) { await this.open(); this.mem[store].delete(key); if (this.db) try { await this.tx(store, 'readwrite', (s) => s.delete(key)); } catch { /* ignore */ } },
  async all(store) { await this.open(); const extra = [...this.mem[store].values()]; if (!this.db) return extra; try { return [...(await this.tx(store, 'readonly', (s) => s.getAll())), ...extra]; } catch { return extra; } },
  async clear(store) { await this.open(); this.mem[store].clear(); if (this.db) try { await this.tx(store, 'readwrite', (s) => s.clear()); } catch { /* ignore */ } },
};

const REF_OK = { a: /^[A-Za-z0-9_-]{8,64}$/, r: /^[a-f0-9]{32}$/ };
const PROFILE_ID = 'p-profile';

const Store = {
  mode: 'pending', reason: '', db: null, assets: null, uid: null, docs: null, _ready: null, _loading: null,

  ready() { return this._ready || (this._ready = this.init()); },
  /** После входа или выхода: забыть всё загруженное и определить режим заново. */
  reset() { this._ready = null; this._loading = null; this.docs = null; this.mode = 'pending'; App.canvasCache.clear(); return this.ready(); },
  async init() {
    await IDB.open();
    try {
      if (RT) {
        const [db, user, assets] = await Promise.all([cap('db'), cap('user'), cap('assets')]);
        let uid = null, mayWrite = null;
        if (user) { try { uid = await user.id(); } catch { uid = null; } try { mayWrite = await user.can('data.write'); } catch { mayWrite = null; } }
        if (db && assets && uid && mayWrite !== false && /^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(uid)) { this.db = db; this.assets = assets; this.uid = uid; this.mode = 'cloud'; }
        else { this.mode = 'local'; this.reason = !db || !uid ? 'no-account-storage' : !assets ? 'no-photo-storage' : 'read-only'; }
      } else if (await Srv.detect()) { this.mode = Srv.user ? 'server' : 'local'; this.reason = Srv.user ? '' : 'guest'; }
      else { this.mode = 'local'; this.reason = 'standalone'; }
    } catch { this.mode = 'local'; this.reason = 'error'; }
    return this.mode;
  },
  col() { return this.db.collection('data/users/' + this.uid); },
  describe() {
    if (this.mode === 'cloud') return 'Записи хранятся в вашем приватном разделе на аккаунте Claude';
    if (this.mode === 'server') return `Записи хранятся на сервере, в аккаунте ${Srv.user ? Srv.user.email : ''}`;
    if (this.mode === 'pending') return 'Открываю дневник…';
    return IDB.ok ? 'Записи хранятся только в этом браузере на этом устройстве' : 'Хранилище браузера недоступно: записи пропадут, когда вкладка закроется';
  },

  /* ── примитивы трёх домов ── */
  async _list() {
    if (this.mode === 'cloud') { const snap = await withTimeout(this.col().limit(1000).get(), 15000, 'timeout'); return snap.docs.map((d) => ({ id: d.id, data: d.data() })); }
    if (this.mode === 'server') return (await Srv.call('GET', '/api/docs')).docs || [];
    return (await IDB.all('memories')).filter((d) => d && d.id).map((d) => ({ id: d.id, data: d }));
  },
  async _put(id, data) {
    if (this.mode === 'cloud') return this.col().doc(id).set(data);
    if (this.mode === 'server') return Srv.call('PUT', '/api/docs/' + encodeURIComponent(id), { json: data });
    return IDB.put('memories', id, { ...data, id });
  },
  async _del(id) {
    if (this.mode === 'cloud') return this.col().doc(id).delete();
    if (this.mode === 'server') return Srv.call('DELETE', '/api/docs/' + encodeURIComponent(id));
    return IDB.del('memories', id);
  },
  async _putBlob(blob, kind = 'image') {
    if (this.mode === 'cloud' && kind === 'image') { const r = await this.assets.upload(blob, { type: 'image/jpeg' }); return { k: 'a', id: r.id }; }
    if (this.mode === 'server') { const r = await Srv.call('POST', '/api/blobs?kind=' + (kind === 'audio' ? 'audio' : 'image'), { blob }); return { k: 'r', id: r.id }; }
    const key = kind + '-' + newId() + '-' + newId(); await IDB.put('blobs', key, blob); return { k: 'l', key };
  },
  async _delBlob(ref) {
    if (!ref) return;
    if (ref.k === 'a' && this.assets) return this.assets.delete(ref.id).catch(() => {});
    if (ref.k === 'r' && Srv.user) return Srv.call('DELETE', '/api/blobs/' + ref.id).catch(() => {});
    if (ref.k === 'l') return IDB.del('blobs', ref.key);
  },
  async blob(ref) {
    if (!ref) return null;
    if (ref.k === 'l') return IDB.get('blobs', ref.key);
    try {
      if (ref.k === 'a' && REF_OK.a.test(ref.id)) { const r = await withTimeout(fetch('/_blob/' + ref.id), 20000); return r.ok ? await r.blob() : null; }
      if (ref.k === 'r' && REF_OK.r.test(ref.id)) { const r = await Srv.call('GET', '/api/blobs/' + ref.id, { raw: true }); return await r.blob(); }
    } catch { return null; }
    return null;
  },
  /** Сохранённый снимок как холст, либо null, если с этого устройства он недоступен. */
  async photoCanvas(ref) {
    const b = await this.blob(ref);
    if (b) return blobToCanvas(b, 1600);
    if (ref && ref.k === 'a' && REF_OK.a.test(ref.id)) {
      return withTimeout(new Promise((res) => { const img = new Image(); img.onload = () => { try { res(drawScaled(img, 1600)); } catch { res(null); } }; img.onerror = () => res(null); img.src = '/_blob/' + ref.id; }), 20000).catch(() => null);
    }
    return null;
  },
  audioBlob(mem) { const a = mem.song && mem.song.audio; return !a ? Promise.resolve(null) : a.ref ? this.blob(a.ref) : IDB.get('blobs', a.key); },

  /* ── загрузка и чтение ── */
  load(force) {
    if (this.docs && !force) return Promise.resolve(this.docs);
    return this._loading || (this._loading = (async () => {
      await this.ready();
      const docs = { mem: new Map(), col: new Map(), profile: normalizeProfile(null) };
      let rows;
      try { rows = await this._list(); } catch (e) {
        if (this.mode === 'cloud' && e && ['not_granted', 'revoked', 'capability_disabled', 'capability_removed'].includes(e.code)) { this.mode = 'local'; this.reason = 'cloud-denied'; rows = await this._list(); }
        else throw e;
      }
      for (const { id, data } of rows) {
        if (!data || typeof data !== 'object') continue;
        if (data.kind === 'collection') { const c = normalizeCollection(data, id); if (c) docs.col.set(c.id, c); }
        else if (data.kind === 'profile') docs.profile = normalizeProfile(data);
        else { const m = normalizeMemory(data, id); if (m) docs.mem.set(m.id, m); }
      }
      this.docs = docs;
      return docs;
    })().finally(() => { this._loading = null; }));
  },
  async list(force) { const d = await this.load(force); return [...d.mem.values()].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)); },
  async get(id) { return (await this.load()).mem.get(id) || null; },
  async nextNumber() { return (await this.list()).reduce((mx, m) => Math.max(mx, m.no || 0), 0) + 1; },
  async collections() { return [...(await this.load()).col.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru')); },
  async profile() { return (await this.load()).profile; },

  /* ── запись ── */
  /** Сохранить снимки (у которых ещё нет адреса), затем сам документ. blobs[i] относится к mem.photos[i]. */
  async persist(mem, blobs = [], audio = null, removedRefs = []) {
    await this.load();
    mem.kind = 'memory'; mem.v = 2; mem.updatedAt = new Date().toISOString();
    const uploaded = [];
    try {
      if (audio && audio.blob && mem.song) {
        const meta = { name: str(audio.name, 120), type: audio.blob.type || 'audio/mpeg', size: audio.blob.size };
        if (this.mode === 'server') { const ref = await this._putBlob(audio.blob, 'audio'); uploaded.push(ref); mem.song.audio = { ref, ...meta }; }
        else { const key = 'audio-' + mem.id; await IDB.put('blobs', key, audio.blob); mem.song.audio = { key, ...meta }; }
      }
      for (let i = 0; i < mem.photos.length; i++) {
        if (mem.photos[i].ref || !blobs[i]) continue;
        const ref = await this._putBlob(blobs[i]); uploaded.push(ref); mem.photos[i].ref = ref;
      }
      await this._put(mem.id, clone(mem));
    } catch (e) {
      for (const ref of uploaded) this._delBlob(ref);
      for (const p of mem.photos) if (p.ref && uploaded.includes(p.ref)) p.ref = null;
      // Новую запись в Claude при отказе хранилища не теряем: кладём в браузер, перенос доступен в настройках.
      const fresh = !mem.photos.some((p) => p.ref && p.ref.k !== 's') && !this.docs.mem.has(mem.id);
      if (this.mode === 'cloud' && fresh) {
        console.warn('Хранилище аккаунта отказало в записи, сохраняю в браузере.', e && e.code, e && e.message);
        this.mode = 'local'; this.reason = e && e.code === 'quota_exceeded' ? 'quota' : 'cloud-error'; this.docs = null;
        return this.persist(mem, blobs, audio, removedRefs);
      }
      throw e;
    }
    for (const ref of removedRefs) this._delBlob(ref);
    this.docs.mem.set(mem.id, mem);
    return this.mode;
  },
  async remove(mem) {
    await this.load();
    await this._del(mem.id);
    for (const p of mem.photos) if (p.ref && p.ref.k !== 's') this._delBlob(p.ref);
    const a = mem.song && mem.song.audio;
    if (a) { if (a.ref) this._delBlob(a.ref); else if (a.key) IDB.del('blobs', a.key); }
    this.docs.mem.delete(mem.id);
    for (const c of this.docs.col.values()) if (c.items.includes(mem.id)) { c.items = c.items.filter((x) => x !== mem.id); if (c.cover === mem.id) c.cover = ''; await this.saveCollection(c).catch(() => {}); }
  },
  async saveCollection(c) {
    await this.load();
    c.kind = 'collection'; c.updatedAt = new Date().toISOString();
    await this._put(c.id, clone(c));
    this.docs.col.set(c.id, c);
    return c;
  },
  async removeCollection(id) { await this.load(); await this._del(id); this.docs.col.delete(id); },
  async saveProfile(p) {
    await this.load();
    const doc = { ...normalizeProfile(p), kind: 'profile', updatedAt: new Date().toISOString() };
    await this._put(PROFILE_ID, clone(doc));
    this.docs.profile = doc;
    return doc;
  },
  /** Удалить весь дневник текущего дома: записи, коллекции, профиль, файлы. */
  async clearAll() {
    await this.load();
    if (this.mode === 'server') await Srv.call('POST', '/api/data/clear', { json: { confirm: true } });
    else if (this.mode === 'cloud') {
      for (const m of [...this.docs.mem.values()]) { await this._del(m.id); for (const p of m.photos) if (p.ref && p.ref.k === 'a') this._delBlob(p.ref); }
      for (const c of this.docs.col.keys()) await this._del(c);
      await this._del(PROFILE_ID).catch(() => {});
    } else { await IDB.clear('memories'); await IDB.clear('blobs'); }
    this.docs = null;
  },

  /* ── перенос локальных записей в аккаунт ── */
  /** Что лежит в этом браузере и ещё не перенесено в текущий аккаунт. Ничего не меняет. */
  async localPending() {
    await this.ready();
    if (this.mode === 'local') return [];
    const remote = (await this.load()).mem, out = [];
    for (const raw of await IDB.all('memories')) {
      if (!raw || raw.kind === 'collection' || raw.kind === 'profile' || raw.migratedAt) continue;
      const m = normalizeMemory(raw, raw.id);
      if (!m || remote.has(m.id)) continue;
      let bytes = 0;
      for (const p of m.photos) if (p.ref && p.ref.k === 'l') { const b = await IDB.get('blobs', p.ref.key); bytes += b ? b.size : 0; }
      out.push({ mem: m, bytes });
    }
    return out.sort((a, b) => b.mem.date.localeCompare(a.mem.date));
  },
  /** Скопировать выбранные локальные записи в аккаунт. Локальные копии остаются на месте и только помечаются. */
  async migrate(ids, onProgress = () => {}) {
    const pending = (await this.localPending()).filter((x) => ids.includes(x.mem.id));
    let no = await this.nextNumber(), done = 0;
    const failed = [];
    for (const { mem } of pending) {
      try {
        const copy = clone(mem), blobs = [];
        for (let i = 0; i < copy.photos.length; i++) {
          const ref = copy.photos[i].ref;
          if (ref && ref.k === 'l') { blobs[i] = await IDB.get('blobs', ref.key); copy.photos[i].ref = null; if (!blobs[i]) throw new Error('missing photo'); }
        }
        let audio = null;
        if (copy.song && copy.song.audio && copy.song.audio.key && this.mode === 'server') { const b = await IDB.get('blobs', copy.song.audio.key); if (b) audio = { blob: b, name: copy.song.audio.name }; copy.song.audio = null; }
        copy.no = no++;
        await this.persist(copy, blobs, audio);
        const raw = await IDB.get('memories', mem.id);
        if (raw) await IDB.put('memories', mem.id, { ...raw, migratedAt: new Date().toISOString(), migratedTo: this.mode });
      } catch (e) { console.warn('Не удалось перенести запись', mem.id, e && (e.code || e.message)); failed.push(mem.id); }
      onProgress(++done, pending.length);
    }
    return { moved: pending.length - failed.length, failed };
  },

  /** Резервная копия: diary.json и исходные файлы одним архивом. */
  async exportZip(onProgress = () => {}) {
    const d = await this.load(), enc = new TextEncoder(), files = [], mems = await this.list();
    const out = { app: 'Afterimage Diary', format: 2, exportedAt: new Date().toISOString(), profile: d.profile, collections: [...d.col.values()], memories: [] };
    let i = 0;
    for (const m of mems) {
      const copy = clone(m); copy.files = [];
      for (let k = 0; k < m.photos.length; k++) {
        const ref = m.photos[k].ref; if (!ref || ref.k === 's') continue;
        const b = await this.blob(ref);
        if (b) { const name = `photos/${m.date}_${m.id}_${k + 1}.jpg`; files.push({ name, data: new Uint8Array(await b.arrayBuffer()) }); copy.files.push(name); }
      }
      const ab = await this.audioBlob(m).catch(() => null);
      if (ab) { const ext = (/\.([a-z0-9]{2,5})$/i.exec(m.song.audio.name || '') || [, 'audio'])[1].toLowerCase(); const name = `audio/${m.date}_${m.id}.${ext}`; files.push({ name, data: new Uint8Array(await ab.arrayBuffer()) }); copy.audioFile = name; }
      out.memories.push(copy);
      onProgress(++i, mems.length);
    }
    files.unshift({ name: 'diary.json', data: enc.encode(JSON.stringify(out, null, 1)) });
    return makeZip(files);
  },
};

/* ── проверка всего, что прочитано из хранилища, прежде чем приложение этому поверит ── */
function normRef(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.k === 'a' && typeof r.id === 'string' && REF_OK.a.test(r.id)) return { k: 'a', id: r.id };
  if (r.k === 'r' && typeof r.id === 'string' && REF_OK.r.test(r.id)) return { k: 'r', id: r.id };
  if (r.k === 'l' && typeof r.key === 'string') return { k: 'l', key: r.key.slice(0, 120) };
  if (r.k === 's' && typeof r.key === 'string') return { k: 's', key: r.key.slice(0, 20) };
  return null;
}
function normGeo(g) {
  if (!g || typeof g !== 'object') return null;
  const lat = num(g.lat, NaN), lon = num(g.lon, NaN);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: +lat.toFixed(5), lon: +lon.toFixed(5), src: ['pin', 'search', 'ai'].includes(g.src) ? g.src : 'pin', label: str(g.label, 160) };
}
const normTags = (t) => [...new Set((Array.isArray(t) ? t : typeof t === 'string' ? t.split(/[,;#\n]+/) : []).map((s) => str(s, 30).replace(/^#/, '').toLocaleLowerCase()).filter(Boolean))].slice(0, 12);
function normSong(s) {
  if (!s || typeof s !== 'object') return null;
  const a = s.audio;
  const song = {
    title: str(s.title, 120), artist: str(s.artist, 120), url: safeUrl(s.url), direction: str(s.direction, 80), why: str(s.why, 240), query: str(s.query, 120), by: s.by === 'claude' ? 'claude' : s.by === 'demo' ? 'demo' : '',
    audio: a && (typeof a.key === 'string' || normRef(a.ref)) ? { key: typeof a.key === 'string' ? str(a.key, 80) : '', ref: normRef(a.ref), name: str(a.name, 120), type: str(a.type, 60), size: num(a.size, 0) } : null,
  };
  return song.title || song.artist || song.url || song.audio || song.direction ? song : null;
}
function normalizeMemory(raw, id) {
  if (!raw || typeof raw !== 'object' || !raw.spec || !Array.isArray(raw.photos)) return null;
  const mid = str(raw.id || id, 60);
  if (!mid) return null;
  const m = {
    id: mid, kind: 'memory', v: 2, no: clamp(Math.round(num(raw.no, 0)), 0, 99999),
    createdAt: str(raw.createdAt, 40) || new Date().toISOString(), updatedAt: str(raw.updatedAt, 40),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : todayISO(),
    location: str(raw.location, 80), geo: normGeo(raw.geo), weather: str(raw.weather, 40),
    tempC: typeof raw.tempC === 'number' && isFinite(raw.tempC) ? clamp(Math.round(raw.tempC), -90, 60) : null,
    tags: normTags(raw.tags), story: typeof raw.story === 'string' ? raw.story.slice(0, 12000) : '',
    song: normSong(raw.song), photos: [], thumb: typeof raw.thumb === 'string' && raw.thumb.startsWith('data:image/') ? raw.thumb : '',
    spec: normalizeSpec(raw.spec, { seed: hashStr(mid) }),
    prevSpec: raw.prevSpec ? normalizeSpec(raw.prevSpec, { seed: hashStr(mid) + 1 }) : null,
    brief: normBriefExtras(raw.brief),
    engine: { kind: raw.engine && raw.engine.kind === 'claude' ? 'claude' : 'local', sawPhotos: !!(raw.engine && raw.engine.sawPhotos), at: str(raw.engine && raw.engine.at, 40), note: str(raw.engine && raw.engine.note, 300), edited: !!(raw.engine && raw.engine.edited) },
    example: !!raw.example,
  };
  for (const p of raw.photos.slice(0, 12)) {
    if (!p || typeof p !== 'object') continue;
    const ph = { ref: normRef(p.ref), w: clamp(num(p.w, 4), 1, 20000), h: clamp(num(p.h, 3), 1, 20000), colors: Array.isArray(p.colors) ? p.colors.map(validHex).filter(Boolean).slice(0, 5) : [], caption: str(p.caption, 90) };
    if (p.fx != null || p.fy != null || p.zoom != null) { ph.fx = clamp(num(p.fx, 0.5), 0, 1); ph.fy = clamp(num(p.fy, 0.5), 0, 1); ph.zoom = clamp(num(p.zoom, 1), 1, 3); }
    m.photos.push(ph);
  }
  return m;
}
/** То, что ИИ предложил помимо самого оформления: хранится вместе с записью, чтобы не пропало при повторном открытии. */
function normBriefExtras(b) {
  b = b && typeof b === 'object' ? b : {};
  return {
    toneSuggested: clamp(num(b.toneSuggested, 0), -1, 1), toneWhy: str(b.toneWhy, 240), orderWhy: str(b.orderWhy, 240), moodboard: str(b.moodboard, 120),
    music: (Array.isArray(b.music) ? b.music : []).map((x) => ({ direction: str(x && x.direction, 80), why: str(x && x.why, 240), query: str(x && x.query, 120) })).filter((x) => x.direction).slice(0, 5),
    musicBy: b.musicBy === 'claude' ? 'claude' : b.musicBy === 'demo' ? 'demo' : '',
  };
}
function normalizeCollection(raw, id) {
  const cid = str((raw && raw.id) || id, 60);
  if (!raw || !cid || !str(raw.title, 80)) return null;
  return {
    id: cid, kind: 'collection', title: str(raw.title, 80), description: str(raw.description, 400), cover: str(raw.cover, 60),
    items: [...new Set((Array.isArray(raw.items) ? raw.items : []).map((x) => str(x, 60)).filter(Boolean))].slice(0, 2000),
    createdAt: str(raw.createdAt, 40) || new Date().toISOString(), updatedAt: str(raw.updatedAt, 40),
  };
}
function normalizeProfile(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const list = (v) => [...new Set((Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]+/) : []).map((s) => str(s, 40)).filter(Boolean))].slice(0, 20);
  return {
    kind: 'profile', name: str(raw.name, 60), bio: str(raw.bio, 300), color: validHex(raw.color) || '',
    avatar: typeof raw.avatar === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(raw.avatar) && raw.avatar.length < 90000 ? raw.avatar : '',
    places: list(raw.places), interests: list(raw.interests), updatedAt: str(raw.updatedAt, 40),
  };
}
