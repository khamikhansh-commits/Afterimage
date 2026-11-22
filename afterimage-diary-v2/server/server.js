#!/usr/bin/env node
/* Afterimage Diary — сервер.
   Только встроенные модули Node.js (22.5 и новее): ни одного внешнего пакета, нечего устанавливать.

   Что он делает:
   · аккаунты по почте и паролю (scrypt), сессии в cookie HttpOnly, сброс пароля одноразовой ссылкой;
   · приватное хранение: каждый запрос к данным ограничен владельцем прямо в SQL-запросе;
   · загрузка фотографий и аудио с проверкой содержимого и квотами;
   · прокси к ИИ (ключ остаётся на сервере) и к поиску адресов, если они настроены.

   Запуск для разработки:  node server.js --dev
   Рабочий режим:          APP_ENV не задан или prod, обязателен PUBLIC_URL=https://ваш-домен */
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildBriefPrompt, buildMusicPrompt, safeUrl, validHex } from './prompt.gen.mjs';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {
  console.error('Нужен Node.js 22.5 или новее: в нём есть встроенная база SQLite. Установленная версия: ' + process.version);
  process.exit(1);
}

/* ───────────── настройки (только из окружения; секретов в коде нет) ───────────── */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const die = (msg) => { console.error('Ошибка настройки: ' + msg); process.exit(1); };
const intEnv = (name, def, min, max) => { const v = process.env[name]; if (v == null || v === '') return def; const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) die(`${name} должно быть целым числом от ${min} до ${max}`); return n; };

// Режим разработки включается только явно. Всё остальное — рабочий режим с самыми строгими правилами.
const ENV = process.argv.includes('--dev') || process.env.APP_ENV === 'dev' ? 'dev' : 'prod';
const PORT = intEnv('PORT', 3000, 1, 65535);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PUBLIC_DIR = path.join(ROOT, 'public');

function isLoopback(host) {
  const hname = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hname || hname === 'localhost' || hname.endsWith('.localhost')) return true;
  if (net.isIPv4(hname)) return hname.startsWith('127.') || hname === '0.0.0.0';
  if (net.isIPv6(hname)) return hname === '::1' || hname === '::';
  return false;
}
function bareOrigin(value, name) {
  let u;
  try { u = new URL(value); } catch { die(`${name} должен быть адресом вида https://example.com`); }
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash || u.username || u.password) die(`${name} должен быть только схемой и хостом, без пути и параметров: ${value}`);
  return u;
}
const ORIGINS = new Set();
if (ENV === 'prod') {
  if (!process.env.PUBLIC_URL) die('в рабочем режиме задайте PUBLIC_URL=https://ваш-домен. Для запуска на своём компьютере используйте: node server.js --dev');
  const u = bareOrigin(process.env.PUBLIC_URL, 'PUBLIC_URL');
  if (u.protocol !== 'https:') die('PUBLIC_URL в рабочем режиме должен начинаться с https://');
  if (isLoopback(u.hostname)) die('PUBLIC_URL в рабочем режиме не может указывать на localhost. Для локального запуска используйте --dev');
  ORIGINS.add(u.origin);
} else {
  if (process.env.PUBLIC_URL) ORIGINS.add(bareOrigin(process.env.PUBLIC_URL, 'PUBLIC_URL').origin);
  ORIGINS.add(`http://localhost:${PORT}`); ORIGINS.add(`http://127.0.0.1:${PORT}`);
}
const PUBLIC_ORIGIN = [...ORIGINS][0];
const HOSTS = new Set([...ORIGINS].map((o) => new URL(o).host));

const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const AI_BASE = (() => { const u = bareOrigin(process.env.AI_BASE_URL || 'https://api.anthropic.com', 'AI_BASE_URL'); if (ENV === 'prod' && u.protocol !== 'https:') die('AI_BASE_URL должен быть https'); return u.origin; })();
const AI_PHOTOS = process.env.AI_SEND_PHOTOS === '1';     // по умолчанию снимки наружу не уходят
const AI_DAILY = intEnv('AI_DAILY_LIMIT', 40, 1, 10000);
const GEO_CONTACT = (process.env.GEOCODER_CONTACT || '').replace(/[\r\n]/g, '').slice(0, 120);
const GEO_BASE = (() => { const u = bareOrigin(process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org', 'GEOCODER_URL'); if (ENV === 'prod' && u.protocol !== 'https:') die('GEOCODER_URL должен быть https'); return u.origin; })();
const MAIL_HOOK = process.env.MAIL_WEBHOOK_URL || '';
const MAIL_TOKEN = process.env.MAIL_WEBHOOK_TOKEN || '';
if (MAIL_HOOK) { const u = new URL(MAIL_HOOK); if (ENV === 'prod' && u.protocol !== 'https:') die('MAIL_WEBHOOK_URL должен быть https'); }
const MAIL_MODE = MAIL_HOOK ? 'webhook' : ENV === 'dev' ? 'console' : 'none';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const LIMITS = { doc: 400 * 1024, docs: 5000, image: 8 * 1024 * 1024, audio: 25 * 1024 * 1024, blobs: 3000, bytes: intEnv('USER_QUOTA_MB', 1024, 1, 100000) * 1024 * 1024, json: 64 * 1024, ai: 12 * 1024 * 1024 };
const SESSION_DAYS = 30;

/* ───────────── база ───────────── */
fs.mkdirSync(path.join(DATA_DIR, 'blobs'), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(DATA_DIR, 'afterimage.db'));
db.exec(`
PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt BLOB NOT NULL, hash BLOB NOT NULL, params TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS docs (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, body TEXT NOT NULL, size INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, id));
CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS blobs_user ON blobs(user_id);
CREATE TABLE IF NOT EXISTS attempts (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_key ON attempts(key, at);
`);
const now = () => Math.floor(Date.now() / 1000);
const Q = {
  userByEmail: db.prepare('SELECT id, email, salt, hash, params FROM users WHERE email = ?'),
  userById: db.prepare('SELECT id, email, salt, hash, params FROM users WHERE id = ?'),
  addUser: db.prepare('INSERT INTO users (id, email, salt, hash, params, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING'),
  setPassword: db.prepare('UPDATE users SET salt = ?, hash = ?, params = ? WHERE id = ?'),
  delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  addSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  sessionUser: db.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  delSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?'),
  addReset: db.prepare('INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  // Одноразовость ссылки обеспечивает сам UPDATE: из двух одновременных запросов сработает ровно один.
  useReset: db.prepare('UPDATE resets SET used = 1 WHERE token_hash = ? AND used = 0 AND expires_at > ? RETURNING user_id'),
  delResets: db.prepare('DELETE FROM resets WHERE user_id = ?'),
  listDocs: db.prepare('SELECT id, body FROM docs WHERE user_id = ? ORDER BY id'),
  // Лимит числа документов проверяется в том же запросе, который пишет: параллельные запросы его не обойдут.
  putDoc: db.prepare(`INSERT INTO docs (user_id, id, body, size, updated_at) SELECT ?, ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM docs WHERE user_id = ?) < ? OR EXISTS (SELECT 1 FROM docs WHERE user_id = ? AND id = ?)
    ON CONFLICT(user_id, id) DO UPDATE SET body = excluded.body, size = excluded.size, updated_at = excluded.updated_at`),
  delDoc: db.prepare('DELETE FROM docs WHERE user_id = ? AND id = ?'),
  delDocs: db.prepare('DELETE FROM docs WHERE user_id = ?'),
  // Квота на файлы (количество и байты) резервируется этой же вставкой.
  addBlob: db.prepare(`INSERT INTO blobs (id, user_id, type, size, created_at) SELECT ?, ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM blobs WHERE user_id = ?) < ? AND (SELECT COALESCE(SUM(size), 0) FROM blobs WHERE user_id = ?) + ? <= ?`),
  getBlob: db.prepare('SELECT id, type, size FROM blobs WHERE id = ? AND user_id = ?'),
  delBlob: db.prepare('DELETE FROM blobs WHERE id = ? AND user_id = ?'),
  listBlobs: db.prepare('SELECT id FROM blobs WHERE user_id = ?'),
  delBlobs: db.prepare('DELETE FROM blobs WHERE user_id = ?'),
  usage: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM blobs WHERE user_id = ?'),
  hit: db.prepare('INSERT INTO attempts (key, at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM attempts WHERE key = ? AND at > ?) < ?'),
  clearHits: db.prepare('DELETE FROM attempts WHERE key = ?'),
  sweep: [db.prepare('DELETE FROM attempts WHERE at < ?'), db.prepare('DELETE FROM sessions WHERE expires_at < ?'), db.prepare('DELETE FROM resets WHERE expires_at < ?')],
};
/** Счётчик попыток с лимитом в одном запросе: «проверил и записал» нельзя разорвать параллельным запросом. */
const allow = (key, limit, windowSec) => Q.hit.run(key, now(), key, now() - windowSec, limit).changes === 1;
const sweep = () => { const t = now(); Q.sweep[0].run(t - 86400 * 2); Q.sweep[1].run(t); Q.sweep[2].run(t - 86400); };
sweep(); setInterval(sweep, 3600 * 1000).unref();

/* ───────────── пароли, сессии, журнал ───────────── */
const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 96 * 1024 * 1024 };
const hashPassword = async (pw, salt = crypto.randomBytes(16)) => ({ salt, hash: await scrypt(pw.normalize('NFKC'), salt, 32, SCRYPT) });
async function verifyPassword(pw, user) { const got = (await hashPassword(pw, Buffer.from(user.salt))).hash, want = Buffer.from(user.hash); return got.length === want.length && crypto.timingSafeEqual(got, want); }
const DUMMY = await hashPassword(crypto.randomBytes(16).toString('hex')); // чтобы вход с несуществующей почтой занимал то же время
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const COOKIE = ENV === 'prod' ? '__Host-aid' : 'aid';
const cookieAttrs = `Path=/; HttpOnly; SameSite=Strict${ENV === 'prod' ? '; Secure' : ''}`;
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  Q.addSession.run(sha(token), userId, now(), now() + SESSION_DAYS * 86400);
  res.appendHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieAttrs}; Max-Age=${SESSION_DAYS * 86400}`);
}
const endCookie = (res) => res.appendHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs}; Max-Age=0`);
function sessionOf(req) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([A-Za-z0-9_-]{43})(?:;|$)').exec(req.headers.cookie || '');
  if (!m) return null;
  const tokenHash = sha(m[1]), row = Q.sessionUser.get(tokenHash, now());
  return row ? { id: row.id, email: row.email, tokenHash } : null;
}
/** Журнал событий безопасности. Почта пишется только в виде короткого хеша, пароли и токены — никогда. */
const audit = (event, data = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }));
const emailTag = (email) => sha(email).slice(0, 12);

/* ───────────── HTTP-основа ───────────── */
class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const bad = (message, code = 'invalid') => new HttpError(400, code, message);
const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:", "media-src 'self' blob:", "connect-src 'self'",
  'frame-src https://open.spotify.com https://www.youtube-nocookie.com https://embed.music.apple.com https://w.soundcloud.com https://widget.deezer.com https://music.yandex.ru',
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
function baseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (ENV === 'prod') res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}
function send(res, status, body) {
  if (status === 204) { res.writeHead(204); return res.end(); }
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
  res.end(buf);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { req.resume(); return reject(new HttpError(413, 'too_large', 'Слишком большой запрос.')); }
    const chunks = []; let size = 0, done = false;
    req.on('data', (c) => { if (done) return; size += c.length; if (size > limit) { done = true; reject(new HttpError(413, 'too_large', 'Слишком большой запрос.')); req.resume(); return; } chunks.push(c); });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}
async function readJson(req, limit = LIMITS.json) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'unsupported', 'Ожидается JSON.');
  let v;
  try { v = JSON.parse((await readBody(req, limit)).toString('utf8')); } catch (e) { if (e instanceof HttpError) throw e; throw bad('Запрос не удалось прочитать.'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad('Запрос не удалось прочитать.');
  return v;
}
function clientIp(req) {
  if (TRUST_PROXY) { const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean); if (xf.length && net.isIP(xf[xf.length - 1])) return xf[xf.length - 1]; }
  return req.socket.remoteAddress || 'unknown';
}

/* ───────────── проверка входных данных (всё, что пришло от клиента, — недоверенное) ───────────── */
const S = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const N = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
function vEmail(v) { const e = typeof v === 'string' ? v.trim().toLowerCase() : ''; if (e.length > 254 || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e)) throw bad('Проверьте адрес электронной почты.', 'bad_email'); return e; }
function vPassword(v, email = '') {
  if (typeof v !== 'string' || v.length < 10) throw bad('Пароль должен быть не короче 10 символов.', 'weak_password');
  if (v.length > 200) throw bad('Пароль слишком длинный.', 'weak_password');
  if (email && v.toLowerCase() === email) throw bad('Пароль не должен совпадать с почтой.', 'weak_password');
  return v;
}
function vDayInput(raw) {
  const i = raw && typeof raw === 'object' ? raw : {};
  const story = typeof i.story === 'string' ? i.story.slice(0, 12000) : '';
  if (story.trim().length < 3) throw bad('Нужен текст воспоминания.');
  const song = i.song && typeof i.song === 'object' ? { title: S(i.song.title, 120), artist: S(i.song.artist, 120), url: safeUrl(i.song.url), hasAudio: i.song.hasAudio === true } : null;
  return {
    story, date: /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : new Date().toISOString().slice(0, 10), location: S(i.location, 80), weather: S(i.weather, 40),
    tempC: typeof i.tempC === 'number' && Number.isFinite(i.tempC) ? N(i.tempC, -90, 60, 0) : null,
    tags: (Array.isArray(i.tags) ? i.tags : []).map((t) => S(t, 30)).filter(Boolean).slice(0, 12), song,
  };
}
function vPhotos(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 8).map((p) => {
    const c = (p && p.colors) || {};
    return { w: N(p && p.w, 1, 20000, 4), h: N(p && p.h, 1, 20000, 3), colors: { dominant: (Array.isArray(c.dominant) ? c.dominant : []).map(validHex).filter(Boolean).slice(0, 5), brightness: N(c.brightness, 0, 1, 0.5), saturation: N(c.saturation, 0, 1, 0.5), warmth: N(c.warmth, -1, 1, 0) } };
  });
}
const isJpeg = (b) => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
/** Тип файла определяется по его первым байтам, а не по тому, что заявил клиент. */
function sniff(b, kind) {
  const at = (s, o = 0) => b.length >= o + s.length && b.subarray(o, o + s.length).toString('latin1') === s;
  if (kind === 'image') {
    if (isJpeg(b)) return 'image/jpeg';
    if (b.length > 8 && b[0] === 0x89 && at('PNG\r\n\x1a\n', 1)) return 'image/png';
    if (at('RIFF') && at('WEBP', 8)) return 'image/webp';
    return '';
  }
  if (at('ID3') || (b.length > 2 && b[0] === 0xFF && (b[1] & 0xE0) === 0xE0 && (b[1] & 0x06) !== 0)) return 'audio/mpeg';
  if (at('RIFF') && at('WAVE', 8)) return 'audio/wav';
  if (at('OggS')) return 'audio/ogg';
  if (at('fLaC')) return 'audio/flac';
  if (at('ftyp', 4)) return 'audio/mp4';
  return '';
}
const blobPath = (id) => path.join(DATA_DIR, 'blobs', id); // id — 32 шестнадцатеричных символа, созданных сервером

/* ───────────── почта ─────────────
   Заготовка. В режиме разработки ссылка для сброса печатается в консоль сервера.
   Для настоящей отправки задайте MAIL_WEBHOOK_URL: сервер отправит туда POST с JSON { to, subject, text }
   и заголовком Authorization: Bearer <MAIL_WEBHOOK_TOKEN>. Принять его может любой почтовый сервис с HTTP-API
   или маленькая собственная функция, которая пересылает письмо через SMTP. */
async function sendMail(to, subject, text) {
  if (MAIL_MODE === 'webhook') {
    const r = await fetch(MAIL_HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(MAIL_TOKEN ? { Authorization: 'Bearer ' + MAIL_TOKEN } : {}) }, body: JSON.stringify({ to, subject, text }), signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!r.ok) throw new Error('mail webhook ' + r.status);
    return true;
  }
  if (MAIL_MODE === 'console') { console.log(`\n[почта не настроена, режим разработки] Письмо для ${to}\n${subject}\n${text}\n`); return true; }
  return false;
}

/* ───────────── ИИ и поиск адресов (ключи только на сервере) ───────────── */
async function askModel(prompt, images, maxTokens) {
  const content = [...images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })), { type: 'text', text: prompt }];
  let r;
  try {
    r = await fetch(AI_BASE + '/v1/messages', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(150000),
      headers: { 'content-type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] }) });
  } catch (e) { throw new HttpError(502, e && e.name === 'TimeoutError' ? 'timeout' : 'upstream_error', 'ИИ не ответил. Попробуйте ещё раз.'); }
  if (!r.ok) { audit('ai.upstream_error', { status: r.status }); throw new HttpError(r.status === 429 ? 429 : 502, r.status === 429 ? 'rate_limited' : 'upstream_error', 'ИИ не ответил. Попробуйте ещё раз.'); }
  const j = await r.json().catch(() => null);
  const text = j && Array.isArray(j.content) ? j.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('') : '';
  if (!text) throw new HttpError(502, 'empty_completion', 'ИИ ничего не ответил.');
  return text.slice(0, 60000);
}
const geoCache = new Map(); let geoNext = 0;
async function geocode(q) {
  const key = q.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = Math.max(0, geoNext - Date.now()); geoNext = Math.max(Date.now(), geoNext) + 1100; // не чаще одного запроса в секунду на весь сервер
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const url = GEO_BASE + '/search?' + new URLSearchParams({ q, format: 'jsonv2', limit: '5', 'accept-language': 'ru' }).toString();
  let r;
  try { r = await fetch(url, { headers: { 'User-Agent': `AfterimageDiary/2.0 (${GEO_CONTACT})`, Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error' }); }
  catch { throw new HttpError(502, 'upstream_error', 'Сервис поиска адресов не ответил.'); }
  if (!r.ok) throw new HttpError(502, 'upstream_error', 'Сервис поиска адресов не ответил.');
  const list = await r.json().catch(() => []);
  const results = (Array.isArray(list) ? list : []).map((x) => ({ name: S(x && x.display_name, 160), lat: Number(x && x.lat), lon: Number(x && x.lon) })).filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180).slice(0, 5);
  if (geoCache.size > 300) geoCache.delete(geoCache.keys().next().value);
  geoCache.set(key, results);
  return results;
}

/* ───────────── маршруты ─────────────
   Открытые без входа (намеренный и полный список): статические файлы, GET /api/config,
   POST /api/auth/register, /login, /forgot, /reset, GET /api/auth/me. Всё остальное требует сессии. */
const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/app.css': ['app.css', 'text/css; charset=utf-8'] };
const DOC_ID = /^[A-Za-z0-9_-]{1,60}$/, BLOB_ID = /^[a-f0-9]{32}$/;
const publicUser = (u) => ({ id: u.id, email: u.email }); // наружу уходят только эти поля

async function route(req, res) {
  const url = new URL(req.url, 'http://local'), p = url.pathname, m = req.method;
  if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) throw new HttpError(421, 'wrong_host', 'Неверный адрес сервера.');

  if (m === 'GET' || m === 'HEAD') {
    const st = STATIC[p];
    if (st) {
      let buf;
      try { buf = fs.readFileSync(path.join(PUBLIC_DIR, st[0])); } catch { throw new HttpError(500, 'not_built', 'Интерфейс не собран: выполните сборку (см. README).'); }
      const etag = '"' + sha(buf).slice(0, 20) + '"';
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
      res.writeHead(200, { 'Content-Type': st[1], 'Content-Length': buf.length, ETag: etag, 'Cache-Control': 'no-cache' });
      return res.end(m === 'HEAD' ? undefined : buf);
    }
  } else if (m === 'POST' || m === 'PUT' || m === 'DELETE') {
    // Защита от подделки запросов: свой заголовок (чужая страница не может его добавить без CORS, а CORS здесь нет)
    // и точное совпадение Origin со списком своих адресов.
    if (req.headers['x-afterimage'] !== '1') throw new HttpError(403, 'forbidden', 'Запрос отклонён.');
    const origin = req.headers.origin;
    if (origin !== undefined && !ORIGINS.has(origin)) { audit('csrf.origin_rejected', { ip: clientIp(req) }); throw new HttpError(403, 'forbidden', 'Запрос отклонён.'); }
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') throw new HttpError(403, 'forbidden', 'Запрос отклонён.');
  } else throw new HttpError(405, 'method', 'Метод не поддерживается.');

  if (!p.startsWith('/api/')) throw new HttpError(404, 'not_found', 'Не найдено.');
  const ip = clientIp(req);

  /* ── без входа ── */
  if (m === 'GET' && p === '/api/config') {
    return send(res, 200, { app: 'afterimage', version: 2, ai: { enabled: !!AI_KEY, photos: !!AI_KEY && AI_PHOTOS }, geocoder: !!GEO_CONTACT, mail: MAIL_MODE,
      limits: { imageMb: LIMITS.image / 1048576, audioMb: LIMITS.audio / 1048576, quotaMb: LIMITS.bytes / 1048576 } });
  }
  if (m === 'GET' && p === '/api/auth/me') { const u = sessionOf(req); return send(res, 200, { user: u ? publicUser(u) : null }); }
  if (m === 'POST' && p === '/api/auth/register') {
    const b = await readJson(req), email = vEmail(b.email), password = vPassword(b.password, email);
    if (!allow('reg:' + ip, 10, 3600)) throw new HttpError(429, 'rate_limited', 'Слишком много попыток. Попробуйте позже.');
    const { salt, hash } = await hashPassword(password), id = crypto.randomUUID();
    // Уникальность почты обеспечивает ограничение в базе: из двух одновременных регистраций пройдёт одна.
    if (Q.addUser.run(id, email, salt, hash, 'scrypt:15:8:3', now()).changes !== 1) { audit('auth.register.duplicate', { ip, email: emailTag(email) }); throw new HttpError(409, 'email_taken', 'Аккаунт с такой почтой уже есть. Войдите или восстановите пароль.'); }
    startSession(res, id); audit('auth.register', { ip, user: id });
    return send(res, 201, { user: { id, email } });
  }
  if (m === 'POST' && p === '/api/auth/login') {
    const b = await readJson(req), email = vEmail(b.email), password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
    if (!allow('login-ip:' + ip, 40, 900) || !allow('login:' + email, 8, 900)) { audit('auth.login.throttled', { ip, email: emailTag(email) }); throw new HttpError(429, 'rate_limited', 'Слишком много попыток входа. Подождите 15 минут.'); }
    const user = Q.userByEmail.get(email);
    const ok = user ? await verifyPassword(password, user) : (await hashPassword(password, DUMMY.salt), false);
    if (!ok) { audit('auth.login.fail', { ip, email: emailTag(email) }); throw new HttpError(401, 'bad_credentials', 'Неверная почта или пароль.'); }
    Q.clearHits.run('login:' + email);
    startSession(res, user.id); audit('auth.login', { ip, user: user.id });
    return send(res, 200, { user: publicUser(user) });
  }
  if (m === 'POST' && p === '/api/auth/forgot') {
    const b = await readJson(req), email = vEmail(b.email);
    if (!allow('forgot-ip:' + ip, 10, 3600) || !allow('forgot:' + email, 3, 3600)) throw new HttpError(429, 'rate_limited', 'Слишком много запросов. Попробуйте позже.');
    const user = Q.userByEmail.get(email);
    if (user && MAIL_MODE !== 'none') {
      const token = crypto.randomBytes(32).toString('base64url');
      Q.addReset.run(sha(token), user.id, now() + 1800);
      // Адрес в ссылке берётся из настроек сервера, а не из заголовков запроса.
      sendMail(email, 'Afterimage: сброс пароля', `Чтобы задать новый пароль, откройте ссылку (она действует 30 минут и срабатывает один раз):\n${PUBLIC_ORIGIN}/#reset-${token}\n\nЕсли вы не просили о сбросе, ничего делать не нужно.`).catch((e) => audit('mail.fail', { reason: String(e && e.message).slice(0, 80) }));
    }
    audit('auth.forgot', { ip, email: emailTag(email) });
    return send(res, 200, { ok: true, mail: MAIL_MODE }); // ответ одинаков, есть такой аккаунт или нет
  }
  if (m === 'POST' && p === '/api/auth/reset') {
    const b = await readJson(req), token = typeof b.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(b.token) ? b.token : '', password = vPassword(b.password);
    if (!allow('reset-ip:' + ip, 20, 3600)) throw new HttpError(429, 'rate_limited', 'Слишком много попыток. Попробуйте позже.');
    const { salt, hash } = await hashPassword(password);
    const row = token ? Q.useReset.get(sha(token), now()) : null;
    if (!row) throw new HttpError(400, 'bad_token', 'Ссылка для сброса недействительна или уже использована. Запросите новую.');
    Q.setPassword.run(salt, hash, 'scrypt:15:8:3', row.user_id); Q.delSessions.run(row.user_id); Q.delResets.run(row.user_id);
    startSession(res, row.user_id); audit('auth.reset', { ip, user: row.user_id });
    const user = Q.userById.get(row.user_id);
    return send(res, 200, { user: publicUser(user) });
  }

  /* ── дальше только со входом ── */
  const me = sessionOf(req);
  if (!me) throw new HttpError(401, 'unauthorized', 'Нужно войти в аккаунт.');

  if (m === 'POST' && p === '/api/auth/logout') { Q.delSession.run(me.tokenHash); endCookie(res); audit('auth.logout', { user: me.id }); return send(res, 204); }
  if (m === 'POST' && p === '/api/auth/password') {
    const b = await readJson(req), next = vPassword(b.next, me.email);
    if (!allow('pw:' + me.id, 8, 900)) throw new HttpError(429, 'rate_limited', 'Слишком много попыток. Подождите 15 минут.');
    if (!(await verifyPassword(typeof b.current === 'string' ? b.current.slice(0, 200) : '', Q.userById.get(me.id)))) throw new HttpError(403, 'bad_credentials', 'Текущий пароль указан неверно.');
    const { salt, hash } = await hashPassword(next);
    Q.setPassword.run(salt, hash, 'scrypt:15:8:3', me.id); Q.delOtherSessions.run(me.id, me.tokenHash); audit('auth.password_changed', { user: me.id });
    return send(res, 204);
  }
  if (m === 'POST' && p === '/api/account/delete') {
    const b = await readJson(req);
    if (!allow('pw:' + me.id, 8, 900)) throw new HttpError(429, 'rate_limited', 'Слишком много попыток. Подождите 15 минут.');
    if (!(await verifyPassword(typeof b.password === 'string' ? b.password.slice(0, 200) : '', Q.userById.get(me.id)))) throw new HttpError(403, 'bad_credentials', 'Пароль указан неверно.');
    const files = Q.listBlobs.all(me.id);
    Q.delUser.run(me.id); // документы, файлы, сессии и ссылки сброса удаляются каскадом
    for (const f of files) fs.rm(blobPath(f.id), { force: true }, () => {});
    endCookie(res); audit('account.deleted', { user: me.id });
    return send(res, 204);
  }
  if (m === 'POST' && p === '/api/data/clear') {
    const b = await readJson(req);
    if (b.confirm !== true) throw bad('Нужно подтверждение.');
    const files = Q.listBlobs.all(me.id);
    Q.delDocs.run(me.id); Q.delBlobs.run(me.id);
    for (const f of files) fs.rm(blobPath(f.id), { force: true }, () => {});
    audit('data.cleared', { user: me.id });
    return send(res, 204);
  }

  /* документы: записи, коллекции, профиль. Владелец берётся из сессии, а не из запроса. */
  if (m === 'GET' && p === '/api/docs') {
    const docs = [];
    for (const row of Q.listDocs.all(me.id)) { try { docs.push({ id: row.id, data: JSON.parse(row.body) }); } catch { /* повреждённую строку пропускаем */ } }
    const u = Q.usage.get(me.id);
    return send(res, 200, { docs, usage: { files: u.n, bytes: u.bytes, quotaBytes: LIMITS.bytes } });
  }
  const dm = /^\/api\/docs\/([^/]+)$/.exec(p);
  if (dm) {
    const id = decodeURIComponent(dm[1]);
    if (!DOC_ID.test(id)) throw bad('Недопустимый идентификатор.');
    if (m === 'PUT') {
      const data = await readJson(req, LIMITS.doc);
      if (!['memory', 'collection', 'profile'].includes(data.kind)) throw bad('Неизвестный вид документа.');
      const body = JSON.stringify(data);
      if (Q.putDoc.run(me.id, id, body, body.length, now(), me.id, LIMITS.docs, me.id, id).changes !== 1) throw new HttpError(413, 'quota_exceeded', 'В дневнике слишком много записей.');
      return send(res, 204);
    }
    if (m === 'DELETE') { Q.delDoc.run(me.id, id); return send(res, 204); }
  }

  /* файлы */
  if (m === 'POST' && p === '/api/blobs') {
    const kind = url.searchParams.get('kind') === 'audio' ? 'audio' : 'image';
    if (!allow('upload:' + me.id, 300, 3600)) throw new HttpError(429, 'rate_limited', 'Слишком много загрузок подряд. Попробуйте позже.');
    const buf = await readBody(req, LIMITS[kind]), type = sniff(buf, kind);
    if (!type) throw new HttpError(415, 'bad_file', kind === 'audio' ? 'Этот файл не похож на аудио (mp3, m4a, wav, ogg, flac).' : 'Этот файл не похож на изображение (JPEG, PNG, WebP).');
    const id = crypto.randomBytes(16).toString('hex'); // имя файла придумывает сервер
    if (Q.addBlob.run(id, me.id, type, buf.length, now(), me.id, LIMITS.blobs, me.id, buf.length, LIMITS.bytes).changes !== 1) throw new HttpError(413, 'quota_exceeded', 'Закончилось место для файлов в этом аккаунте.');
    try { fs.writeFileSync(blobPath(id), buf, { flag: 'wx', mode: 0o600 }); } catch (e) { Q.delBlob.run(id, me.id); throw e; }
    return send(res, 201, { id, type, size: buf.length });
  }
  const bm = /^\/api\/blobs\/([a-f0-9]{32})$/.exec(p);
  if (bm && BLOB_ID.test(bm[1])) {
    const row = Q.getBlob.get(bm[1], me.id); // чужой файл неотличим от несуществующего
    if (m === 'GET') {
      if (!row) throw new HttpError(404, 'not_found', 'Файл не найден.');
      let buf;
      try { buf = fs.readFileSync(blobPath(row.id)); } catch { throw new HttpError(404, 'not_found', 'Файл не найден.'); }
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.writeHead(200, { 'Content-Type': row.type, 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Disposition': 'inline' });
      return res.end(buf);
    }
    if (m === 'DELETE') { if (row) { Q.delBlob.run(row.id, me.id); fs.rm(blobPath(row.id), { force: true }, () => {}); } return send(res, 204); }
  }

  /* ИИ: запрос собирает сервер из проверенных полей, поэтому этот адрес нельзя использовать как произвольный доступ к модели */
  const am = /^\/api\/ai\/(brief|music)$/.exec(p);
  if (m === 'POST' && am) {
    if (!AI_KEY) throw new HttpError(503, 'ai_not_configured', 'На сервере не задан ключ ИИ.');
    const b = await readJson(req, LIMITS.ai), input = vDayInput(b.input), photos = vPhotos(b.photos);
    const images = AI_PHOTOS ? (Array.isArray(b.images) ? b.images : []).slice(0, 6).filter((s) => typeof s === 'string' && s.length < 1.7e6 && /^[A-Za-z0-9+/]+=*$/.test(s) && isJpeg(Buffer.from(s.slice(0, 16), 'base64'))) : [];
    const avoid = b.avoid && typeof b.avoid === 'object' ? { name: S(b.avoid.name, 60), layout: S(b.avoid.layout, 20), display: S(b.avoid.display, 20), background: validHex(b.avoid.background) || '', accent: validHex(b.avoid.accent) || '' } : null;
    if (!allow('ai:' + me.id, AI_DAILY, 86400)) throw new HttpError(429, 'rate_limited', 'Дневной лимит обращений к ИИ исчерпан.');
    const prompt = am[1] === 'brief' ? buildBriefPrompt(input, photos, { seen: images.length, avoid, note: S(b.note, 300) }) : buildMusicPrompt(input, photos, { seen: images.length });
    const text = await askModel(prompt, images, am[1] === 'brief' ? 6000 : 1200);
    audit('ai.call', { user: me.id, kind: am[1], images: images.length }); // содержание запроса в журнал не пишется
    return send(res, 200, { text, sawPhotos: images.length > 0 });
  }
  if (m === 'GET' && p === '/api/geocode') {
    if (!GEO_CONTACT) throw new HttpError(503, 'no_geocoder', 'Поиск адресов на сервере не настроен.');
    const q = S(url.searchParams.get('q'), 120);
    if (q.length < 2) return send(res, 200, { results: [] });
    if (!allow('geo:' + me.id, 60, 3600)) throw new HttpError(429, 'rate_limited', 'Слишком много запросов к поиску адресов.');
    return send(res, 200, { results: await geocode(q), attribution: '© участники OpenStreetMap' });
  }
  throw new HttpError(404, 'not_found', 'Не найдено.');
}

const server = http.createServer((req, res) => {
  baseHeaders(res);
  route(req, res).catch((e) => {
    if (res.headersSent) { res.destroy(); return; }
    if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
    console.error(new Date().toISOString(), 'internal', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
    send(res, 500, { error: 'internal', message: 'На сервере что-то пошло не так.' }); // подробности остаются в журнале сервера
  });
});
server.headersTimeout = 20000; server.requestTimeout = 180000; server.maxHeadersCount = 60;
server.listen(PORT, HOST, () => {
  console.log(`Afterimage Diary: ${PUBLIC_ORIGIN}  (режим: ${ENV === 'dev' ? 'разработка' : 'рабочий'})`);
  console.log(`  ИИ: ${AI_KEY ? `подключён (${AI_MODEL}), фотографии ${AI_PHOTOS ? 'передаются' : 'не передаются'}` : 'ключ не задан — демо-режим'}`);
  console.log(`  поиск адресов: ${GEO_CONTACT ? 'OpenStreetMap Nominatim' : 'не настроен'};  почта: ${MAIL_MODE === 'webhook' ? 'через MAIL_WEBHOOK_URL' : MAIL_MODE === 'console' ? 'не настроена, ссылки сброса печатаются сюда' : 'не настроена, сброс пароля недоступен'}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => { try { db.close(); } catch { /* уже закрыта */ } process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); });
