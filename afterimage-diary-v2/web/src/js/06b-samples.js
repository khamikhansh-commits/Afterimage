/* ───────────── образцы дней ─────────────
   Нужны, чтобы показать на главной, что делает дневник, и чтобы форму можно было попробовать без своих файлов.
   Это примеры, а не чьи-то записи: в дневник они сами не попадают. */
const SAMPLE_KEYS = ['trees', 'cup', 'city', 'screen', 'sea', 'shore'];
const SAMPLE_DAYS = [
  { key: 'autumn', label: 'Осенняя прогулка', photos: ['trees', 'cup'], location: 'Старый парк', weather: 'Холодно и ясно', tempC: 4, tags: ['осень', 'прогулка'], song: { title: 'Les feuilles mortes', artist: 'Yves Montand' }, daysAgo: 34,
    story: 'Мы гуляли по парку почти три часа и не заметили времени. Всюду жёлтые листья, мокрые и шумные под ботинками, а воздух такой холодный, что щипало щёки. Купили горячий шоколад в киоске у пруда и держали стаканы обеими руками. Говорили обо всём: о школьных друзьях, о переезде, о том, чего теперь боимся. По дороге домой пальцы замёрзли, а мне не хотелось, чтобы день кончался.' },
  { key: 'night', label: 'Ночь перед дедлайном', photos: ['city', 'screen'], location: 'Рабочий стол, 14-й этаж', weather: 'Ясная ночь', tempC: -2, tags: ['работа', 'ночь'], song: { title: 'Midnight City', artist: 'M83' }, daysAgo: 12,
    story: 'Дедлайн в девять утра, а модель всё не сходилась. Четвёртый кофе, уже холодный. Весь город за окном — одни огни: синие башни, красные стоп-сигналы на проспекте, неоновая вывеска мигает не в такт. Четыре часа я слушал один и тот же электронный трек, потому что в тишине было хуже. В 3:40 тесты наконец позеленели. Я даже не обрадовался, просто опустел и смотрел, как мигает курсор.' },
  { key: 'sea', label: 'Утро у моря', photos: ['sea', 'shore'], location: 'Пирс', weather: 'Штиль, первый свет', tempC: 16, tags: ['море', 'утро'], song: { title: 'Gymnopédie No. 1', artist: 'Erik Satie' }, daysAgo: 87,
    story: 'Я проснулся раньше всех и босиком спустился к воде. Море было ровным, как стекло, а солнце медленно поднималось за пирсом, оранжевое. На пляже никого, только рыбацкая лодка вдалеке и звук маленьких волн. Я сидел на холодном песке, пока не онемели ступни, и просто дышал. Впервые за много месяцев от меня никто ничего не хотел.' },
];

/* Спецификации трёх примеров написаны заранее: это иллюстрации, а не ответы на запрос. */
const EXAMPLE_SPECS = {
  autumn: {
    title: 'Что сохранили листья', caption: 'Три часа, два бумажных стакана и холод, от которого всё сказанное казалось ближе.',
    emotion: { atmosphere: 'Медленный янтарный день, в котором холод снаружи превратил долгий разговор в маленькую тёплую комнату.', dominant: [{ name: 'ностальгия', intensity: 0.85 }, { name: 'близость', intensity: 0.8 }, { name: 'нежность', intensity: 0.65 }, { name: 'светлая грусть', intensity: 0.5 }], energy: 0.3, valence: 0.72, intensity: 0.62, context: 'Двое друзей, городской парк, поздняя осень', sensory: ['мокрые листья шумят под ногами', 'воздух щиплет щёки', 'горячий шоколад в обеих руках', 'замёрзшие пальцы по дороге домой'] },
    relationship: 'Слова всё время возвращаются к теплу, которое держат против холода. Снимки говорят то же: янтарная крона и чашка сверху. Шансон добавляет ощущение дня, который уже вспоминают.',
    direction: { name: 'Янтарный импрессионизм', statement: 'Пусть выглядит так, как греют руки в холодный день.', references: ['Тополя Моне осенью', 'Kodak Portra 400', 'Страницы гербария'], rationale: 'Отпечатки разного размера, положенные от руки, и мягкое свечение сохраняют день осязаемым и непостановочным. Палитра взята с кроны и чашки, а падающие листья задают тот же неторопливый темп, что и в рассказе.' },
    palette: { background: '#EAD9BC', surface: '#F8F0DF', ink: '#3A2817', accent: '#C4722A', accent2: '#8C5B2E', muted: '#9B8262', names: ['Бумажный фонарь', 'Молочная пена', 'Мокрая кора', 'Огонь листвы', 'Каштан', 'Туман в парке'] },
    typography: { display: 'cormorant', body: 'lora', weight: 500, italic: true, case: 'sentence', tracking: 0, scale: 1.1, note: 'Курсивная антиква читается как строчка, записанная в блокнот по дороге домой.' },
    composition: { layout: 'collage', format: 'portrait', align: 'left', titlePlacement: 'bottom', tilt: 0.65, note: 'Отпечатки лежат чуть криво, как их раскладывают на столе вечером.' },
    photo: { saturation: 0.95, contrast: 0.95, brightness: 0.02, warmth: 0.5, fade: 0.18, tint: '#E0A458', tintStrength: 0.14, duotone: 0, vignette: 0.35, softness: 0.45, frame: 'white', note: 'Тёплые, чуть молочные тени и мягкое свечение, как на плёнке из семейного альбома.' },
    texture: { kind: 'grain', intensity: 0.55, note: 'Плёночное зерно — для ощущения, что это уже прошлое.' },
    motif: { kind: 'leaves', density: 0.38, speed: 0.3, color: 'accent', note: 'Листья были звуком всей прогулки.' },
    motion: { entrance: 'develop', transition: 'crossfade', tempo: 'slow', kenBurns: 0.5, note: 'Неторопливо, как сами три часа.' },
    emblem: { subject: 'упавший лист', paths: ['M50 92 L50 44', 'M50 12 C76 26 80 58 50 74 C20 58 24 26 50 12 Z', 'M50 34 L64 26 M50 48 L34 40 M50 60 L62 54'] },
  },
  night: {
    title: 'Зелёные в 3:40', caption: 'Город не гасил огни вместе со мной. Когда всё заработало, радоваться было уже нечем.',
    emotion: { atmosphere: 'Натянутая, выжженная ночь, где единственное тепло — экран, а город — поле равнодушных огней.', dominant: [{ name: 'напряжение', intensity: 0.9 }, { name: 'усталость', intensity: 0.85 }, { name: 'одиночество', intensity: 0.6 }, { name: 'облегчение', intensity: 0.35 }], energy: 0.8, valence: 0.3, intensity: 0.85, context: 'Один за столом, дедлайн в девять, часы после полуночи', sensory: ['четвёртый кофе остыл', 'неон мигает не в такт', 'красные стоп-сигналы на проспекте', 'один трек по кругу', 'мигающий курсор'] },
    relationship: 'Рассказ и снимки одного холодного синего цвета. Ночь держится на ровном пульсе трека, поэтому страница собрана по строгой сетке, которая ни разу не расслабляется.',
    direction: { name: 'Холодная сетка', statement: 'Набрать как систему под нагрузкой: жёсткие края, никакого уюта и один цвет, который не выключается.', references: ['Йозеф Мюллер-Брокман', 'CineStill 800T', 'Ночные улицы в «Соучастнике» Майкла Манна'], rationale: 'Строгая страница с фактами и широкие прописные передают давление срока. Палитра — это окно и монитор, а красный стоп-сигнал остаётся единственной тёплой нотой. Резкие склейки и строки экрана не дают картинке успокоиться.' },
    palette: { background: '#10151C', surface: '#1A222D', ink: '#E4EBF2', accent: '#3FA9E0', accent2: '#E0523F', muted: '#6A7786', names: ['Тёмное окно', 'Край монитора', 'Белый курсор', 'Синяя башня', 'Стоп-сигнал', 'Дымка проспекта'] },
    typography: { display: 'unbounded', body: 'jetbrains', weight: 700, italic: false, case: 'upper', tracking: 0.01, scale: 0.86, note: 'Широкие механические прописные и моноширинный шрифт рядом — голос терминала в три часа ночи.' },
    composition: { layout: 'page', format: 'portrait', align: 'left', titlePlacement: 'bottom', tilt: 0.02, note: 'Ничего не положено от руки: каждый блок стоит по сетке.' },
    photo: { saturation: 0.72, contrast: 1.24, brightness: -0.03, warmth: -0.55, fade: 0.04, tint: '#2F6C9E', tintStrength: 0.2, duotone: 0.18, vignette: 0.45, softness: 0.05, frame: 'none', note: 'Холодно, жёстко и немного выцвело, как перетянутая ночная плёнка.' },
    texture: { kind: 'halftone', intensity: 0.3, note: 'Типографский растр, плоский и технический.' },
    motif: { kind: 'scan', density: 0.5, speed: 0.75, color: 'accent', note: 'Строки монитора и мелкие сбои — так их видят уставшие глаза.' },
    motion: { entrance: 'cut', transition: 'cut', tempo: 'fast', kenBurns: 0.2, note: 'Резкие склейки: в этой ночи ничего не появлялось плавно.' },
    emblem: { subject: 'строка терминала', paths: ['M22 30 L46 50 L22 70', 'M54 72 L82 72'] },
  },
  sea: {
    title: 'Никто ничего не просил', caption: 'Ровная вода, оранжевый край солнца, холодный песок. Целое утро, которому ничего не было нужно взамен.',
    emotion: { atmosphere: 'Широкая задержанная тишина: день ещё не начался, и никому ничего не нужно.', dominant: [{ name: 'покой', intensity: 0.9 }, { name: 'облегчение', intensity: 0.75 }, { name: 'уединение', intensity: 0.6 }, { name: 'восхищение', intensity: 0.45 }], energy: 0.15, valence: 0.78, intensity: 0.5, context: 'Один на пляже, пока все спят', sensory: ['море ровное, как стекло', 'холодный песок под босыми ногами', 'маленькие волны', 'медленный оранжевый рассвет'] },
    relationship: 'Слова, снимки и Сати оставляют место: мало нот, мало предметов, длинный горизонт. Оформление делает то же самое.',
    direction: { name: 'Открытка с горизонта', statement: 'Как письмо самому себе, отправленное из утра, в котором ничего не происходило.', references: ['Морские пейзажи Хироси Сугимото', 'Вырезки Матисса', 'Fuji Pro 400H'], rationale: 'Открытка сводит утро к тому, что в нём было: место, дата, погода и два кадра. Широко разряженные прописные читаются медленно, как и само утро, а тонкие линии волн — единственное движение.' },
    palette: { background: '#E6ECEA', surface: '#F5F7F4', ink: '#1F3642', accent: '#E88F5E', accent2: '#6699AA', muted: '#8499A0', names: ['Морское стекло', 'Пена', 'Глубина у пирса', 'Первое солнце', 'Ровная вода', 'Утренняя дымка'] },
    typography: { display: 'tenor', body: 'spectral', weight: 400, italic: false, case: 'upper', tracking: 0.14, scale: 0.84, note: 'Спокойные прописные с широкими промежутками оставляют воздух между буквами.' },
    composition: { layout: 'trip', format: 'portrait', align: 'center', titlePlacement: 'bottom', tilt: 0.1, note: 'Открытка лежит почти ровно: в этом утре не было ничего резкого.' },
    photo: { saturation: 0.95, contrast: 0.94, brightness: 0.04, warmth: 0.12, fade: 0.2, tint: '#BFD9DC', tintStrength: 0.1, duotone: 0, vignette: 0.08, softness: 0.4, frame: 'none', note: 'Бледно, воздушно и почти без вмешательства.' },
    texture: { kind: 'paper', intensity: 0.4, note: 'Мягкая бумага, как акварельный лист.' },
    motif: { kind: 'waves', density: 0.4, speed: 0.25, color: 'accent2', note: 'Маленькие волны у нижнего края.' },
    motion: { entrance: 'fade', transition: 'crossfade', tempo: 'slow', kenBurns: 0.6, note: 'Появляется медленно и почти не движется.' },
    emblem: { subject: 'солнце над горизонтом', paths: ['M14 62 L86 62', 'M30 62 A20 20 0 0 1 70 62', 'M24 74 L76 74', 'M36 86 L64 86'] },
  },
};

const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const exampleScenes = new Map();
/** Готовая сцена одного из трёх примеров (для главной страницы). */
function exampleScene(key, no) {
  if (!exampleScenes.has(key)) {
    const day = SAMPLE_DAYS.find((d) => d.key === key), date = isoDaysAgo(day.daysAgo);
    const spec = normalizeSpec(EXAMPLE_SPECS[key], { seed: hashStr(key) });
    exampleScenes.set(key, buildScene({ spec, canvases: day.photos.map(samplePhoto), meta: { id: 'ex-' + key, no, date, location: day.location, weather: day.weather, tempC: day.tempC, tags: day.tags, song: day.song, photos: [] } }).then((scene) => ({ scene, day, spec, date })));
  }
  return exampleScenes.get(key);
}
