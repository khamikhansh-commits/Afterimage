/* ───────────── type library ─────────────
   Every face here ships a Cyrillic set as well as Latin, so a day written in Russian is set properly.
   The art director picks by key; faces load from Google Fonts on demand. */
const STACK = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  script: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive",
  narrow: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
};
const FONTS = {
  // display
  cormorant: { family: 'Cormorant Garamond', spec: 'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600', w: [300, 400, 500, 600, 700], ital: true, stack: STACK.serif, role: 'display', feel: 'romantic, literary, soft, nostalgic' },
  playfair: { family: 'Playfair Display', spec: 'Playfair+Display:ital,wght@0,400;0,500;0,700;0,900;1,400;1,700', w: [400, 500, 700, 900], ital: true, stack: STACK.serif, role: 'display', feel: 'dramatic, high-contrast, classic editorial' },
  notoserif: { family: 'Noto Serif Display', spec: 'Noto+Serif+Display:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500', w: [300, 400, 500, 700], ital: true, stack: STACK.serif, role: 'display', feel: 'luxurious, fashion-editorial, poised' },
  prata: { family: 'Prata', spec: 'Prata', w: [400], ital: false, stack: STACK.serif, role: 'display', feel: 'elegant didone, calm, formal' },
  yeseva: { family: 'Yeseva One', spec: 'Yeseva+One', w: [400], ital: false, stack: STACK.serif, role: 'display', feel: 'warm, rounded, generous, festive' },
  forum: { family: 'Forum', spec: 'Forum', w: [400], ital: false, stack: STACK.serif, role: 'display', feel: 'antique roman capitals, monumental, quiet' },
  oldstandard: { family: 'Old Standard TT', spec: 'Old+Standard+TT:ital,wght@0,400;0,700;1,400', w: [400, 700], ital: true, stack: STACK.serif, role: 'display', feel: 'old book, scholarly, 19th-century, wistful' },
  unbounded: { family: 'Unbounded', spec: 'Unbounded:wght@300;400;500;700;900', w: [300, 400, 500, 700, 900], ital: false, stack: STACK.sans, role: 'display', feel: 'wide, futuristic, electronic, bold' },
  oswald: { family: 'Oswald', spec: 'Oswald:wght@300;400;500;700', w: [300, 400, 500, 700], ital: false, stack: STACK.narrow, role: 'display', feel: 'condensed poster, urgent, headline' },
  sofia: { family: 'Sofia Sans Extra Condensed', spec: 'Sofia+Sans+Extra+Condensed:wght@400;600;800', w: [400, 600, 800], ital: false, stack: STACK.narrow, role: 'display', feel: 'tall cinematic titles, film poster' },
  rubikmono: { family: 'Rubik Mono One', spec: 'Rubik+Mono+One', w: [400], ital: false, stack: STACK.sans, role: 'display', feel: 'heavy, loud, playful, block' },
  dela: { family: 'Dela Gothic One', spec: 'Dela+Gothic+One', w: [400], ital: false, stack: STACK.sans, role: 'display', feel: 'raw, brutal, heavy, underground' },
  montserrat: { family: 'Montserrat', spec: 'Montserrat:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400', w: [300, 400, 500, 700, 900], ital: true, stack: STACK.sans, role: 'display', feel: 'geometric, modern, confident, clean' },
  jost: { family: 'Jost', spec: 'Jost:wght@300;400;500;700', w: [300, 400, 500, 700], ital: false, stack: STACK.sans, role: 'display', feel: 'bauhaus geometric, airy, light' },
  comfortaa: { family: 'Comfortaa', spec: 'Comfortaa:wght@300;400;700', w: [300, 400, 700], ital: false, stack: STACK.sans, role: 'display', feel: 'rounded, soft, friendly, gentle' },
  poiret: { family: 'Poiret One', spec: 'Poiret+One', w: [400], ital: false, stack: STACK.sans, role: 'display', feel: 'art deco, delicate, thin, glamorous' },
  tenor: { family: 'Tenor Sans', spec: 'Tenor+Sans', w: [400], ital: false, stack: STACK.sans, role: 'display', feel: 'humanist, refined, serene' },
  jetbrains: { family: 'JetBrains Mono', spec: 'JetBrains+Mono:wght@300;400;500;700', w: [300, 400, 500, 700], ital: false, stack: STACK.mono, role: 'both', feel: 'technical, nocturnal, terminal, precise' },
  plexmono: { family: 'IBM Plex Mono', spec: 'IBM+Plex+Mono:wght@300;400;500', w: [300, 400, 500], ital: false, stack: STACK.mono, role: 'both', feel: 'typewriter, archival, factual' },
  pressstart: { family: 'Press Start 2P', spec: 'Press+Start+2P', w: [400], ital: false, stack: STACK.mono, role: 'display', feel: 'pixel, arcade, 8-bit, game' },
  caveat: { family: 'Caveat', spec: 'Caveat:wght@400;500;700', w: [400, 500, 700], ital: false, stack: STACK.script, role: 'both', feel: 'quick handwriting, intimate, spontaneous' },
  marck: { family: 'Marck Script', spec: 'Marck+Script', w: [400], ital: false, stack: STACK.script, role: 'display', feel: 'flowing script, tender, romantic' },
  badscript: { family: 'Bad Script', spec: 'Bad+Script', w: [400], ital: false, stack: STACK.script, role: 'both', feel: 'neat diary handwriting, private' },
  lobster: { family: 'Lobster', spec: 'Lobster', w: [400], ital: false, stack: STACK.script, role: 'display', feel: 'retro script, summer, bold, cheerful' },
  // text
  lora: { family: 'Lora', spec: 'Lora:ital,wght@0,400;0,500;0,600;1,400', w: [400, 500, 600], ital: true, stack: STACK.serif, role: 'body', feel: 'warm book serif' },
  literata: { family: 'Literata', spec: 'Literata:ital,wght@0,400;0,500;1,400', w: [400, 500], ital: true, stack: STACK.serif, role: 'body', feel: 'sturdy reading serif' },
  ebgaramond: { family: 'EB Garamond', spec: 'EB+Garamond:ital,wght@0,400;0,500;1,400', w: [400, 500], ital: true, stack: STACK.serif, role: 'body', feel: 'classical, bookish' },
  spectral: { family: 'Spectral', spec: 'Spectral:ital,wght@0,300;0,400;0,500;1,400', w: [300, 400, 500], ital: true, stack: STACK.serif, role: 'body', feel: 'crisp, elegant text serif' },
  golos: { family: 'Golos Text', spec: 'Golos+Text:wght@400;500;600', w: [400, 500, 600], ital: false, stack: STACK.sans, role: 'body', feel: 'neutral, modern sans' },
  onest: { family: 'Onest', spec: 'Onest:wght@400;500;600', w: [400, 500, 600], ital: false, stack: STACK.sans, role: 'body', feel: 'clean, friendly sans' },
  manrope: { family: 'Manrope', spec: 'Manrope:wght@400;500;600', w: [400, 500, 600], ital: false, stack: STACK.sans, role: 'body', feel: 'geometric, contemporary sans' },
};
const DISPLAY_KEYS = Object.keys(FONTS).filter((k) => FONTS[k].role !== 'body');
const BODY_KEYS = Object.keys(FONTS).filter((k) => FONTS[k].role !== 'display');

/** Шрифт по ключу. Ключ может прийти из сохранённых данных или ответа ИИ, поэтому берём только собственные поля таблицы. */
const fontOf = (key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(FONTS, key) ? FONTS[key] : null);
const fontLoads = new Map();
/** Inject the stylesheet once and wait (briefly) for the face; never blocks rendering for long. */
function loadFont(key) {
  const f = fontOf(key);
  if (!f) return Promise.resolve(false);
  if (fontLoads.has(key)) return fontLoads.get(key);
  const p = (async () => {
    try {
      if (!f.preloaded) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${f.spec}&display=swap`;
        document.head.append(link);
        await withTimeout(new Promise((res) => { link.onload = res; link.onerror = res; }), 3500).catch(() => {});
      }
      const jobs = f.w.slice(0, 3).map((w) => document.fonts.load(`${w} 40px "${f.family}"`, 'AaЯя'));
      if (f.ital) jobs.push(document.fonts.load(`italic 400 40px "${f.family}"`, 'AaЯя'));
      await withTimeout(Promise.all(jobs), 3500).catch(() => {});
      return true;
    } catch { return false; }
  })();
  fontLoads.set(key, p);
  return p;
}
['notoserif', 'onest', 'plexmono'].forEach((k) => { FONTS[k].preloaded = true; });

const nearestWeight = (key, w) => (fontOf(key) || FONTS.onest).w.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
/** CSS font shorthand for canvas and DOM use. */
function fontCss(key, size, weight = 400, italic = false) {
  const f = fontOf(key) || FONTS.onest;
  return `${italic && f.ital ? 'italic ' : ''}${nearestWeight(key, weight)} ${Math.round(size * 100) / 100}px "${f.family}", ${f.stack}`;
}
const fontFamilyCss = (key) => { const f = fontOf(key) || FONTS.onest; return `"${f.family}", ${f.stack}`; };
