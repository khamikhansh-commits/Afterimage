/* ───────────── оболочка: разделы, меню, главная, вход ───────────── */
const App = { cleaners: [], draft: null, studio: null, filter: { q: '', mood: '', year: '', weather: '', place: '', view: 'timeline' }, cal: null, presetDate: '', fresh: '', canvasCache: new Map(), tts: null, downloads: null, noticeOff: false, mapCol: '' };
const view = () => $('#view');
const LOOP = '<svg viewBox="0 0 200 80" preserveAspectRatio="none"><path d="M20 46 C14 20 58 6 108 8 C160 10 192 26 184 48 C176 72 118 77 78 72 C36 67 8 58 24 32 C34 16 74 11 100 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" pathLength="1" vector-effect="non-scaling-stroke"/></svg>';
const NAV = [['home', 'Главная'], ['diary', 'Дневник'], ['today', 'В этот день'], ['collections', 'Коллекции'], ['map', 'Карта'], ['new', 'Новое воспоминание'], ['profile', 'Профиль'], ['prefs', 'Настройки']];

function cleanup() {
  stopAllArt();
  App.cleaners.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}
function go(name) { if (location.hash === '#' + name) route(); else location.hash = name; }
const sectionOf = (name) => (/^m-/.test(name) ? 'diary' : /^c-/.test(name) ? 'collections' : /^(edit-|studio$)/.test(name) ? 'new' : /^(login|signup|forgot|reset-)/.test(name) ? 'profile' : name);
function setMenu(open) { const b = $('#menuBtn'); b.setAttribute('aria-expanded', String(open)); $('#bar').classList.toggle('open', open); }
function route() {
  const name = (location.hash || '#home').slice(1);
  cleanup(); setMenu(false);
  window.scrollTo(0, 0);
  const sec = sectionOf(name);
  $$('#mainNav a').forEach((a) => { if (a.dataset.k === sec) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  renderNotice();
  if (name === 'diary') return viewDiary();
  if (name === 'today') return viewToday();
  if (name === 'collections') return viewCollections();
  if (/^c-[A-Za-z0-9-]{3,60}$/.test(name)) return viewCollection(name);
  if (name === 'map') return viewMap();
  if (name === 'new') return viewCreate(null);
  if (/^edit-[A-Za-z0-9-]{3,60}$/.test(name)) return viewCreate(name.slice(5));
  if (name === 'studio') return viewStudio();
  if (/^m-[A-Za-z0-9-]{3,60}$/.test(name)) return viewMemory(name.slice(2));
  if (name === 'profile') return viewProfile();
  if (name === 'prefs') return viewSettings();
  if (name === 'login' || name === 'signup' || name === 'forgot') return viewAuth(name);
  if (/^reset-[A-Za-z0-9_-]{43}$/.test(name)) return viewAuth('reset', name.slice(6));
  return viewHome();
}
function buildNav() {
  fill($('#mainNav'), ...NAV.map(([k, label]) => h('a', { href: '#' + k, class: 'nav-item' + (k === 'new' ? ' strong' : ''), dataset: { k } }, label)));
  $('#menuBtn').addEventListener('click', () => setMenu($('#menuBtn').getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
}
function bindEngineBadge() {
  AI.onChange(() => {
    const b = $('#engineBadge'), [text, state] = AI.badge();
    b.textContent = text; b.dataset.state = state; b.title = AI.line();
    $$('[data-engine-line]').forEach((el) => { el.textContent = AI.line(); });
    $$('[data-store-line]').forEach((el) => { el.textContent = Store.describe() + '.'; });
  });
}
const accountLine = () => (Store.mode === 'cloud' ? 'Вы вошли через аккаунт Claude: дневник виден только вам.' : Store.mode === 'server' ? `Вы вошли как ${Srv.user.email}. Дневник доступен только этому аккаунту.` : Srv.on ? 'Вы не вошли в аккаунт: записи остаются в этом браузере.' : 'Аккаунта нет: страница открыта без сервера, записи остаются в этом браузере.');

/** Полоса под шапкой: вход для гостя и предложение перенести локальные записи. Сама ничего не переносит. */
async function renderNotice() {
  const host = $('#notice');
  await Store.ready();
  const rows = [];
  if (Srv.on && !Srv.user && !/^#(login|signup|forgot|reset-)/.test(location.hash)) rows.push(h('div', { class: 'notice' }, h('span', null, 'Вы не вошли в аккаунт. Записи сохраняются только в этом браузере.'), h('span', { class: 'actions' }, h('a', { class: 'btn small solid', href: '#login' }, 'Войти'), h('a', { class: 'btn small', href: '#signup' }, 'Создать аккаунт'))));
  if (Store.mode !== 'local' && !App.noticeOff) {
    let pending = [];
    try { pending = await Store.localPending(); } catch { pending = []; }
    if (pending.length) rows.push(h('div', { class: 'notice' }, h('span', null, `В этом браузере ${plural(pending.length, ['хранится', 'хранятся', 'хранится'], false)} ${plural(pending.length, ['локальная запись', 'локальные записи', 'локальных записей'])}, ${plural(pending.length, ['которой', 'которых', 'которых'], false)} нет в аккаунте.`),
      h('span', { class: 'actions' }, btn('Посмотреть и перенести', () => migrateDialog(), 'small solid'), btn('Не сейчас', () => { App.noticeOff = true; renderNotice(); }, 'small'))));
  }
  fill(host, ...rows.map((r) => h('div', { class: 'wrap' }, r)));
}

const paletteDots = (pal) => h('span', { class: 'dots', 'aria-hidden': 'true' }, ['background', 'accent', 'accent2', 'ink'].map((k) => h('i', { style: { background: pal[k] } })));
const pageHead = (kicker, title, sub, ...actions) => h('header', { class: 'page-head' }, h('div', null, h('p', { class: 'mono' }, kicker), h('h1', null, title), sub ? (sub.nodeType ? sub : h('p', { class: 'mono' }, sub)) : null), actions.length ? h('div', { class: 'actions' }, actions) : null);

/* ── главная ── */
function viewHome() {
  const root = view(); root.className = 'home';
  const heroCanvas = h('canvas', { class: 'art', role: 'img', 'aria-label': 'Пример записи: коллаж из осенней прогулки с падающими листьями' });
  fill(root, 
    h('section', { class: 'hero' }, h('div', { class: 'wrap hero-in' },
      h('div', { class: 'hero-copy' },
        h('p', { class: 'mono' }, 'Дневник о том, каким был день'),
        h('h1', null, 'Некоторые дни заслуживают ', h('span', { class: 'circled' }, 'большего', svg(LOOP)), ', чем фотография.'),
        h('p', { class: 'lede' }, 'Напишите, что произошло. Добавьте фотографии, место, погоду и песню, которая звучала. Afterimage прочитает день и оформит его цветом, шрифтом, фактурой и движением, чтобы через год его можно было не только вспомнить, но и почувствовать снова.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn mark', href: '#new' }, 'Начать'), h('a', { class: 'btn', href: '#diary' }, 'Открыть дневник')),
        h('p', { class: 'mono fine', 'data-engine-line': '' }, AI.line())),
      h('figure', { class: 'hero-art' }, heroCanvas, h('figcaption', { class: 'mono' }, 'Пример записи  ·  № 0001  ·  собран тем же движком, что и ваши')))),
    homeBeforeAfter(), homeExamples(), homeHow(), homeReal(),
    h('section', { class: 'cta' }, h('div', { class: 'wrap' }, h('p', { class: 'cta-line' }, 'Сегодняшний день больше таким не будет.'), h('a', { class: 'btn mark big', href: '#new' }, 'Сохранить день'))),
  );
  exampleScene('autumn', 1).then(({ scene }) => { if (heroCanvas.isConnected) mountArtwork(heroCanvas, scene); });
}
function homeBeforeAfter() {
  const before = h('canvas', { class: 'ba-before' }), after = h('canvas', { class: 'art' });
  const range = h('input', { type: 'range', min: 0, max: 100, value: 46, id: 'baRange', class: 'ba-range', 'aria-label': 'Сдвиньте, чтобы сравнить фотографию и оформленную запись' });
  const stage = h('div', { class: 'ba-stage', style: { '--cut': '46%' } }, before, h('div', { class: 'ba-clip' }, after), h('div', { class: 'ba-line', 'aria-hidden': 'true' }, h('span')), range,
    h('span', { class: 'ba-tag left mono' }, 'Фотография'), h('span', { class: 'ba-tag right mono' }, 'Afterimage'));
  range.addEventListener('input', () => stage.style.setProperty('--cut', range.value + '%'));
  const day = SAMPLE_DAYS[1];
  exampleScene('night', 2).then(({ scene }) => {
    if (!stage.isConnected) return;
    before.width = 960; before.height = 1200;
    coverDraw(before.getContext('2d'), samplePhoto('city'), 0, 0, 960, 1200);
    mountArtwork(after, scene, { intro: false });
  });
  return h('section', { class: 'ba' }, h('div', { class: 'wrap ba-in' },
    h('div', { class: 'ba-copy' },
      h('p', { class: 'mono' }, 'До и после'),
      h('h2', null, 'Фотография и то, каким был день.'),
      h('p', null, 'Фотография сохраняет то, что было перед объективом. В неё не попадают четвёртый кофе, трек по кругу и минута, когда тесты наконец позеленели.'),
      h('blockquote', { class: 'quote' }, day.story),
      h('p', { class: 'mono' }, '♪ ' + songText(day.song)),
      h('p', { class: 'fine' }, 'Потяните линию. Слева — просто снимок. Справа — тот же снимок после того, как день прочитан: холодная палитра, строгая страница с фактами, резкие склейки.')),
    stage));
}
function homeExamples() {
  const cards = SAMPLE_DAYS.map((day, i) => {
    const canvas = h('canvas', { class: 'art', role: 'img', 'aria-label': 'Пример записи: ' + day.label });
    const title = h('h3', { class: 'ex-title' }, '…'), dir = h('p', { class: 'ex-dir' }), dots = h('span');
    exampleScene(day.key, i + 1).then(({ scene, spec }) => {
      if (!canvas.isConnected) return;
      mountArtwork(canvas, scene, { intro: false });
      title.textContent = spec.title; title.style.fontFamily = fontFamilyCss(spec.typography.display); title.style.fontStyle = spec.typography.italic ? 'italic' : 'normal';
      dir.textContent = `${spec.direction.name}. Шаблон «${TEMPLATE_NAMES[spec.composition.layout]}».`; dots.replaceWith(paletteDots(spec.palette));
    });
    return h('figure', { class: 'ex' }, canvas, h('figcaption', null, h('p', { class: 'mono' }, day.label), title, dir, dots,
      h('button', { class: 'linkish', type: 'button', onclick: () => { loadSampleDay(day.key); go('new'); } }, 'Попробовать этот день →')));
  });
  return h('section', { class: 'examples' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('p', { class: 'mono' }, 'Примеры'), h('h2', null, 'Три дня, у которых общего только дневник.'),
      h('p', null, 'Каждая запись получает свою палитру, шрифт, шаблон и движение, и у каждого решения есть причина. Строчка внизу листа, нумерация и зерно бумаги остаются общими, поэтому дневник читается как одна книга.')),
    h('div', { class: 'ex-row' }, cards)));
}
function homeHow() {
  const steps = [
    ['Вы рассказываете о дне', 'Несколько честных абзацев, свои фотографии и песня, с которой связан день. По желанию — дата, место на карте, погода и температура.'],
    ['ИИ работает как арт-директор', 'Он называет настроение, сопоставляет слова со снимками и музыкой и предлагает три варианта оформления: палитру, шрифты, шаблон, обработку снимков, фактуру и движение. Событий он не придумывает.'],
    ['Вы выбираете, дневник хранит', 'Любой вариант можно поправить вручную: шаблон, обложку, порядок и кадрирование, цветовую температуру, подписи. Запись сохраняется вместе с оформлением и находится по дате, месту, настроению и слову.'],
  ];
  return h('section', { class: 'how' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('p', { class: 'mono' }, 'Как это работает'), h('h2', null, 'От дня к его отпечатку.')),
    h('ol', { class: 'steps' }, steps.map(([t, d]) => h('li', null, h('h3', null, t), h('p', null, d))))));
}
function homeReal() {
  const rows = [
    ['Арт-дирекция', h('span', { 'data-engine-line': '' }, AI.line())],
    ['Генерация изображений', 'Модель генерации изображений не подключена. Композиция собирается из ваших собственных фотографий движком на холсте; ИИ рисует только маленькую эмблему-значок.'],
    ['Ваши фотографии', 'Хранятся такими, какими вы их добавили. Обработка применяется к копиям, оригиналы показаны рядом с каждой записью.'],
    ['Музыка', 'Загруженный аудиофайл играет внутри записи. Ссылки на музыкальные сервисы открываются на их сайтах или в их официальном плеере. Каталог песен не подключён, поэтому подбор по настроению — это направления, а не выдуманные треки.'],
    ['Карта', 'Обзорная схема суши, нарисованная для этого проекта. Картографический сервис не подключён; метки ставятся по координатам.'],
    ['Хранение и аккаунт', h('span', null, h('span', { 'data-store-line': '' }, Store.describe() + '.'), ' Подробности — в настройках.')],
  ];
  return h('section', { class: 'real' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('p', { class: 'mono' }, 'Что здесь настоящее'), h('h2', null, 'Страница ничего не изображает.')),
    h('dl', { class: 'facts' }, rows.map(([k, v]) => [h('dt', { class: 'mono' }, k), h('dd', null, v)]))));
}

/* ── вход, регистрация, восстановление (работают только со своим сервером) ── */
async function afterAuthChange(to = 'diary') {
  App.noticeOff = false; App.draft = null; App.studio = null;
  await Store.reset(); await AI.refresh();
  go(to);
}
async function viewAuth(kind, token = '') {
  const root = view(), here = location.hash; root.className = 'auth';
  if (Store.mode === 'pending') { // при открытии по прямой ссылке сначала выясняем, есть ли сервер
    fill(root, h('div', { class: 'wrap narrow' }, h('p', { class: 'loading mono' }, 'Открываю…')));
    await Store.ready();
    if (location.hash !== here) return;
  }
  if (!Srv.on) {
    return fill(root, h('div', { class: 'wrap narrow' }, pageHead('Аккаунт', 'Вход по почте и паролю'),
      h('div', { class: 'prose' },
        h('p', null, RT ? 'Эта страница открыта внутри Claude, и аккаунт уже есть: это ваш аккаунт Claude. Дневник хранится в приватном разделе, который видите только вы, поэтому отдельная регистрация здесь не нужна.' : 'Страница открыта как отдельный файл, без сервера. Регистрировать аккаунт тут негде: записи хранятся в этом браузере.'),
        h('p', null, 'Регистрация по почте и паролю, вход, выход и восстановление пароля работают в серверной версии приложения. Она входит в архив проекта и запускается одной командой; пароли хранятся только на сервере в виде хеша.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#profile' }, 'Открыть профиль'), h('a', { class: 'btn', href: '#prefs' }, 'Хранение и приватность')))));
  }
  if (Srv.user && kind !== 'reset') return go('profile');
  const TITLES = { login: 'Вход', signup: 'Создать аккаунт', forgot: 'Восстановление пароля', reset: 'Новый пароль' };
  const err = h('p', { class: 'form-error', role: 'alert' }), okBox = h('p', { class: 'form-ok', role: 'status' });
  const email = h('input', { type: 'email', id: 'authEmail', class: 'field', autocomplete: 'email', required: true, maxlength: 254, placeholder: 'you@example.com' });
  const pass = h('input', { type: 'password', id: 'authPass', class: 'field', autocomplete: kind === 'login' ? 'current-password' : 'new-password', required: true, minlength: kind === 'login' ? 1 : 10, maxlength: 200 });
  const pass2 = h('input', { type: 'password', id: 'authPass2', class: 'field', autocomplete: 'new-password', required: true, maxlength: 200 });
  const submit = h('button', { type: 'submit', class: 'btn mark' }, { login: 'Войти', signup: 'Создать аккаунт', forgot: 'Получить ссылку', reset: 'Сохранить пароль' }[kind]);
  const busy = (on, label) => { submit.disabled = on; if (label) submit.textContent = label; };
  const form = h('form', { class: 'auth-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; okBox.textContent = '';
    const em = email.value.trim(), pw = pass.value;
    if (kind !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { err.textContent = 'Проверьте адрес электронной почты.'; return email.focus(); }
    if ((kind === 'signup' || kind === 'reset') && pw.length < 10) { err.textContent = 'Пароль должен быть не короче 10 символов.'; return pass.focus(); }
    if ((kind === 'signup' || kind === 'reset') && pw !== pass2.value) { err.textContent = 'Пароли не совпадают.'; return pass2.focus(); }
    const idle = submit.textContent;
    busy(true, { login: 'Вхожу…', signup: 'Создаю аккаунт…', forgot: 'Отправляю…', reset: 'Сохраняю…' }[kind]);
    try {
      if (kind === 'forgot') {
        const r = await Srv.call('POST', '/api/auth/forgot', { json: { email: em } });
        okBox.textContent = r.mail === 'webhook' ? 'Если аккаунт с такой почтой есть, на неё отправлено письмо со ссылкой. Ссылка действует 30 минут.'
          : r.mail === 'console' ? 'Почта на этом сервере не настроена. Сервер запущен в режиме разработки, поэтому ссылка для сброса напечатана в его консоли (если такой аккаунт есть).'
            : 'Отправка писем на этом сервере не настроена, поэтому восстановить пароль по почте сейчас нельзя. Обратитесь к тому, кто запустил сервер.';
        busy(false, idle);
      } else {
        const r = kind === 'reset' ? await Srv.call('POST', '/api/auth/reset', { json: { token, password: pw } }) : await Srv.call('POST', kind === 'signup' ? '/api/auth/register' : '/api/auth/login', { json: { email: em, password: pw } });
        Srv.user = r.user;
        toast(kind === 'signup' ? 'Аккаунт создан. Вы вошли.' : kind === 'reset' ? 'Пароль изменён. Вы вошли.' : 'Вы вошли.');
        await afterAuthChange('diary');
      }
    } catch (e2) { err.textContent = (e2 && e2.message) || 'Не получилось. Попробуйте ещё раз.'; busy(false, idle); }
  } },
    kind !== 'reset' ? field('authEmail', 'Электронная почта', email) : null,
    kind !== 'forgot' ? field('authPass', kind === 'login' ? 'Пароль' : 'Новый пароль', pass, kind === 'login' ? '' : 'Не короче 10 символов. Пароль хранится на сервере только в виде хеша.') : null,
    kind === 'signup' || kind === 'reset' ? field('authPass2', 'Пароль ещё раз', pass2) : null,
    err, okBox, h('div', { class: 'actions' }, submit));
  const links = kind === 'login' ? [['#signup', 'Создать аккаунт'], ['#forgot', 'Забыли пароль?']] : kind === 'signup' ? [['#login', 'У меня уже есть аккаунт']] : [['#login', 'Вернуться ко входу']];
  fill(root, h('div', { class: 'wrap narrow' }, pageHead('Аккаунт', TITLES[kind]),
    h('p', { class: 'auth-lead' }, kind === 'signup' ? 'Аккаунт нужен, чтобы дневник хранился на сервере и открывался с любого устройства. Доступ к записям есть только у владельца аккаунта.' : kind === 'forgot' ? 'Укажите почту, с которой вы регистрировались. Мы создадим одноразовую ссылку для нового пароля.' : kind === 'reset' ? 'Задайте новый пароль. После этого все прежние сессии будут завершены.' : 'Войдите, чтобы открыть свой дневник.'),
    form, h('p', { class: 'auth-links' }, links.map(([href, label]) => h('a', { class: 'linkish', href }, label))),
    kind === 'signup' ? h('p', { class: 'fine' }, 'Подтверждение почты письмом в этой версии не делается: проверьте адрес перед созданием аккаунта, он понадобится для восстановления пароля.') : null));
  (kind === 'reset' ? pass : email).focus();
}
async function logout() {
  try { await Srv.call('POST', '/api/auth/logout'); } catch { /* сессия могла уже закончиться */ }
  Srv.user = null; toast('Вы вышли из аккаунта.');
  await afterAuthChange('home');
}

/* ── перенос локальных записей в аккаунт: сначала показать, потом спросить ── */
async function migrateDialog() {
  let pending = [];
  try { pending = await Store.localPending(); } catch { pending = []; }
  if (!pending.length) return toast('Локальных записей для переноса нет.');
  const picked = new Set(pending.map((x) => x.mem.id)), status = h('p', { class: 'fine', role: 'status' });
  const total = () => pending.filter((x) => picked.has(x.mem.id)).reduce((a, x) => a + x.bytes, 0);
  const sum = h('p', { class: 'mono' });
  const paint = () => { sum.textContent = `Выбрано: ${plural(picked.size, F_REC)}, около ${fmtSize(total())}`; go2.disabled = !picked.size; };
  const list = h('ul', { class: 'mig-list' }, pending.map(({ mem, bytes }) => {
    const cb = h('input', { type: 'checkbox', id: 'mig-' + mem.id, checked: true, onchange: () => { if (cb.checked) picked.add(mem.id); else picked.delete(mem.id); paint(); } });
    return h('li', null, cb, h('label', { for: 'mig-' + mem.id }, mem.thumb ? h('img', { src: mem.thumb, alt: '' }) : null, h('span', null, h('strong', null, mem.spec.title), h('span', { class: 'mono' }, `${fmtDate(mem.date)} · ${plural(mem.photos.length, F_PHOTO)} · ${fmtSize(bytes)}`))));
  }));
  const go2 = btn('Перенести выбранное', async () => {
    go2.disabled = true; status.textContent = 'Переношу…';
    try {
      const r = await Store.migrate([...picked], (i, n) => { status.textContent = `Перенесено ${i} из ${n}…`; });
      close(); App.noticeOff = false; route();
      toast(r.failed.length ? `Перенесено: ${r.moved}. Не удалось: ${r.failed.length}. Локальные копии на месте.` : `Перенесено: ${plural(r.moved, F_REC)}. Локальные копии остались в браузере.`);
    } catch (e) { status.textContent = (e && e.message) || 'Перенос не удался. Локальные записи не изменились.'; go2.disabled = false; }
  }, 'small solid');
  const where = Store.mode === 'server' ? `на сервер, в аккаунт ${Srv.user.email}` : 'в ваш приватный раздел на аккаунте Claude';
  const close = modal(h('div', { class: 'sheet-modal' }, h('p', { class: 'mono' }, 'Перенос в аккаунт'), h('h2', null, 'Локальные записи этого браузера'),
    h('p', null, `Выбранные записи будут скопированы ${where}: текст, оформление и фотографии. Аудиофайлы ${Store.mode === 'server' ? 'тоже загружаются' : 'остаются в браузере'}. Ничего не удаляется: локальные копии останутся здесь и будут помечены как перенесённые.`),
    list, sum, h('div', { class: 'actions' }, go2, btn('Отмена', () => close(), 'small on-film')), status), 'Перенос локальных записей');
  paint();
}
