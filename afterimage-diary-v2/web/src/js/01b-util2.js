/* ───────────── вспомогательное: русские формы слов, архив, файлы, тема ───────────── */
/** plural(3, ['день', 'дня', 'дней']) → «3 дня» */
function plural(n, forms, withNumber = true) {
  const a = Math.abs(n) % 100, b = a % 10;
  const w = a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2];
  return withNumber ? `${n} ${w}` : w;
}
const F_DAY = ['день', 'дня', 'дней'], F_REC = ['запись', 'записи', 'записей'], F_PHOTO = ['фотография', 'фотографии', 'фотографий'], F_FRAME = ['кадр', 'кадра', 'кадров'], F_WORD = ['слово', 'слова', 'слов'], F_PLACE = ['место', 'места', 'мест'], F_COL = ['коллекция', 'коллекции', 'коллекций'];
const debounce = (fn, ms = 250) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ');
const cap1 = (s) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);
const MD = (iso) => (iso || '').slice(5, 10);

/* ── zip без сжатия: фотографии уже сжаты, поэтому архив собирается прямо в браузере ── */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [], d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const csize = central.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/** Отдать файл человеку: в Claude — через разрешённое сохранение, в обычном браузере — ссылкой. */
async function saveFile(blob, filename) {
  if (App.downloads) { await App.downloads.save({ filename, data: blob }); return true; }
  if (RT) throw { code: 'unavailable' };
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: filename, class: 'sr' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/* ── тема ── */
const HOST_THEME = document.documentElement.getAttribute('data-theme');
function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
  else if (HOST_THEME) root.setAttribute('data-theme', HOST_THEME); else root.removeAttribute('data-theme');
}
const themePref = () => { const v = lsGet('afterimage-theme'); return v === 'light' || v === 'dark' ? v : 'system'; };
applyTheme(themePref());

/* ── маленькие кирпичики интерфейса ── */
const btn = (label, onclick, cls = '', extra = {}) => h('button', { type: 'button', class: 'btn ' + cls, onclick, ...extra }, label);
const field = (id, label, input, hint) => h('div', { class: 'f' }, h('label', { class: 'mono', for: id }, label), input, hint ? h('p', { class: 'fine' }, hint) : null);
const emptyState = (title, text, ...actions) => h('div', { class: 'empty' }, h('h2', null, title), text ? h('p', null, text) : null, actions.length ? h('div', { class: 'actions' }, actions) : null);
/** Подтверждение прямо на странице (системные окна confirm в Claude не показываются). */
function confirmInline(host, text, yesLabel, onYes, { danger = true, word = '' } = {}) {
  const input = word ? h('input', { type: 'text', class: 'field', id: 'confirmWord', autocomplete: 'off', 'aria-label': `Введите слово «${word}» для подтверждения`, placeholder: `Введите «${word}»` }) : null;
  const yes = btn(yesLabel, async () => { if (word && input.value.trim().toLocaleLowerCase() !== word) { input.focus(); return; } yes.disabled = true; try { await onYes(); } finally { yes.disabled = false; } }, 'small ' + (danger ? 'danger' : 'solid'));
  const close = () => { host.hidden = true; host.replaceChildren(); };
  fill(host, h('div', { class: 'panel-form' }, h('p', null, text), input, h('div', { class: 'actions' }, yes, btn('Отмена', close, 'small'))));
  host.hidden = false; (input || yes).focus();
  return close;
}
