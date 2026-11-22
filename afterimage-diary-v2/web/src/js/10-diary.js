/* ───────────── дневник, «В этот день», коллекции, карта ───────────── */
const thumbImg = (m, cls) => (m && m.thumb ? h('img', { class: cls, src: m.thumb, alt: '', loading: 'lazy', style: { background: m.spec.palette.background } })
  : h('span', { class: cls + ' no-thumb', style: m ? { background: m.spec.palette.background, color: m.spec.palette.ink } : {} }, m ? m.spec.title : ''));
const memSub = (m) => [fmtDate(m.date), m.location].filter(Boolean).join(' · ');
const titleStyleOf = (sp) => ({ 'font-family': fontFamilyCss(sp.typography.display), 'font-style': sp.typography.italic ? 'italic' : 'normal' });
const loadFail = (body, retry) => fill(body, emptyState('Дневник не удалось открыть.', 'Хранилище не ответило. Записи при этом не потеряны.', btn('Попробовать ещё раз', () => { Store.docs = null; retry(); })));
const selectEl = (id, label, options, value, onchange) => { const s = h('select', { id, class: 'field select', 'aria-label': label, onchange: () => onchange(s.value) }, options.map(([v, t]) => h('option', { value: v }, t))); s.value = value; return s; };

async function viewDiary() {
  const root = view(); root.className = 'diary';
  const body = h('div', { class: 'diary-body' }, h('p', { class: 'loading mono' }, 'Открываю дневник…')), count = h('p', { class: 'mono' }, ' ');
  fill(root, h('div', { class: 'wrap' }, pageHead('Личный архив', 'Дневник', count, h('a', { class: 'btn mark', href: '#new' }, 'Новое воспоминание')), body));
  let all;
  try { all = await Store.list(); } catch { return loadFail(body, route); }
  if (root.className !== 'diary') return;
  count.textContent = all.length ? `${plural(all.length, F_REC)}  ·  ${Store.describe()}` : Store.describe();
  if (!all.length) {
    return fill(body, emptyState('Здесь пока нет дней.', 'Первая запись займёт около минуты: несколько предложений, фотография, песня. Записи появятся здесь списком, календарём и фотоплёнкой.',
      h('a', { class: 'btn mark', href: '#new' }, 'Создать первую запись')));
  }
  all.forEach((m) => loadFont(m.spec.typography.display));
  const F = App.filter, uniq = (fn) => [...new Set(all.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const years = uniq((m) => m.date.slice(0, 4)).reverse(), weathers = uniq((m) => m.weather), places = uniq((m) => m.location);
  const moods = new Map();
  all.forEach((m) => m.spec.emotion.dominant.forEach((e) => moods.set(e.name.toLowerCase(), (moods.get(e.name.toLowerCase()) || 0) + 1)));
  const topMoods = [...moods.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map((e) => e[0]);
  if (F.mood && !moods.has(F.mood)) F.mood = '';
  if (F.year && !years.includes(F.year)) F.year = '';
  if (F.weather && !weathers.includes(F.weather)) F.weather = '';
  if (F.place && !places.includes(F.place)) F.place = '';
  const list = h('div', { class: 'diary-list' }), found = h('p', { class: 'mono found', role: 'status' });
  const search = h('input', { type: 'search', id: 'diarySearch', class: 'field', placeholder: 'Поиск: текст, дата, место, песня, метка', value: F.q, 'aria-label': 'Поиск по дневнику', oninput: () => { F.q = search.value; draw(); } });
  const filters = h('div', { class: 'filters' },
    years.length > 1 ? selectEl('fYear', 'Год', [['', 'Все годы'], ...years.map((y) => [y, y])], F.year, (v) => { F.year = v; draw(); }) : null,
    weathers.length ? selectEl('fWeather', 'Погода', [['', 'Любая погода'], ...weathers.map((w) => [w, w])], F.weather, (v) => { F.weather = v; draw(); }) : null,
    places.length ? selectEl('fPlace', 'Место', [['', 'Все места'], ...places.map((p) => [p, p])], F.place, (v) => { F.place = v; draw(); }) : null);
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Фильтр по настроению' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Вид дневника' }, [['timeline', 'Список'], ['calendar', 'Календарь'], ['sheet', 'Фотоплёнка']].map(([k, label]) =>
    h('button', { type: 'button', role: 'tab', id: 'tab-' + k, dataset: { k }, onclick: () => { F.view = k; draw(); } }, label)));
  fill(body, h('div', { class: 'controls' }, search, tabs), filters, chips, found, list);
  const active = () => !!(F.q.trim() || F.mood || F.year || F.weather || F.place);
  const match = (m) => {
    if (F.year && !m.date.startsWith(F.year)) return false;
    if (F.weather && m.weather !== F.weather) return false;
    if (F.place && m.location !== F.place) return false;
    if (F.mood && !m.spec.emotion.dominant.some((e) => e.name.toLowerCase() === F.mood)) return false;
    const q = F.q.trim().toLowerCase();
    if (!q) return true;
    const hay = [m.spec.title, m.spec.caption, m.story, m.location, m.geo && m.geo.label, m.weather, tempLabel(m.tempC), songText(m.song), m.song && m.song.direction, m.tags.map((t) => '#' + t).join(' '), m.spec.direction.name,
      m.spec.emotion.dominant.map((e) => e.name).join(' '), fmtDate(m.date), fmtDate(m.date, { weekday: 'long', month: 'long' }), m.date, dotDate(m.date)].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w.replace(/^#/, '')) || hay.includes(w));
  };
  const reset = () => { F.q = ''; F.mood = ''; F.year = ''; F.weather = ''; F.place = ''; search.value = ''; $$('select', filters).forEach((s) => { s.value = ''; }); draw(); };
  function draw() {
    $$('button', tabs).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === F.view)));
    fill(chips, h('span', { class: 'mono' }, 'Настроение'), ...topMoods.map((name) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(F.mood === name), onclick: () => { F.mood = F.mood === name ? '' : name; draw(); } }, name)),
      active() ? h('button', { type: 'button', class: 'linkish', onclick: reset }, 'Сбросить фильтры') : null);
    const shown = all.filter(match);
    found.textContent = active() ? `Найдено: ${plural(shown.length, F_REC)} из ${all.length}` : '';
    if (F.view === 'calendar') return fill(list, calendarView(all, shown));
    if (!shown.length) return fill(list, h('div', { class: 'empty small' }, h('h2', null, 'Ничего не нашлось.'), h('p', null, 'Ни одна запись не подходит под этот поиск и фильтры.'), btn('Сбросить фильтры', reset)));
    fill(list, F.view === 'sheet' ? sheetView(shown) : timelineView(shown));
  }
  draw();
}

function entryRow(m) {
  const d = parseISO(m.date), sp = m.spec;
  return h('a', { class: 'entry', href: '#m-' + m.id },
    h('div', { class: 'entry-date' }, h('span', { class: 'day' }, String(d.getDate())), h('span', { class: 'mono' }, d.toLocaleDateString('ru-RU', { weekday: 'short' })), h('span', { class: 'mono' }, '№ ' + pad4(m.no))),
    h('div', { class: 'entry-thumb' }, thumbImg(m, 'thumb')),
    h('div', { class: 'entry-text' },
      h('h3', { style: titleStyleOf(sp) }, sp.title),
      sp.caption ? h('p', { class: 'entry-cap' }, sp.caption) : null,
      h('p', { class: 'mono entry-meta' }, [m.location, [m.weather, tempLabel(m.tempC)].filter(Boolean).join(', '), m.song ? '♪ ' + songText(m.song) : '', m.example ? 'Пример' : ''].filter(Boolean).join('  ·  ')),
      h('p', { class: 'entry-moods' }, sp.emotion.dominant.slice(0, 3).map((e) => h('span', { class: 'chip static' }, e.name)), m.tags.slice(0, 4).map((t) => h('span', { class: 'chip static tag' }, '#' + t)), paletteDots(sp.palette))));
}
function timelineView(mems) {
  const groups = new Map();
  mems.forEach((m) => { const k = m.date.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
  return h('div', { class: 'timeline' }, [...groups.entries()].map(([k, items]) => h('section', { class: 'month' },
    h('h2', { class: 'month-name' }, cap1(fmtDate(k + '-01', { month: 'long', year: 'numeric' }))), items.map(entryRow))));
}
function sheetView(mems, edge) {
  return h('div', { class: 'sheet' },
    h('p', { class: 'mono sheet-edge' }, edge || `AFTERIMAGE 400  ·  ФОТОПЛЁНКА  ·  ${plural(mems.length, F_FRAME).toLocaleUpperCase()}`),
    h('div', { class: 'sheet-grid' }, mems.map((m, i) => h('a', { class: 'frame', href: '#m-' + m.id, 'aria-label': `${m.spec.title}, ${fmtDate(m.date)}` },
      h('span', { class: 'frame-img' }, thumbImg(m, 'thumb'), svg(LOOP, 'grease')),
      h('span', { class: 'mono frame-no' }, `${String(i + 1).padStart(2, '0')}A  ▸  ${dotDate(m.date)}`),
      h('span', { class: 'frame-title' }, m.spec.title)))));
}
function calendarView(all, shown) {
  const shownIds = new Set(shown.map((m) => m.id));
  if (!App.cal) { const d = shown.length ? parseISO(shown[0].date) : all.length ? parseISO(all[0].date) : new Date(); App.cal = { y: d.getFullYear(), m: d.getMonth() }; }
  const host = h('div', { class: 'calendar' }), byDay = new Map();
  all.forEach((m) => { if (!byDay.has(m.date)) byDay.set(m.date, []); byDay.get(m.date).push(m); });
  const paintCal = () => {
    const { y, m } = App.cal, first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = todayISO(), cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'cal-cell void' }));
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, mems = byDay.get(iso) || [], hit = mems.find((x) => shownIds.has(x.id)) || mems[0];
      if (hit) cells.push(h('a', { class: 'cal-cell has' + (shownIds.has(hit.id) ? '' : ' dim') + (iso === today ? ' today' : ''), href: '#m-' + hit.id, 'aria-label': `${fmtDate(iso)}: ${hit.spec.title}` },
        thumbImg(hit, 'thumb'), h('span', { class: 'cal-num' }, String(d)), mems.length > 1 ? h('span', { class: 'cal-more mono' }, '+' + (mems.length - 1)) : null, h('span', { class: 'cal-title' }, hit.spec.title)));
      else if (iso <= today) cells.push(h('button', { type: 'button', class: 'cal-cell free' + (iso === today ? ' today' : ''), 'aria-label': `Создать запись за ${fmtDate(iso)}`, onclick: () => { App.presetDate = iso; go('new'); } }, h('span', { class: 'cal-num' }, String(d)), h('span', { class: 'cal-add mono' }, '+')));
      else cells.push(h('span', { class: 'cal-cell future' }, h('span', { class: 'cal-num' }, String(d))));
    }
    const shift = (n) => { const d = new Date(y, m + n, 1); App.cal = { y: d.getFullYear(), m: d.getMonth() }; paintCal(); };
    const inMonth = all.filter((x) => x.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).length;
    fill(host, 
      h('div', { class: 'cal-head' }, btn('←', () => shift(-1), 'small', { 'aria-label': 'Предыдущий месяц' }), h('h2', null, cap1(fmtDate(`${y}-${String(m + 1).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' }))), btn('→', () => shift(1), 'small', { 'aria-label': 'Следующий месяц' }),
        h('span', { class: 'mono' }, inMonth ? `В этом месяце: ${plural(inMonth, F_REC)}` : 'В этом месяце записей нет')),
      h('div', { class: 'cal-grid' }, ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => h('span', { class: 'cal-dow mono' }, w)), cells));
  };
  paintCal();
  return host;
}

/* ── «В этот день» ── */
async function viewToday() {
  const root = view(); root.className = 'today';
  const body = h('div', null, h('p', { class: 'loading mono' }, 'Листаю прошлые годы…'));
  const day = App.todayPick || todayISO(), isToday = day === todayISO();
  const picker = h('input', { type: 'date', id: 'todayPick', class: 'field date-pick', value: day, max: todayISO(), 'aria-label': 'Посмотреть другую дату', onchange: () => { App.todayPick = /^\d{4}-\d{2}-\d{2}$/.test(picker.value) ? picker.value : ''; route(); } });
  fill(root, h('div', { class: 'wrap' }, pageHead(isToday ? 'Сегодня, ' + fmtDate(day, { day: 'numeric', month: 'long' }) : fmtDate(day, { day: 'numeric', month: 'long' }), 'В этот день',
    'Записи, сохранённые в эту же дату в прошлые годы', h('div', { class: 'f inline' }, h('label', { class: 'mono', for: 'todayPick' }, 'Другая дата'), picker), !isToday ? btn('Вернуться к сегодня', () => { App.todayPick = ''; route(); }, 'small') : null), body));
  let all;
  try { all = await Store.list(); } catch { return loadFail(body, route); }
  if (root.className !== 'today') return;
  const hits = all.filter((m) => MD(m.date) === MD(day) && m.date.slice(0, 4) < day.slice(0, 4));
  if (!hits.length) {
    return fill(body, emptyState(all.length ? 'В этот день в прошлые годы записей нет.' : 'В дневнике пока нет записей.',
      all.length ? 'Когда в дневнике появится запись с этой датой, через год она покажется здесь. Ничего придуманного сюда не попадает.' : 'Здесь будут появляться дни, сохранённые ровно год, два или десять лет назад.',
      h('a', { class: 'btn mark', href: '#new' }, 'Сохранить сегодняшний день'), all.length ? h('a', { class: 'btn', href: '#diary' }, 'Открыть дневник') : null));
  }
  hits.forEach((m) => loadFont(m.spec.typography.display));
  fill(body, h('div', { class: 'onday' }, hits.map((m) => {
    const years = +day.slice(0, 4) - +m.date.slice(0, 4);
    return h('a', { class: 'onday-card', href: '#m-' + m.id },
      h('div', { class: 'onday-img' }, thumbImg(m, 'thumb')),
      h('div', { class: 'onday-text' },
        h('p', { class: 'onday-ago' }, plural(years, ['год', 'года', 'лет']) + ' назад'),
        h('p', { class: 'mono' }, cap1(fmtDate(m.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))),
        h('h2', { style: titleStyleOf(m.spec) }, m.spec.title),
        m.spec.caption ? h('p', { class: 'entry-cap' }, m.spec.caption) : null,
        h('p', { class: 'mono' }, [m.location, m.song ? '♪ ' + songText(m.song) : ''].filter(Boolean).join('  ·  ')),
        h('span', { class: 'linkish' }, 'Открыть запись →')));
  })));
}

/* ── коллекции ── */
const colRange = (items) => (items.length ? (items[0].date.slice(0, 7) === items[items.length - 1].date.slice(0, 7) ? cap1(fmtDate(items[0].date, { month: 'long', year: 'numeric' })) : `${fmtDate(items[0].date, { month: 'short', year: 'numeric' })} — ${fmtDate(items[items.length - 1].date, { month: 'short', year: 'numeric' })}`) : '');
const colItems = (c, mem) => c.items.map((id) => mem.get(id)).filter(Boolean).sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
/** Форма коллекции: название, описание, обложка из её записей. */
function collectionForm(col, items, onSave, onCancel) {
  const title = h('input', { type: 'text', id: 'colTitle', class: 'field', maxlength: 80, required: true, placeholder: 'Стамбул — весна 2026' }), desc = h('textarea', { id: 'colDesc', class: 'field area', rows: 3, maxlength: 400, placeholder: 'О чём эта коллекция (необязательно)' });
  title.value = col ? col.title : ''; desc.value = col ? col.description : '';
  let cover = col ? col.cover : '';
  const err = h('p', { class: 'form-error', role: 'alert' });
  const covers = items && items.length ? h('fieldset', { class: 'cover-pick' }, h('legend', { class: 'mono' }, 'Обложка'), items.map((m) => {
    const r = h('input', { type: 'radio', name: 'colCover', id: 'cc-' + m.id, class: 'sr', value: m.id, checked: (cover || items[0].id) === m.id, onchange: () => { cover = m.id; } });
    return h('span', { class: 'cover-opt' }, r, h('label', { for: 'cc-' + m.id, title: m.spec.title }, thumbImg(m, 'thumb'), h('span', { class: 'sr' }, m.spec.title)));
  })) : null;
  const save = h('button', { type: 'submit', class: 'btn small solid' }, col ? 'Сохранить' : 'Создать коллекцию');
  return h('form', { class: 'col-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const t = str(title.value, 80);
    if (!t) { err.textContent = 'Дайте коллекции название.'; return title.focus(); }
    save.disabled = true;
    try { await onSave({ title: t, description: str(desc.value, 400), cover }); } catch (e2) { console.error(e2); err.textContent = (e2 && e2.message) || 'Коллекцию не удалось сохранить. Попробуйте ещё раз.'; save.disabled = false; }
  } }, field('colTitle', 'Название', title), field('colDesc', 'Описание', desc), covers, err, h('div', { class: 'actions' }, save, onCancel ? btn('Отмена', onCancel, 'small') : null));
}
const newCollection = (data, items = []) => ({ id: 'c-' + newId(), kind: 'collection', title: data.title, description: data.description || '', cover: data.cover || '', items, createdAt: new Date().toISOString() });

async function viewCollections() {
  const root = view(); root.className = 'collections';
  const body = h('div', null, h('p', { class: 'loading mono' }, 'Открываю коллекции…')), panel = h('div', { class: 'inline-panel', hidden: true });
  const add = btn('Новая коллекция', () => { fill(panel, collectionForm(null, null, async (data) => { const c = await Store.saveCollection(newCollection(data)); toast('Коллекция создана.'); go(c.id); }, () => { panel.hidden = true; })); panel.hidden = false; $('#colTitle').focus(); }, 'mark');
  fill(root, h('div', { class: 'wrap' }, pageHead('Поездки, места, темы', 'Коллекции', 'Записи можно собирать в коллекции; одна запись может быть в нескольких', add), panel, body));
  let cols, d;
  try { cols = await Store.collections(); d = await Store.load(); } catch { return loadFail(body, route); }
  if (root.className !== 'collections') return;
  if (!cols.length) return fill(body, emptyState('Коллекций пока нет.', 'Коллекция объединяет записи одной поездки, места или темы — например, «Алматы» или «Лето у моря». Создать её можно здесь или при сохранении записи.', btn('Создать коллекцию', () => add.click())));
  fill(body, h('div', { class: 'col-grid' }, cols.map((c) => {
    const items = colItems(c, d.mem), cover = d.mem.get(c.cover) || items[0];
    return h('a', { class: 'col-card', href: '#' + c.id },
      h('span', { class: 'col-cover' }, cover ? thumbImg(cover, 'thumb') : h('span', { class: 'thumb no-thumb blank' }, 'Пока пусто')),
      h('span', { class: 'col-text' }, h('strong', null, c.title), c.description ? h('span', { class: 'col-desc' }, c.description) : null, h('span', { class: 'mono' }, [plural(items.length, F_REC), colRange(items)].filter(Boolean).join('  ·  '))));
  })));
}

async function viewCollection(id) {
  const root = view(); root.className = 'collection';
  fill(root, h('div', { class: 'wrap' }, h('p', { class: 'loading mono' }, 'Открываю коллекцию…')));
  let d;
  try { d = await Store.load(); } catch { return loadFail(root.firstChild, route); }
  if (location.hash !== '#' + id) return;
  const c = d.col.get(id);
  if (!c) return fill(root, h('div', { class: 'wrap' }, emptyState('Такой коллекции нет.', 'Возможно, её удалили.', h('a', { class: 'btn', href: '#collections' }, 'Все коллекции'))));
  const items = colItems(c, d.mem), panel = h('div', { class: 'inline-panel', hidden: true }), withGeo = items.filter((m) => m.geo).length;
  items.forEach((m) => loadFont(m.spec.typography.display));
  const openAdd = () => {
    const rest = [...d.mem.values()].filter((m) => !c.items.includes(m.id)).sort((a, b) => b.date.localeCompare(a.date)), picked = new Set();
    if (!rest.length) { fill(panel, h('p', null, d.mem.size ? 'Все записи дневника уже в этой коллекции.' : 'В дневнике пока нет записей.'), btn('Закрыть', () => { panel.hidden = true; }, 'small')); panel.hidden = false; return; }
    const go3 = btn('Добавить выбранные', async () => { go3.disabled = true; try { c.items = [...c.items, ...picked]; await Store.saveCollection(c); toast(`Добавлено: ${plural(picked.size, F_REC)}.`); viewCollection(id); } catch (e) { console.error(e); go3.disabled = false; toast('Не удалось добавить записи.'); } }, 'small solid', { disabled: true });
    fill(panel, h('p', { class: 'mono' }, 'Добавить записи в коллекцию'), h('ul', { class: 'pick-list' }, rest.map((m) => {
      const cb = h('input', { type: 'checkbox', id: 'pk-' + m.id, onchange: () => { if (cb.checked) picked.add(m.id); else picked.delete(m.id); go3.disabled = !picked.size; } });
      return h('li', null, cb, h('label', { for: 'pk-' + m.id }, thumbImg(m, 'thumb'), h('span', null, h('strong', null, m.spec.title), h('span', { class: 'mono' }, memSub(m)))));
    })), h('div', { class: 'actions' }, go3, btn('Отмена', () => { panel.hidden = true; }, 'small')));
    panel.hidden = false;
  };
  const actions = h('div', { class: 'actions' },
    btn('Добавить записи', openAdd, 'small solid'),
    btn('Изменить', () => { fill(panel, collectionForm(c, items, async (data) => { Object.assign(c, data); await Store.saveCollection(c); toast('Коллекция сохранена.'); viewCollection(id); }, () => { panel.hidden = true; })); panel.hidden = false; $('#colTitle').focus(); }, 'small'),
    withGeo ? btn('Показать на карте', () => { App.mapCol = c.id; go('map'); }, 'small') : null,
    btn('Удалить коллекцию', () => confirmInline(panel, `Удалить коллекцию «${c.title}»? Сами записи останутся в дневнике.`, 'Удалить коллекцию', async () => { try { await Store.removeCollection(c.id); toast('Коллекция удалена. Записи на месте.'); go('collections'); } catch (e) { console.error(e); toast('Коллекцию не удалось удалить.'); } }), 'small'));
  const film = items.length ? h('div', { class: 'col-film', tabindex: 0, role: 'group', 'aria-label': 'Записи коллекции по порядку' }, items.map((m, i) => h('div', { class: 'col-frame' },
    h('a', { href: '#m-' + m.id, class: 'col-frame-img', 'aria-label': `${m.spec.title}, ${fmtDate(m.date)}` }, thumbImg(m, 'thumb')),
    h('span', { class: 'mono frame-no' }, `${String(i + 1).padStart(2, '0')}A  ▸  ${dotDate(m.date)}`),
    h('a', { href: '#m-' + m.id, class: 'frame-title', style: titleStyleOf(m.spec) }, m.spec.title),
    m.location ? h('span', { class: 'mono' }, m.location) : null,
    h('button', { type: 'button', class: 'linkish small-link', onclick: async (e) => { e.target.disabled = true; try { c.items = c.items.filter((x) => x !== m.id); if (c.cover === m.id) c.cover = ''; await Store.saveCollection(c); toast('Запись убрана из коллекции. В дневнике она осталась.'); viewCollection(id); } catch (er) { console.error(er); e.target.disabled = false; toast('Не удалось убрать запись.'); } } }, 'Убрать из коллекции'))))
    : emptyState('В коллекции пока нет записей.', 'Добавьте записи из дневника: сами они при этом никуда не перемещаются.', btn('Добавить записи', openAdd, 'mark'));
  fill(root, h('div', { class: 'wrap' },
    h('p', { class: 'crumb' }, h('a', { class: 'mono', href: '#collections' }, '← Коллекции')),
    pageHead('Коллекция', c.title, [plural(items.length, F_REC), colRange(items), withGeo ? `${plural(withGeo, F_PLACE)} на карте` : ''].filter(Boolean).join('  ·  ')),
    c.description ? h('p', { class: 'col-lead' }, c.description) : null, actions, panel,
    items.length ? h('p', { class: 'mono sheet-edge on-paper' }, `AFTERIMAGE 400  ·  ${c.title.toLocaleUpperCase()}  ·  ${plural(items.length, F_FRAME).toLocaleUpperCase()}`) : null, film));
}

/* ── карта ── */
const toMarker = (m) => ({ id: m.id, lat: m.geo.lat, lon: m.geo.lon, title: m.spec.title, sub: memSub(m), thumb: m.thumb, href: '#m-' + m.id });
async function viewMap() {
  const root = view(); root.className = 'mapview';
  const body = h('div', null, h('p', { class: 'loading mono' }, 'Раскладываю карту…'));
  fill(root, h('div', { class: 'wrap' }, pageHead('Где это было', 'Карта', 'Записи, у которых указано место'), body));
  let all, cols, d;
  try { all = await Store.list(); cols = await Store.collections(); d = await Store.load(); } catch { return loadFail(body, route); }
  if (root.className !== 'mapview') return;
  const placed = all.filter((m) => m.geo);
  if (!placed.length) {
    const map = createMap({ label: 'Карта без меток' });
    App.cleaners.push(() => map.destroy());
    return fill(body, h('div', { class: 'map-empty' }, emptyState(all.length ? 'Ни у одной записи пока нет места на карте.' : 'На карте пока пусто.',
      'Место добавляется в форме записи: найдите город или поставьте метку вручную. Местоположение устройства приложение не запрашивает.',
      all.length ? h('a', { class: 'btn', href: '#diary' }, 'Открыть дневник') : null, h('a', { class: 'btn mark', href: '#new' }, 'Новое воспоминание')), map.el), mapNote());
  }
  if (App.mapCol && !d.col.has(App.mapCol)) App.mapCol = '';
  const map = createMap({ markers: [] }), info = h('p', { class: 'mono map-info', role: 'status' }), side = h('div', { class: 'map-side' });
  App.cleaners.push(() => map.destroy());
  const withPlaces = cols.filter((c) => colItems(c, d.mem).some((m) => m.geo));
  const pickCol = selectEl('mapCol', 'Что показать', [['', 'Все записи'], ...withPlaces.map((c) => [c.id, 'Маршрут: ' + c.title])], App.mapCol, (v) => { App.mapCol = v; draw(); });
  function draw() {
    const col = App.mapCol ? d.col.get(App.mapCol) : null;
    const list = col ? colItems(col, d.mem).filter((m) => m.geo) : placed.slice().sort((a, b) => b.date.localeCompare(a.date));
    map.set({ markers: list.map(toMarker), route: !!col }); map.fit();
    const noGeo = col ? colItems(col, d.mem).length - list.length : all.length - placed.length;
    info.textContent = (col ? `Маршрут коллекции в хронологическом порядке: ${plural(list.length, ['точка', 'точки', 'точек'])}` : `На карте: ${plural(list.length, F_REC)}`) + (noGeo ? `  ·  без места: ${noGeo}` : '');
    if (col) fill(side, h('ol', { class: 'route-list' }, list.map((m) => h('li', null, h('button', { type: 'button', class: 'linkish', onclick: () => map.focus(m.geo.lat, m.geo.lon, 10) }, m.location || fmtCoord(m.geo.lat, m.geo.lon)), h('span', { class: 'mono' }, fmtDate(m.date)), h('a', { href: '#m-' + m.id }, m.spec.title)))));
    else {
      const groups = new Map();
      list.forEach((m) => { const k = m.location || fmtCoord(m.geo.lat, m.geo.lon); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
      fill(side, h('ul', { class: 'place-list' }, [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, ms]) => h('li', null,
        h('button', { type: 'button', class: 'linkish', onclick: () => map.focus(ms[0].geo.lat, ms[0].geo.lon, 10) }, name), h('span', { class: 'mono' }, plural(ms.length, F_REC)),
        h('span', { class: 'place-links' }, ms.slice(0, 4).map((m) => h('a', { href: '#m-' + m.id }, m.spec.title)), ms.length > 4 ? h('span', { class: 'mono' }, `и ещё ${ms.length - 4}`) : null)))));
    }
  }
  fill(body, h('div', { class: 'map-bar' }, withPlaces.length ? h('div', { class: 'f inline' }, h('label', { class: 'mono', for: 'mapCol' }, 'Показать'), pickCol) : null, info),
    h('div', { class: 'map-layout' }, map.el, side), mapNote());
  draw();
}
const mapNote = () => h('p', { class: 'fine map-note' }, 'Это обзорная схема суши, нарисованная для дневника: без границ, городов и улиц. Картографический сервис не подключён. Метки стоят по координатам записи; точное место можно открыть в OpenStreetMap со страницы записи. Плюс и минус меняют масштаб, карту можно двигать, двойной щелчок приближает.');
