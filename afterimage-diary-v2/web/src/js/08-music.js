/* ───────────── музыка и внешние ссылки ─────────────
   Ссылка на песню остаётся ссылкой: мы показываем сервис и, где это разрешено самим сервисом,
   его официальный плеер. Музыка не скачивается и не воспроизводится в обход сервиса.
   Каталог песен не подключён, поэтому подбор «по настроению» — это направления и ссылки на поиск. */
const KIND_RU = { track: 'трек', album: 'альбом', playlist: 'плейлист', episode: 'выпуск', show: 'подкаст', artist: 'исполнитель', song: 'трек', station: 'станция' };
/** Встроенные плееры работают только на обычном сайте: внутри Claude чужие сайты встраивать нельзя. */
const embedsAllowed = () => !RT && /^https?:$/.test(location.protocol);

function parseMusicLink(u) {
  const url = safeUrl(u);
  if (!url) return null;
  const U = new URL(url), host = U.hostname.replace(/^www\./, '').toLowerCase(), seg = U.pathname.split('/').filter(Boolean);
  const out = { url, provider: musicProvider(url), kind: '', embed: '', height: 152, short: (host + U.pathname).replace(/\/$/, '').slice(0, 60) };
  if (/(^|\.)spotify\.com$/.test(host)) {
    const s = seg[0] && seg[0].startsWith('intl-') ? seg.slice(1) : seg;
    if (KIND_RU[s[0]] && /^[A-Za-z0-9]{10,40}$/.test(s[1] || '')) { out.kind = KIND_RU[s[0]]; out.embed = `https://open.spotify.com/embed/${s[0]}/${s[1]}`; out.height = s[0] === 'track' || s[0] === 'episode' ? 152 : 352; }
  } else if (host === 'youtu.be' || /(^|\.)youtube\.com$/.test(host)) {
    const id = host === 'youtu.be' ? seg[0] : U.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(seg[0]) ? seg[1] : '');
    if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) { out.kind = 'видео'; out.embed = `https://www.youtube-nocookie.com/embed/${id}`; out.height = 0; }
  } else if (host === 'music.apple.com') {
    const i = U.searchParams.get('i');
    if (seg.length >= 3 && /^[a-z]{2}$/.test(seg[0]) && KIND_RU[seg[1]]) { out.kind = i ? 'трек' : KIND_RU[seg[1]]; out.embed = 'https://embed.music.apple.com' + U.pathname + (i && /^\d+$/.test(i) ? '?i=' + i : ''); out.height = seg[1] === 'song' || i ? 175 : 450; }
  } else if (/(^|\.)soundcloud\.com$/.test(host) && seg.length >= 2) {
    out.kind = 'трек'; out.embed = 'https://w.soundcloud.com/player/?' + new URLSearchParams({ url, auto_play: 'false', visual: 'false' }).toString(); out.height = 166;
  } else if (/(^|\.)deezer\.com$/.test(host)) {
    const s = /^[a-z]{2}$/.test(seg[0] || '') ? seg.slice(1) : seg;
    if (['track', 'album', 'playlist'].includes(s[0]) && /^\d+$/.test(s[1] || '')) { out.kind = KIND_RU[s[0]]; out.embed = `https://widget.deezer.com/widget/auto/${s[0]}/${s[1]}`; out.height = s[0] === 'track' ? 150 : 300; }
  } else if (/^music\.yandex\.(ru|kz|com|by|uz)$/.test(host) && seg[0] === 'album' && /^\d+$/.test(seg[1] || '')) {
    if (seg[2] === 'track' && /^\d+$/.test(seg[3] || '')) { out.kind = 'трек'; out.embed = `https://music.yandex.ru/iframe/#track/${seg[3]}/${seg[1]}`; out.height = 180; }
    else { out.kind = 'альбом'; out.embed = `https://music.yandex.ru/iframe/#album/${seg[1]}`; out.height = 450; }
  }
  return out;
}

const searchLinks = (q) => [
  ['Spotify', 'https://open.spotify.com/search/' + encodeURIComponent(q)],
  ['YouTube', 'https://www.youtube.com/results?' + new URLSearchParams({ search_query: q }).toString()],
  ['Apple Music', 'https://music.apple.com/search?' + new URLSearchParams({ term: q }).toString()],
  ['Яндекс Музыка', 'https://music.yandex.ru/search?' + new URLSearchParams({ text: q }).toString()],
];
const ext = (label, href, cls = 'btn small') => h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer' }, label + ' ↗');
const songText = (song) => (song ? ([song.title, song.artist].filter(Boolean).join(' — ') || (song.direction ? cap1(song.direction) : '')) : '');

/** Карточка ссылки: сервис, тип, адрес и — по нажатию — официальный плеер. Ничего не включается само. */
function linkCard(url) {
  const L = parseMusicLink(url);
  if (!L) return null;
  const slot = h('div', { class: 'player-slot' });
  const show = L.embed && embedsAllowed() ? btn(`Показать плеер ${L.provider}`, () => {
    const frame = h('iframe', { src: L.embed, title: `Официальный плеер ${L.provider}`, loading: 'lazy', allow: 'encrypted-media; clipboard-write; fullscreen', referrerpolicy: 'strict-origin-when-cross-origin', class: 'player' + (L.height ? '' : ' video') });
    if (L.height) frame.height = String(L.height);
    fill(slot, frame); show.hidden = true;
  }, 'small') : null;
  const why = !L.embed ? 'Для этой ссылки у сервиса нет встраиваемого плеера: она откроется на его сайте.' : RT ? 'Внутри Claude чужие плееры встраивать нельзя, поэтому песня откроется на сайте сервиса.' : !embedsAllowed() ? 'Плеер появится, когда приложение открыто с сайта, а не из файла.' : 'Плеер загружается с сайта сервиса только после нажатия. Сама музыка здесь не хранится.';
  return h('div', { class: 'link-card' },
    h('div', { class: 'link-head' }, h('span', { class: 'link-badge mono' }, L.provider), h('span', { class: 'link-meta' }, [L.kind, L.short].filter(Boolean).join(' · '))),
    h('div', { class: 'actions' }, ext(`Открыть в ${L.provider}`, L.url), show), slot, h('p', { class: 'fine' }, why));
}

/** Список музыкальных направлений. onPick(d) — если из списка можно выбрать. */
function directionsList(list, { by, onPick, picked } = {}) {
  return h('div', { class: 'dirs' },
    h('p', { class: 'fine' }, by === 'claude' ? 'Музыкальный каталог не подключён, поэтому ИИ предлагает направления, а не конкретные песни: так он ничего не выдумывает. Найти музыку можно по ссылкам на поиск.' : 'Музыкальный каталог не подключён. Направления подобраны встроенным движком по ключевым словам рассказа; это не ИИ.'),
    list.map((d) => h('div', { class: 'dir' + (picked && picked === d.direction ? ' on' : '') },
      h('div', { class: 'dir-text' }, h('strong', null, cap1(d.direction)), d.why ? h('span', null, d.why) : null),
      h('div', { class: 'dir-links' }, onPick ? btn(picked === d.direction ? 'Выбрано' : 'Выбрать', () => onPick(d), 'small' + (picked === d.direction ? ' solid' : '')) : null,
        searchLinks(d.query || d.direction).map(([name, href]) => ext(name, href, 'linkish small-link'))))));
}

/** Запрос для поиска визуальных идей: настроение, палитра и слова дня. */
function moodboardQuery(spec, extras) {
  const base = (extras && extras.moodboard) || [spec.direction.name, ...spec.emotion.dominant.slice(0, 2).map((e) => e.name)].join(' ');
  const words = `${base} ${spec.palette.names.filter(Boolean).slice(0, 2).join(' ')} эстетика палитра`.split(/[\s,;·]+/).filter(Boolean);
  return str([...new Set(words.map((w) => w.toLocaleLowerCase()))].join(' '), 120);
}
const pinterestUrl = (q) => 'https://www.pinterest.com/search/pins/?' + new URLSearchParams({ q }).toString();
/** Кнопка поиска идей. Это обычная ссылка на поиск Pinterest: интеграции нет, картинки в дневник не попадают. */
function pinterestBlock(spec, extras) {
  const q = moodboardQuery(spec, extras), input = h('input', { type: 'text', class: 'field', id: 'pinQuery', maxlength: 120, 'aria-label': 'Запрос для поиска идей' });
  input.value = q;
  const link = ext('Найти идеи в Pinterest', pinterestUrl(q), 'btn small');
  input.addEventListener('input', () => { link.href = pinterestUrl(str(input.value, 120) || q); });
  return h('div', { class: 'pin-block' }, input, h('div', { class: 'actions' }, link),
    h('p', { class: 'fine' }, 'Откроется поиск на сайте Pinterest в новой вкладке. Интеграции с Pinterest здесь нет: чужие изображения не загружаются в дневник и не копируются. Это референсы для вдохновения, а композиция собирается только из ваших материалов.'));
}
