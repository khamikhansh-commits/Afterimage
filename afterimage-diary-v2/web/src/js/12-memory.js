/* ───────────── страница записи, профиль, настройки, запуск ───────────── */
async function viewMemory(id) {
  const root = view(); root.className = 'memory';
  fill(root, h('div', { class: 'wrap' }, h('p', { class: 'loading mono' }, 'Открываю запись…')));
  let mem = null;
  try { mem = await Store.get(id); } catch { mem = null; }
  if (location.hash !== '#m-' + id) return;
  if (!mem) return fill(root, h('div', { class: 'wrap' }, emptyState('Этой записи нет в дневнике.', Store.mode === 'local' ? 'Возможно, её удалили или она сохранена в другом браузере или в аккаунте.' : 'Возможно, её удалили.', h('a', { class: 'btn', href: '#diary' }, 'Вернуться в дневник'))));
  const intro = App.fresh === id; App.fresh = '';
  renderMemory(mem, intro);
}
const engineTextOf = (mem) => (mem.example ? 'Пример · оформление написано заранее'
  : mem.engine.kind === 'claude' ? `Арт-дирекция ИИ${mem.engine.sawPhotos ? ' · он видел фотографии' : ' · по тексту и измеренным цветам'}` : 'Демо-режим · встроенный движок, не ИИ') + (mem.engine.edited ? ' · поправлено вручную' : '');
const toneLabel = (t) => { const v = Math.round(t * 100); return `${v > 0 ? '+' : '−'}${Math.abs(v)}, ${v > 0 ? 'теплее' : 'холоднее'}`; };

function renderMemory(mem, intro) {
  cleanup();
  const root = view(), sp = mem.spec, pal = tonePalette(sp.palette, sp.tone), ty = sp.typography;
  loadFont(ty.display); loadFont(ty.body);
  const canvas = h('canvas', { class: 'art', role: 'img', 'aria-label': `Оформленная запись: ${sp.title}` }), stageNote = h('p', { class: 'mono m-note' });
  let scene = null, art = null, canvases = null, alive = true;
  App.cleaners.push(() => { alive = false; });
  const engineText = engineTextOf(mem);

  /* заголовок, который можно поправить на месте */
  const titleStyle = { 'font-family': fontFamilyCss(ty.display), 'font-style': ty.italic ? 'italic' : 'normal', 'font-weight': String(nearestWeight(ty.display, ty.weight)), 'text-transform': ty.case === 'upper' ? 'uppercase' : ty.case === 'lower' ? 'lowercase' : 'none', 'letter-spacing': ty.tracking + 'em' };
  const titleRow = h('div', { class: 'm-title-row' });
  const showTitle = () => fill(titleRow, h('h1', { class: 'm-title', style: titleStyle }, sp.title), h('button', { type: 'button', class: 'linkish', onclick: editTitle }, 'Изменить заголовок'));
  function editTitle() {
    const input = h('input', { type: 'text', id: 'titleEdit', class: 'field title-edit', maxlength: 90, 'aria-label': 'Заголовок записи' });
    input.value = sp.title;
    const save = async () => {
      const v = str(input.value, 90);
      if (!v || v === sp.title) return showTitle();
      const old = sp.title, oldThumb = mem.thumb; sp.title = v;
      try { if (canvases && !canvases.some((c) => c.dataset.missing)) { const s2 = await buildScene({ spec: sp, canvases, meta: mem }); mem.thumb = sceneThumb(s2) || mem.thumb; } mem.engine.edited = true; await Store.persist(mem, []); toast('Заголовок сохранён.'); renderMemory(mem, false); }
      catch (e) { sp.title = old; mem.thumb = oldThumb; console.error(e); toast('Заголовок не удалось сохранить. Попробуйте ещё раз.'); showTitle(); }
    };
    fill(titleRow, h('form', { class: 'title-form', onsubmit: (e) => { e.preventDefault(); save(); } }, input, h('button', { class: 'btn small solid', type: 'submit' }, 'Сохранить'), btn('Отмена', showTitle, 'small')));
    input.focus(); input.select();
  }
  showTitle();

  /* действия */
  const panel = h('div', { class: 'm-panel', hidden: true });
  const listenBtn = btn('Слушать', () => listen(mem, listenBtn), 'small', { hidden: !(App.tts || 'speechSynthesis' in window), dataset: { act: 'listen' } });
  const designBtn = btn('Оформление', async () => { designBtn.disabled = true; try { await openStudio(mem); } catch (e) { console.error(e); designBtn.disabled = false; toast('Оформление не удалось открыть. Попробуйте ещё раз.'); } }, 'small');
  const actions = h('div', { class: 'm-actions' },
    btn('Повторить', () => { if (art) art.replay(); canvas.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); }, 'small'),
    listenBtn,
    btn('Поделиться', () => shareMemory(mem, scene), 'small'),
    h('a', { class: 'btn small', href: '#edit-' + mem.id }, 'Изменить запись'),
    designBtn,
    mem.prevSpec ? btn('Вернуть прежнее оформление', async (e) => {
      const b = e.currentTarget, curSpec = mem.spec, oldThumb = mem.thumb; b.disabled = true;
      mem.spec = mem.prevSpec; mem.prevSpec = curSpec;
      try { if (canvases && !canvases.some((c) => c.dataset.missing)) { const s2 = await buildScene({ spec: mem.spec, canvases, meta: mem }); mem.thumb = sceneThumb(s2) || mem.thumb; } await Store.persist(mem, []); toast('Прежнее оформление возвращено.'); }
      catch (er) { mem.prevSpec = mem.spec; mem.spec = curSpec; mem.thumb = oldThumb; console.error(er); toast('Не получилось вернуть прежнее оформление.'); }
      renderMemory(mem, true);
    }, 'small') : null,
    btn('Удалить', () => confirmInline(panel, 'Удалить эту запись вместе с её фотографиями и аудио? Вернуть её будет нельзя.', 'Удалить запись', async () => {
      try { await Store.remove(mem); App.canvasCache.delete(mem.id); toast('Запись удалена.'); go('diary'); } catch (er) { console.error(er); toast('Запись не удалось удалить. Попробуйте ещё раз.'); }
    }), 'small'));

  /* музыка */
  const songBox = h('section', { class: 'm-sec m-song' });
  if (mem.song) {
    const s = mem.song, audioHost = h('div', { class: 'song-audio' }), named = s.title || s.artist, q = [s.title, s.artist].filter(Boolean).join(' ');
    append(songBox, [h('p', { class: 'mono' }, named || s.url || s.audio ? 'Музыка дня' : 'Музыкальное направление'),
      named ? h('p', { class: 'song-line' }, h('span', { class: 'note', 'aria-hidden': 'true' }, '♪'), h('span', null, h('strong', null, s.title || 'Без названия'), s.artist ? ' — ' + s.artist : '')) : null,
      audioHost, s.url ? linkCard(s.url) : null,
      named && !s.url ? h('div', { class: 'dir-links solo' }, h('span', { class: 'mono' }, 'Найти в'), searchLinks(q).map(([name, href]) => ext(name, href, 'linkish small-link')), h('p', { class: 'fine' }, 'Это ссылки на поиск в музыкальных сервисах. Каталог песен не подключён, поэтому приложение не проверяет, есть ли там эта запись.')) : null,
      s.direction ? h('div', { class: 'dir on solo' }, h('div', { class: 'dir-text' }, h('strong', null, cap1(s.direction)), s.why ? h('span', null, s.why) : null), h('div', { class: 'dir-links' }, searchLinks(s.query || s.direction).map(([name, href]) => ext(name, href, 'linkish small-link')))) : null,
      s.direction ? h('p', { class: 'fine' }, s.by === 'claude' ? 'Направление предложил ИИ по рассказу. Это не конкретная песня: каталог не подключён, и ИИ не выдумывает треки.' : 'Направление подобрано встроенным движком по ключевым словам рассказа. Это не ИИ и не конкретная песня.') : null]);
    if (s.audio) Store.audioBlob(mem).then((blob) => {
      if (!alive) return;
      if (!blob) return audioHost.append(h('p', { class: 'fine' }, `Аудиофайл (${s.audio.name || 'без названия'}) прикреплён на другом устройстве и хранится там.`));
      const url = URL.createObjectURL(blob), player = h('audio', { controls: true, preload: 'metadata', src: url });
      audioHost.append(player, h('p', { class: 'fine' }, `Ваш аудиофайл${s.audio.name ? ' «' + s.audio.name + '»' : ''}. Он играет только по нажатию.`));
      let ac = null, raf = 0;
      player.addEventListener('play', () => { // оформление дышит вместе с музыкой
        try {
          if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaElementSource(player), an = ac.createAnalyser(); an.fftSize = 256; src.connect(an); an.connect(ac.destination); ac.an = an; ac.buf = new Uint8Array(an.frequencyBinCount); }
          ac.resume();
          const tick = () => { if (!alive || player.paused) { if (scene) scene.pulse = 0; return; } ac.an.getByteFrequencyData(ac.buf); let sum = 0; for (let i = 0; i < 24; i++) sum += ac.buf[i]; if (scene) scene.pulse = lerp(scene.pulse, clamp(sum / 24 / 200, 0, 1), 0.25); raf = requestAnimationFrame(tick); };
          cancelAnimationFrame(raf); tick();
        } catch { /* анализ звука — приятная мелочь, без него всё работает */ }
      });
      App.cleaners.push(() => { cancelAnimationFrame(raf); player.pause(); URL.revokeObjectURL(url); if (ac) ac.close().catch(() => {}); });
    });
  }

  /* детали дня: место, погода, метки, коллекции */
  const d = parseISO(mem.date), colHost = h('dd', null, h('span', { class: 'fine' }, '…')), mapHost = h('div', { class: 'm-map' });
  const factRows = [['Дата', cap1(d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, ''))]];
  if (mem.location || mem.geo) factRows.push(['Место', h('span', null, mem.location || 'Без названия', mem.geo ? [h('span', { class: 'mono geo-coords' }, fmtCoord(mem.geo.lat, mem.geo.lon) + (mem.geo.src === 'ai' ? '  ·  приблизительно' : '')), ' ', ext('OpenStreetMap', osmLink(mem.geo), 'linkish small-link'), ' ', h('a', { class: 'linkish small-link', href: '#map' }, 'Карта дневника')] : null)]);
  if (mem.weather || mem.tempC != null) factRows.push(['Погода', [mem.weather, tempLabel(mem.tempC)].filter(Boolean).join(', ')]);
  if (mem.tags.length) factRows.push(['Метки', h('span', { class: 'chips-inline' }, mem.tags.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => { Object.assign(App.filter, { q: '#' + t, mood: '', year: '', weather: '', place: '' }); go('diary'); } }, '#' + t)))]);
  const facts = h('section', { class: 'm-sec m-facts' }, h('p', { class: 'mono' }, 'Детали дня'),
    h('dl', { class: 'spec-table' }, factRows.map(([k, v]) => [h('dt', { class: 'mono' }, k), h('dd', null, v)]), h('dt', { class: 'mono' }, 'Коллекции'), colHost), mapHost);
  Store.collections().then((cols) => {
    if (!alive) return;
    const mine = cols.filter((c) => c.items.includes(mem.id));
    fill(colHost, mine.length ? h('span', { class: 'chips-inline' }, mine.map((c) => h('a', { class: 'chip', href: '#' + c.id }, c.title))) : h('span', { class: 'fine' }, 'Запись не входит ни в одну коллекцию. '), ' ', h('a', { class: 'linkish small-link', href: '#edit-' + mem.id }, mine.length ? 'Изменить' : 'Добавить'));
  }).catch(() => fill(colHost, h('span', { class: 'fine' }, 'Коллекции сейчас не открылись.')));
  if (mem.geo) { const map = createMap({ markers: [{ id: mem.id, lat: mem.geo.lat, lon: mem.geo.lon, title: sp.title, sub: memSub(mem), thumb: mem.thumb, href: '#m-' + mem.id }], label: 'Место записи на карте' }); mapHost.append(map.el); App.cleaners.push(() => map.destroy()); requestAnimationFrame(() => { if (alive) map.focus(mem.geo.lat, mem.geo.lon, 2.6); }); }

  /* оригиналы */
  const gallery = h('div', { class: 'gallery' }, mem.photos.map(() => h('div', { class: 'g-item wait' })));
  const galleryNote = h('p', { class: 'fine' }, mem.photos.some((p) => p.ref && p.ref.k === 's') ? 'Это нарисованные программой образцы, а не настоящие фотографии.' : 'Такими, какими вы их добавили. Обработка и кадрирование применяются к копиям.');

  /* настроение */
  const e = sp.emotion, barCol = contrast(pal.accent, '#8A8A8A') > 1.15 ? pal.accent : pal.ink;
  const gauge = (label, lo, hi, v) => h('div', { class: 'gauge' }, h('span', { class: 'mono' }, label), h('div', { class: 'gauge-track', role: 'img', 'aria-label': `${label}: ${Math.round(v * 100)} из 100` }, h('i', { style: { left: (v * 100).toFixed(1) + '%' } })), h('div', { class: 'gauge-ends fine' }, h('span', null, lo), h('span', null, hi)));
  const emotion = h('section', { class: 'm-sec' }, h('p', { class: 'mono' }, mem.engine.kind === 'claude' || mem.example ? 'Как ИИ прочитал день' : 'Что нашёл демо-движок'), h('h2', null, 'Настроение'),
    e.atmosphere ? h('p', { class: 'atmo' }, e.atmosphere) : null,
    h('div', { class: 'emo-grid' },
      h('div', { class: 'bars' }, e.dominant.map((x) => h('div', { class: 'emo-bar' }, h('span', null, x.name), h('div', { class: 'bar-track' }, h('i', { style: { width: Math.round(x.intensity * 100) + '%', background: barCol } })), h('span', { class: 'mono' }, String(Math.round(x.intensity * 100)))))),
      h('div', { class: 'gauges' }, gauge('Энергия', 'покой', 'беспокойство', e.energy), gauge('Тон', 'тяжело', 'светло', e.valence), gauge('Сила', 'едва заметно', 'через край', e.intensity))),
    e.sensory.length ? h('div', { class: 'sens' }, h('span', { class: 'mono' }, mem.engine.kind === 'local' && !mem.example ? 'Найденные слова' : 'Детали из рассказа'), e.sensory.map((x) => h('span', { class: 'chip static' }, x))) : null,
    e.context ? h('p', { class: 'ctx' }, h('span', { class: 'mono' }, 'Контекст'), ' ', e.context) : null,
    sp.relationship ? h('p', { class: 'ctx' }, h('span', { class: 'mono' }, 'Слова, снимки, музыка'), ' ', sp.relationship) : null,
    h('p', { class: 'fine' }, 'Это прочтение вашего рассказа, а не факты о дне. Сам рассказ хранится без изменений.'));

  /* палитра и референсы */
  const ROLE = { background: 'Фон', surface: 'Плашка', ink: 'Текст', accent: 'Акцент', accent2: 'Второй акцент', muted: 'Приглушённый' };
  const palette = h('section', { class: 'm-sec' }, h('p', { class: 'mono' }, 'Палитра'), h('h2', null, 'Шесть цветов этого дня'),
    h('div', { class: 'swatches' }, PALETTE_KEYS.map((k, i) => h('button', { type: 'button', class: 'swatch', title: 'Скопировать ' + pal[k], onclick: async () => toast((await copyText(pal[k])) ? `Скопировано: ${pal[k]}` : pal[k]) },
      h('i', { style: { background: pal[k] } }), h('span', { class: 'mono' }, ROLE[k]), sp.palette.names[i] ? h('span', { class: 'sw-name' }, sp.palette.names[i]) : null, h('span', { class: 'mono sw-hex' }, pal[k])))),
    h('div', { class: 'm-ideas' }, h('p', { class: 'mono' }, 'Идеи и референсы'), pinterestBlock(sp, mem.brief)));

  /* художественное решение */
  const pct = (v) => Math.round(v * 100) + '%', P = sp.photo;
  const treat = [`насыщенность ${pct(P.saturation)}`, `контраст ${pct(P.contrast)}`, P.warmth ? `${P.warmth > 0 ? 'теплее' : 'холоднее'} на ${pct(Math.abs(P.warmth))}` : '', P.fade > 0.02 ? `выцветшие тени ${pct(P.fade)}` : '', P.tintStrength > 0.02 ? `тонирование ${P.tint}, ${pct(P.tintStrength)}` : '', P.duotone > 0.02 ? `дуотон ${pct(P.duotone)}` : '', P.softness > 0.03 ? `свечение ${pct(P.softness)}` : '', P.vignette > 0.03 ? `виньетка ${pct(P.vignette)}` : '', P.frame !== 'none' ? RU.frame[P.frame] : ''].filter(Boolean).join(', ');
  const rows = [
    ['Шрифты', `${FONTS[ty.display].family} и ${FONTS[ty.body].family} — насыщенность ${ty.weight}${ty.italic ? ', курсив' : ''}, ${RU.kase[ty.case]}`, ty.note],
    ['Шаблон', `«${TEMPLATE_NAMES[sp.composition.layout]}», ${RU.format[sp.composition.format]} формат`, sp.composition.note],
    ['Текст', `${RU.align[sp.composition.align]}, заголовок ${sp.composition.titlePlacement === 'top' ? 'сверху' : 'снизу'}; ${sp.composition.tilt < 0.25 ? 'строго по сетке' : sp.composition.tilt < 0.6 ? 'немного свободнее' : 'разложено от руки'}`, ''],
    ['Обработка снимков', treat, P.note],
    sp.tone ? ['Цветовая температура', toneLabel(sp.tone), mem.brief.toneWhy && Math.abs(mem.brief.toneSuggested - sp.tone) < 0.03 ? mem.brief.toneWhy : 'Меняет только цвет оформления, а не погоду в записи.'] : null,
    ['Фактура', sp.texture.kind === 'none' ? 'нет' : `${RU.texture[sp.texture.kind]}, ${pct(sp.texture.intensity)}`, sp.texture.note],
    ['Эффект', sp.motif.kind === 'none' ? 'нет' : `${RU.motif[sp.motif.kind]}: плотность ${pct(sp.motif.density)}, скорость ${pct(sp.motif.speed)}`, sp.motif.note],
    ['Движение', `появление — ${RU.entrance[sp.motion.entrance]}; между снимками — ${RU.transition[sp.motion.transition]}; темп ${RU.tempo[sp.motion.tempo]}; движение камеры ${pct(sp.motion.kenBurns)}`, sp.motion.note],
  ].filter(Boolean);
  const emblemCanvas = sp.emblem ? h('canvas', { class: 'emblem', width: 160, height: 160, role: 'img', 'aria-label': 'Эмблема: ' + (sp.emblem.subject || 'знак этого дня') }) : null;
  if (emblemCanvas) { const x = emblemCanvas.getContext('2d'); x.fillStyle = pal.background; x.fillRect(0, 0, 160, 160); x.translate(20, 20); x.scale(1.2, 1.2); x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ensureContrast(pal.accent, pal.background, 2.2); sp.emblem.paths.forEach((pth) => { try { x.stroke(new Path2D(pth)); } catch { /* пропускаем */ } }); }
  const direction = h('section', { class: 'm-sec' }, h('p', { class: 'mono' }, 'Художественное решение'), h('h2', null, sp.direction.name),
    sp.direction.statement ? h('p', { class: 'atmo' }, sp.direction.statement) : null,
    h('div', { class: 'specimen', style: { background: pal.background, color: pal.ink } },
      h('span', { class: 'spec-big', style: titleStyle }, isCyrillic(sp.title) ? 'Аа Яя' : 'Aa Gg'), h('span', { style: { 'font-family': fontFamilyCss(ty.body) } }, sp.caption || sp.title),
      emblemCanvas ? h('span', { class: 'spec-emblem' }, emblemCanvas, h('span', { class: 'mono' }, 'Эмблема дня' + (sp.emblem.subject ? ': ' + sp.emblem.subject : ''))) : null),
    h('dl', { class: 'spec-table' }, rows.map(([k, v, n]) => [h('dt', { class: 'mono' }, k), h('dd', null, h('span', null, v), n ? h('span', { class: 'why' }, n) : null)])),
    sp.direction.references.length ? h('p', { class: 'refs' }, h('span', { class: 'mono' }, 'Художественные ориентиры'), ' ', sp.direction.references.join('  ·  ')) : null,
    sp.direction.rationale ? h('div', { class: 'why-box' }, h('p', { class: 'mono' }, 'Почему запись выглядит так'), h('p', null, sp.direction.rationale)) : null,
    h('p', { class: 'fine provenance' }, engineText + '. ', mem.engine.note ? mem.engine.note + ' ' : '', 'Модель генерации изображений не подключена: композиция собрана из фотографий выше движком на холсте.'));

  fill(root, 
    h('section', { class: 'm-hero' + (sp.composition.format === 'landscape' ? ' wide' : ''), style: { '--m-bg': pal.background, '--m-ink': pal.ink, '--m-accent': ensureContrast(pal.accent, pal.background, 3), '--m-soft': mix(pal.ink, pal.background, 0.3), '--m-line': mix(pal.ink, pal.background, 0.72) } },
      h('div', { class: 'wrap' },
        h('div', { class: 'm-top' }, h('a', { class: 'mono', href: '#diary' }, '← Дневник'), h('span', { class: 'mono' }, `№ ${pad4(mem.no)}  ·  ${factRows[0][1]}${mem.example ? '  ·  Пример' : ''}`)),
        h('div', { class: 'm-hero-in' },
          h('div', { class: 'm-stage' }, canvas, stageNote),
          h('div', { class: 'm-head' },
            h('p', { class: 'mono m-engine' }, engineText), titleRow,
            sp.caption ? h('p', { class: 'm-caption', style: { 'font-family': fontFamilyCss(ty.body) } }, sp.caption) : null,
            h('p', { class: 'mono m-meta' }, [mem.location, [mem.weather, tempLabel(mem.tempC)].filter(Boolean).join(', '), mem.song ? '♪ ' + songText(mem.song) : ''].filter(Boolean).join('  ·  ')),
            actions, panel,
            h('p', { class: 'mono m-saved', 'data-store-line': '' }, Store.describe() + '.'))))),
    h('div', { class: 'wrap m-body' },
      mem.song ? songBox : null,
      h('section', { class: 'm-sec m-story' }, h('p', { class: 'mono' }, 'Ваш рассказ'), h('h2', null, 'День своими словами'), h('div', { class: 'story' }, mem.story.split(/\n{2,}|\r?\n/).filter((s) => s.trim()).map((para) => h('p', null, para)))),
      facts,
      h('section', { class: 'm-sec' }, h('p', { class: 'mono' }, 'Ваши фотографии'), h('h2', null, mem.photos.length === 1 ? 'Фотография' : plural(mem.photos.length, F_PHOTO)), galleryNote, gallery),
      emotion, palette, direction));

  memoryCanvases(mem).then(async (cs) => {
    if (!alive) return;
    canvases = cs;
    const missing = cs.filter((c) => c.dataset.missing).length;
    if (missing && mem.photos.length) stageNote.textContent = `${plural(missing, F_PHOTO)} не ${missing === 1 ? 'загрузилась' : 'загрузились'} на этом устройстве${Store.mode === 'local' ? ': возможно, запись сохранена в другом браузере' : ''}.`;
    [...gallery.children].forEach((slot, i) => {
      const c = cs[i], cap = mem.photos[i] && mem.photos[i].caption; slot.classList.remove('wait');
      if (!c || c.dataset.missing) return slot.append(h('span', { class: 'fine' }, 'Нет на этом устройстве'));
      const im = drawScaled(c, 900); im.setAttribute('role', 'img'); im.setAttribute('aria-label', `Исходная фотография ${i + 1}${cap ? ': ' + cap : ''}`);
      append(slot, [h('button', { type: 'button', class: 'g-btn', 'aria-label': `Увеличить фотографию ${i + 1}`, onclick: () => lightbox(c) }, im), cap ? h('p', { class: 'g-cap' }, cap) : null]);
    });
    try { scene = await buildScene({ spec: sp, canvases: cs, meta: mem }); } catch (er) { console.error(er); stageNote.textContent = 'Оформление не удалось нарисовать в этом браузере.'; return; }
    if (!alive) return;
    art = mountArtwork(canvas, scene, { intro });
    if (!mem.thumb && !missing) mem.thumb = sceneThumb(scene);
  });
}

/* ── окна поверх страницы: фотография, «поделиться» ── */
function modal(content, label) {
  const host = $('#overlay'), prev = document.activeElement;
  const close = () => { host.hidden = true; host.replaceChildren(); document.body.classList.remove('locked'); document.removeEventListener('keydown', onKey); if (prev && prev.focus && prev.isConnected) prev.focus(); };
  const onKey = (e) => {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return; // фокус остаётся внутри окна
    const f = $$('button, [href], input, select, textarea, audio, [tabindex]:not([tabindex="-1"])', host).filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };
  const x = btn('Закрыть', close, 'small on-film modal-x');
  fill(host, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, onclick: (e) => { if (e.target.classList.contains('modal')) close(); } }, x, content));
  host.hidden = false; document.body.classList.add('locked'); document.addEventListener('keydown', onKey); x.focus();
  return close;
}
function lightbox(c) { const big = drawScaled(c, 1800); big.className = 'lightbox-img'; big.setAttribute('role', 'img'); big.setAttribute('aria-label', 'Исходная фотография'); modal(big, 'Фотография'); }

async function shareMemory(mem, scene) {
  if (!scene) return toast('Оформление ещё собирается. Подождите пару секунд.');
  const still = renderStill(scene, 1600), sp = mem.spec;
  let jpeg = null, previewUrl = '';
  try { jpeg = await canvasToBlob(still, 'image/jpeg', 0.92); previewUrl = URL.createObjectURL(jpeg); } catch { return toast('Картинку не удалось подготовить в этом браузере.'); }
  const canSave = !!App.downloads || !RT;
  const preview = h('img', { class: 'share-img', src: previewUrl, alt: 'Оформленная запись, готовая к отправке' });
  const textOut = `${sp.title}\n${sp.caption ? sp.caption + '\n' : ''}${fmtDate(mem.date)}${mem.location ? ' · ' + mem.location : ''}${mem.song ? '\n♪ ' + songText(mem.song) : ''}`;
  const status = h('p', { class: 'fine', role: 'status' }, canSave ? 'Картинка сохраняется шириной 1600 пикселей, такой, какой она выглядит после появления.' : 'В этом окне сохранение файлов недоступно. Нажмите на картинку и удерживайте (или щёлкните правой кнопкой), чтобы скопировать или сохранить её.');
  const ta = h('textarea', { class: 'field share-text', rows: 4, readonly: true, id: 'shareText', 'aria-label': 'Текст для отправки' });
  ta.value = textOut;
  const saveBtn = btn('Сохранить картинку', async () => {
    saveBtn.disabled = true;
    try {
      const slug = (sp.title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'zapis';
      await saveFile(jpeg, `afterimage-${pad4(mem.no)}-${slug}.jpg`);
      status.textContent = 'Картинка сохранена.';
    } catch (e) { status.textContent = e && e.code === 'declined' ? 'Сохранение отменено.' : 'Сохранить картинку из этого окна не получилось. Нажмите на неё и удерживайте, чтобы сохранить вручную.'; }
    saveBtn.disabled = false;
  }, 'small solid', { hidden: !canSave });
  const close = modal(h('div', { class: 'share' }, preview, h('div', { class: 'share-side' }, h('p', { class: 'mono' }, 'Поделиться записью'), h('h2', null, sp.title), ta,
    h('div', { class: 'actions' }, saveBtn, btn('Скопировать текст', async () => { if (await copyText(textOut)) status.textContent = 'Текст скопирован.'; else { ta.focus(); ta.select(); status.textContent = 'Выделите текст и скопируйте его.'; } }, 'small on-film')),
    status, h('p', { class: 'fine' }, 'Дневник приватный. Поделиться можно только самому: файлом или текстом, который вы решите отправить. Публичных ссылок на запись нет.'))), 'Поделиться записью');
  App.cleaners.push(() => { URL.revokeObjectURL(previewUrl); if (!$('#overlay').hidden && $('.share', $('#overlay'))) close(); });
}

/* ── чтение вслух ── */
let speaking = null;
async function listen(mem, b) {
  const stopNow = () => { if (speaking) { try { speaking(); } catch { /* ignore */ } speaking = null; } b.textContent = 'Слушать'; };
  if (speaking) return stopNow();
  const lines = [mem.spec.title, mem.spec.caption, ...mem.story.split(/\n+/)].map((s) => s.trim()).filter(Boolean).flatMap((s) => s.match(/[\s\S]{1,1800}(?=\s|$)/g) || [s.slice(0, 1800)]);
  b.textContent = 'Остановить чтение';
  App.cleaners.push(() => { if (speaking) { try { speaking(); } catch { /* ignore */ } speaking = null; } });
  if (App.tts) {
    speaking = () => App.tts.stop().catch(() => {});
    try { await App.tts.speak(lines.map((text) => ({ text }))); }
    catch (e) { const code = e && e.code; if (code === 'not_granted' || code === 'unavailable') { b.hidden = true; toast('Чтение вслух в этом окне недоступно.'); } else if (code && code !== 'stopped') toast(code === 'rate_limited' ? 'Чтение вслух сейчас занято. Попробуйте чуть позже.' : 'Чтение вслух прервалось.'); }
    speaking = null; b.textContent = 'Слушать';
  } else if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      speaking = () => window.speechSynthesis.cancel();
      lines.forEach((text, i) => { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.lang = isCyrillic(text) ? 'ru-RU' : 'en-US'; if (i === lines.length - 1) u.onend = () => { speaking = null; b.textContent = 'Слушать'; }; u.onerror = () => { speaking = null; b.textContent = 'Слушать'; }; window.speechSynthesis.speak(u); });
    } catch { stopNow(); b.hidden = true; }
  } else stopNow();
}

/* ── профиль ── */
const AVATAR_COLORS = ['#E3B23C', '#C4722A', '#8C5B2E', '#5F7A61', '#3F7CAC', '#6B5B95', '#B5562F', '#3A3D40'];
function avatarEl(p, cls = 'avatar') {
  if (p.avatar) return h('img', { class: cls, src: p.avatar, alt: '' });
  const bg = p.color || AVATAR_COLORS[0];
  return h('span', { class: cls + ' ph-avatar', style: { background: bg, color: lum(bg) > 0.45 ? '#1D1F21' : '#F2EFE8' }, 'aria-hidden': 'true' }, (p.name.trim()[0] || 'A').toLocaleUpperCase());
}
async function viewProfile() {
  const root = view(); root.className = 'profile';
  const body = h('div', null, h('p', { class: 'loading mono' }, 'Открываю профиль…'));
  fill(root, h('div', { class: 'wrap narrow' }, pageHead('Вы', 'Профиль'), body));
  let P, all, cols;
  try { await Store.ready(); P = clone(await Store.profile()); all = await Store.list(); cols = await Store.collections(); } catch { return loadFail(body, route); }
  if (root.className !== 'profile') return;
  const panel = h('div', { class: 'inline-panel', hidden: true }), err = h('p', { class: 'form-error', role: 'alert' });
  const places = new Set(all.map((m) => m.location).filter(Boolean)), first = all.length ? all[all.length - 1].date : '';
  const card = h('div', { class: 'profile-card' });
  const paintCard = () => fill(card, avatarEl(P, 'avatar big'), h('div', { class: 'profile-text' },
    h('h2', null, P.name || 'Без имени'), P.bio ? h('p', null, P.bio) : h('p', { class: 'fine' }, 'Пара слов о себе появится здесь, если вы их добавите.'),
    P.places.length ? h('p', { class: 'chips-inline' }, h('span', { class: 'mono' }, 'Любимые места'), P.places.map((x) => h('span', { class: 'chip static' }, x))) : null,
    P.interests.length ? h('p', { class: 'chips-inline' }, h('span', { class: 'mono' }, 'Интересы'), P.interests.map((x) => h('span', { class: 'chip static' }, x))) : null,
    h('p', { class: 'mono profile-stats' }, [plural(all.length, F_REC), places.size ? plural(places.size, F_PLACE) : '', cols.length ? plural(cols.length, F_COL) : '', first ? 'первая запись — ' + fmtDate(first) : ''].filter(Boolean).join('  ·  '))));
  paintCard();

  const name = h('input', { type: 'text', id: 'pName', class: 'field', maxlength: 60, autocomplete: 'nickname', placeholder: 'Как вас подписывать' }), bio = h('textarea', { id: 'pBio', class: 'field area', rows: 3, maxlength: 300, placeholder: 'Коротко о себе (необязательно)' });
  const placesIn = h('input', { type: 'text', id: 'pPlaces', class: 'field', maxlength: 400, placeholder: 'Алматы, набережная, дача' }), interests = h('input', { type: 'text', id: 'pInterests', class: 'field', maxlength: 400, placeholder: 'плёночная фотография, походы' });
  const fillForm = () => { name.value = P.name; bio.value = P.bio; placesIn.value = P.places.join(', '); interests.value = P.interests.join(', '); };
  const avatarIn = h('input', { type: 'file', id: 'pAvatar', accept: 'image/*', class: 'sr' }), avatarRow = h('div', { class: 'avatar-row' });
  const paintAvatar = () => fill(avatarRow, avatarEl(P), h('label', { class: 'btn small', for: 'pAvatar' }, P.avatar ? 'Заменить фото' : 'Загрузить фото'), P.avatar ? btn('Убрать фото', () => { P.avatar = ''; paintAvatar(); }, 'small') : null,
    P.avatar ? null : h('span', { class: 'swatch-row', role: 'radiogroup', 'aria-label': 'Цвет заглушки' }, AVATAR_COLORS.map((c) => h('button', { type: 'button', class: 'dot-pick', role: 'radio', 'aria-checked': String((P.color || AVATAR_COLORS[0]) === c), 'aria-label': 'Цвет ' + c, style: { background: c }, onclick: () => { P.color = c; P.name = str(name.value, 60); paintAvatar(); } }))));
  avatarIn.addEventListener('change', async () => {
    const f = avatarIn.files[0]; avatarIn.value = '';
    if (!f) return;
    try {
      const src = await blobToCanvas(f, 512), side = Math.min(src.width, src.height), c = makeCanvas(192, 192);
      c.getContext('2d').drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, 192, 192);
      let q = 0.82, url = c.toDataURL('image/jpeg', q);
      while (url.length > 80000 && q > 0.4) { q -= 0.12; url = c.toDataURL('image/jpeg', q); }
      P.avatar = url; paintAvatar();
    } catch { toast('Этот файл не получилось прочитать как изображение.'); }
  });
  const save = h('button', { type: 'submit', class: 'btn solid' }, 'Сохранить профиль');
  const form = h('form', { class: 'profile-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; save.disabled = true;
    try { P = clone(await Store.saveProfile({ ...P, name: name.value, bio: bio.value, places: placesIn.value, interests: interests.value })); fillForm(); paintCard(); paintAvatar(); toast('Профиль сохранён.'); }
    catch (e2) { console.error(e2); err.textContent = explain(e2); }
    save.disabled = false;
  } }, h('h2', null, 'Изменить профиль'), h('div', { class: 'f' }, h('span', { class: 'mono' }, 'Фото или цветная заглушка'), avatarIn, avatarRow),
    field('pName', 'Имя', name), field('pBio', 'О себе', bio), field('pPlaces', 'Любимые места', placesIn, 'Через запятую.'), field('pInterests', 'Интересы', interests, 'Через запятую.'),
    err, h('div', { class: 'actions' }, save, btn('Очистить профиль', () => confirmInline(panel, 'Стереть имя, описание, фото, любимые места и интересы? Записи дневника останутся.', 'Очистить профиль', async () => {
      try { P = clone(await Store.saveProfile({})); fillForm(); paintCard(); paintAvatar(); panel.hidden = true; panel.replaceChildren(); toast('Профиль очищен.'); } catch (e2) { console.error(e2); toast('Профиль не удалось очистить.'); }
    }))), panel,
    h('p', { class: 'fine' }, 'Профиль хранится там же, где дневник, и виден только вам. Ничего из него не публикуется и не передаётся ИИ.'));
  fillForm(); paintAvatar();
  fill(body, card, form, accountBlock());
}

/** Аккаунт: что именно вас сейчас идентифицирует. Вход по почте существует только со своим сервером. */
function accountBlock() {
  const box = h('section', { class: 'account' }, h('h2', null, 'Аккаунт'));
  if (Store.mode === 'server' && Srv.user) {
    const cur = h('input', { type: 'password', id: 'pwCur', class: 'field', autocomplete: 'current-password', maxlength: 200 }), next = h('input', { type: 'password', id: 'pwNext', class: 'field', autocomplete: 'new-password', maxlength: 200 }), err = h('p', { class: 'form-error', role: 'alert' }), ok = h('p', { class: 'form-ok', role: 'status' });
    const go5 = h('button', { type: 'submit', class: 'btn small solid' }, 'Сменить пароль');
    append(box, [h('p', null, 'Вы вошли как ', h('strong', null, Srv.user.email), '. Дневник хранится на сервере и доступен только этому аккаунту.'),
      h('div', { class: 'actions' }, btn('Выйти', logout, 'small')),
      h('form', { class: 'pw-form', novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); err.textContent = ''; ok.textContent = '';
        if (next.value.length < 10) { err.textContent = 'Новый пароль должен быть не короче 10 символов.'; return next.focus(); }
        go5.disabled = true;
        try { await Srv.call('POST', '/api/auth/password', { json: { current: cur.value, next: next.value } }); cur.value = ''; next.value = ''; ok.textContent = 'Пароль изменён. Сессии на других устройствах завершены.'; }
        catch (e2) { err.textContent = (e2 && e2.message) || 'Пароль не удалось изменить.'; }
        go5.disabled = false;
      } }, h('h3', null, 'Смена пароля'), field('pwCur', 'Текущий пароль', cur), field('pwNext', 'Новый пароль', next, 'Не короче 10 символов.'), err, ok, h('div', { class: 'actions' }, go5)),
      h('p', { class: 'fine' }, 'Удаление аккаунта и всех данных — в ', h('a', { class: 'linkish', href: '#prefs' }, 'настройках'), '.')]);
  } else if (Store.mode === 'cloud') {
    append(box, [h('p', null, 'Вы вошли через аккаунт Claude. Отдельной регистрации здесь нет: страницу открывает сам Claude, и он же подтверждает, кто вы. Записи лежат в приватном разделе, который другим зрителям страницы недоступен.'),
      h('p', { class: 'fine' }, 'Выйти или сменить аккаунт можно в самом Claude. Регистрация по почте и паролю работает в серверной версии приложения из архива проекта.')]);
  } else if (Srv.on) {
    append(box, [h('p', null, 'Вы не вошли в аккаунт. Записи сохраняются только в этом браузере.'), h('div', { class: 'actions' }, h('a', { class: 'btn small solid', href: '#login' }, 'Войти'), h('a', { class: 'btn small', href: '#signup' }, 'Создать аккаунт'))]);
  } else {
    append(box, [h('p', null, RT ? 'Хранилище аккаунта Claude в этом окне недоступно, поэтому записи сохраняются только в этом браузере.' : 'Страница открыта без сервера, поэтому аккаунта нет: записи сохраняются только в этом браузере.'),
      h('p', { class: 'fine' }, 'Регистрация по почте и паролю, вход и восстановление пароля работают в серверной версии приложения. Она лежит в архиве проекта в папке server и запускается одной командой.')]);
  }
  return box;
}

/* ── настройки ── */
async function viewSettings() {
  const root = view(); root.className = 'prefs';
  fill(root, h('div', { class: 'wrap narrow' }, pageHead('Приложение', 'Настройки'), h('p', { class: 'loading mono' }, 'Открываю настройки…')));
  await Store.ready(); await Promise.race([AI.init(), sleep(4000)]);
  if (root.className !== 'prefs') return;
  let all = [], pending = [];
  try { all = await Store.list(); } catch { all = []; }
  try { pending = await Store.localPending(); } catch { pending = []; }
  if (root.className !== 'prefs') return;
  const sec = (title, ...kids) => h('section', { class: 'set-sec' }, h('h2', null, title), kids);
  const radios = (name, label, options, value, onPick) => h('fieldset', { class: 'radio-set' }, h('legend', { class: 'mono' }, label), options.map(([v, text, hint]) => {
    const id = `${name}-${v}`, r = h('input', { type: 'radio', name, id, value: v, checked: value === v, onchange: () => { if (r.checked) onPick(v); } });
    return h('div', { class: 'radio' }, r, h('label', { for: id }, h('span', null, text), hint ? h('span', { class: 'fine' }, hint) : null));
  }));

  /* оформление интерфейса */
  const theme = sec('Тема', radios('theme', 'Тема оформления', [['system', 'Как в системе', HOST_THEME ? 'Сейчас страница следует теме Claude.' : 'Следует настройке устройства.'], ['light', 'Светлая'], ['dark', 'Тёмная']], themePref(), (v) => { lsSet('afterimage-theme', v === 'system' ? null : v); applyTheme(v); toast('Тема изменена.'); }),
    h('p', { class: 'fine' }, 'Выбор запоминается в этом браузере.'));
  const lang = sec('Язык', h('p', null, 'Русский.'), h('p', { class: 'fine' }, 'Других языков интерфейса в этой версии нет, поэтому переключателя здесь тоже нет. Рассказ можно писать на любом языке: ИИ отвечает на языке рассказа.'));

  /* ИИ */
  const aiLine = h('p', { 'data-engine-line': '' }, AI.line()), photoLine = h('p', { class: 'fine' }, AI.photosNote());
  const aiCan = AI.status === 'ready';
  const aiBox = sec('ИИ-оформление', h('p', { class: 'mono' }, 'Фактический режим'), aiLine,
    aiCan ? radios('ai', 'Кто оформляет записи', [['on', 'ИИ', AI.via === 'server' ? 'Запросы уходят с сервера приложения к Anthropic API. Ключ хранится только на сервере.' : 'Запросы идут через ваш аккаунт Claude.'], ['off', 'Встроенный движок, без ИИ', 'Работает в браузере по ключевым словам. Рассказ и снимки никуда не отправляются.']], AI.off ? 'off' : 'on', (v) => { AI.off = v === 'off'; lsSet('afterimage-ai', AI.off ? 'off' : null); AI.set(AI.status); photoLine.textContent = AI.photosNote(); toast(AI.off ? 'ИИ выключен: записи оформляет встроенный движок.' : 'ИИ включён.'); })
      : h('p', { class: 'fine' }, `Переключателя нет, потому что ИИ сейчас недоступен: ${whyNoAI()}. Когда он появится, здесь можно будет его выключить.`),
    aiCan ? radios('aiPhotos', 'Показывать ли ИИ фотографии', [['on', 'Да, уменьшенные копии', 'Так ИИ точнее выбирает обложку, порядок и цвета.'], ['off', 'Нет, только текст и измеренные цвета', 'Фотографии не покидают браузер.']], AI.photosAllowed ? 'on' : 'off', (v) => { AI.photosAllowed = v === 'on'; lsSet('afterimage-ai-photos', AI.photosAllowed ? null : 'off'); photoLine.textContent = AI.photosNote(); toast('Сохранено.'); }) : null,
    photoLine,
    h('p', { class: 'fine' }, 'ИИ предлагает оформление и музыкальные направления. Он не дописывает события в рассказ, а его прочтение настроения подписано как прочтение. Генерации изображений нет: композиции собираются из ваших фотографий.'));

  /* хранение */
  const where = Store.mode === 'cloud' ? ['В вашем приватном разделе на аккаунте Claude', 'Записи, коллекции и профиль лежат в хранилище этой страницы, в разделе, который открывается только вашему аккаунту. Фотографии хранятся как файлы страницы; их адреса случайные и нигде не публикуются, но это адреса, а не пароль. Аудиофайлы остаются в этом браузере.']
    : Store.mode === 'server' ? [`На сервере, в аккаунте ${Srv.user.email}`, 'Записи, коллекции, профиль, фотографии и аудио хранятся на сервере приложения. Каждый запрос проверяется по сессии, чужие записи и файлы сервер не отдаёт. Пароль хранится только в виде хеша (scrypt), сессия — в cookie, недоступной скриптам страницы.']
      : ['Только в этом браузере на этом устройстве', IDB.ok ? 'Записи лежат в IndexedDB этого браузера. Они не отправляются на сервер и пропадут, если очистить данные сайта. Сделайте резервную копию, если дневник вам дорог.' : 'Хранилище браузера недоступно (например, в приватном окне): записи исчезнут, когда вкладка закроется.'];
  const exportStatus = h('p', { class: 'fine', role: 'status' });
  const canSave = !!App.downloads || !RT;
  const exportBtn = btn('Скачать резервную копию', async () => {
    exportBtn.disabled = true; exportStatus.textContent = 'Собираю архив…';
    try {
      const zip = await Store.exportZip((i, n) => { exportStatus.textContent = `Собираю архив: ${i} из ${n}…`; });
      await saveFile(zip, `afterimage-diary-${todayISO()}.zip`);
      exportStatus.textContent = `Готово: ${fmtSize(zip.size)}. В архиве diary.json со всеми записями, коллекциями и профилем и папки с исходными фотографиями и аудио.`;
    } catch (e) { console.error(e); exportStatus.textContent = e && e.code === 'declined' ? 'Сохранение отменено.' : e && e.code === 'unavailable' ? 'В этом окне сохранение файлов недоступно.' : 'Архив не удалось собрать. Попробуйте ещё раз.'; }
    exportBtn.disabled = false;
  }, 'small solid', { disabled: !all.length || !canSave });
  const storage = sec('Хранение и приватность', h('p', { class: 'mono' }, 'Где сейчас дневник'), h('p', null, h('strong', null, where[0]), '.'), h('p', null, where[1]),
    Store.reason === 'quota' || Store.reason === 'cloud-error' ? h('p', { class: 'form-error' }, 'Хранилище аккаунта отказало в записи, поэтому новые записи сохраняются в этом браузере. Их можно будет перенести позже.') : null,
    h('p', { class: 'fine' }, 'Паролей, ключей и токенов в коде страницы и в хранилище браузера нет. В браузере запоминаются только тема, настройки ИИ и текст незаконченного черновика. Местоположение устройства приложение не запрашивает.'),
    h('h3', null, 'Резервная копия'), h('div', { class: 'actions' }, exportBtn), exportStatus,
    !all.length ? h('p', { class: 'fine' }, 'В дневнике пока нечего сохранять.') : !canSave ? h('p', { class: 'fine' }, 'В этом окне сохранение файлов недоступно, поэтому кнопка выключена.') : null);

  /* перенос */
  const migrate = Store.mode !== 'local' && pending.length ? sec('Локальные записи', h('p', null, `В этом браузере ${plural(pending.length, ['лежит', 'лежат', 'лежит'], false)} ${plural(pending.length, ['запись', 'записи', 'записей'])}, ${plural(pending.length, ['которой', 'которых', 'которых'], false)} нет в аккаунте.`), h('div', { class: 'actions' }, btn('Посмотреть и перенести', () => migrateDialog(), 'small solid')),
    h('p', { class: 'fine' }, 'Сначала вы увидите список и объём. Перенос — это копирование: локальные записи никуда не исчезают.')) : null;

  /* опасная зона */
  const panel = h('div', { class: 'inline-panel', hidden: true });
  const danger = sec('Удаление данных',
    h('p', null, Store.mode === 'local' ? 'Удалить все записи, коллекции, профиль, фотографии и аудио, сохранённые в этом браузере.' : 'Удалить все записи, коллекции, профиль и файлы из аккаунта. Локальные записи этого браузера не затрагиваются.'),
    h('div', { class: 'actions' }, btn('Удалить все данные', () => confirmInline(panel, 'Это сотрёт весь дневник без возможности восстановления. Если он вам нужен, сначала скачайте резервную копию.', 'Удалить всё', async () => {
      try { await Store.clearAll(); App.canvasCache.clear(); App.draft = null; App.edit = null; App.studio = null; lsSet('afterimage-draft', null); toast('Все данные удалены.'); route(); } catch (e) { console.error(e); toast((e && e.status && e.message) || 'Удалить данные не получилось. Попробуйте ещё раз.'); }
    }, { word: 'удалить' }), 'small danger'),
    Store.mode === 'server' ? btn('Удалить аккаунт', () => {
      const pw = h('input', { type: 'password', id: 'delPw', class: 'field', autocomplete: 'current-password', maxlength: 200, 'aria-label': 'Пароль для подтверждения', placeholder: 'Ваш пароль' }), err = h('p', { class: 'form-error', role: 'alert' });
      const yes = btn('Удалить аккаунт навсегда', async () => {
        if (!pw.value) return pw.focus();
        yes.disabled = true; err.textContent = '';
        try { await Srv.call('POST', '/api/account/delete', { json: { password: pw.value } }); Srv.user = null; toast('Аккаунт и все его данные удалены.'); await afterAuthChange('home'); }
        catch (e) { err.textContent = (e && e.message) || 'Удалить аккаунт не получилось.'; yes.disabled = false; }
      }, 'small danger');
      fill(panel, h('div', { class: 'panel-form' }, h('p', null, `Аккаунт ${Srv.user.email}, все записи, коллекции, фотографии и аудио будут удалены с сервера без возможности восстановления. Для подтверждения введите пароль.`), pw, err, h('div', { class: 'actions' }, yes, btn('Отмена', () => { panel.hidden = true; panel.replaceChildren(); }, 'small'))));
      panel.hidden = false; pw.focus();
    }, 'small danger') : null), panel,
    Store.mode === 'cloud' ? h('p', { class: 'fine' }, 'Аккаунт Claude этой страницей не управляется: удалить можно только данные дневника.') : Store.mode === 'local' && Srv.on ? h('p', { class: 'fine' }, 'Удалить аккаунт можно после входа в него.') : null);

  fill(root, h('div', { class: 'wrap narrow' }, pageHead('Приложение', 'Настройки', accountLine()), theme, lang, aiBox, storage, migrate, danger,
    h('p', { class: 'fine about' }, 'Afterimage Diary · версия 2. Карта, шаблоны и архиватор резервных копий написаны для этого проекта и работают без сторонних сервисов.')));
}

/* ── запуск ── */
function boot() {
  document.documentElement.lang = 'ru';
  buildNav(); bindEngineBadge();
  try { document.fonts.addEventListener('loadingdone', () => liveArt.forEach((c) => c.scene.cache.clear())); } catch { /* старые браузеры */ }
  window.addEventListener('hashchange', route);
  route();
  AI.init();
  Store.ready().then(() => { $$('[data-store-line]').forEach((el) => { el.textContent = Store.describe() + '.'; }); AI.set(AI.status); });
  cap('tts').then((t) => { App.tts = t; if (t) $$('.m-actions button[data-act="listen"]').forEach((b) => { b.hidden = false; }); });
  cap('downloads').then((dl) => { App.downloads = dl; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
