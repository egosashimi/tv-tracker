'use strict';

/* =========================================================
   TV Log / Manga Log — a tiny, local-only watch & reading log.
   Two separate logs (TV shows; manga, manhwa & manhua) share one UI.
   Data lives in localStorage on this device. No accounts.
   ========================================================= */

const MODE_KEY = 'log:mode';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MAX_URL_PROMPT = 7000; // longer prompts are copied and pasted instead of sent in the URL
const DAY = 86400000;
const TVMAZE = 'https://api.tvmaze.com';
const ANILIST = 'https://graphql.anilist.co';
const KITSU = 'https://kitsu.app/api/edge/manga';
const JIKAN = 'https://api.jikan.moe/v4/manga';
const LOOKUP_VERSION = 2; // bump to retry titles an older, narrower search couldn't find

const STATUS_ORDER = ['watching', 'finished', 'paused', 'dropped', 'want'];
const KIND_LABELS = { manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua', comic: 'Comic' };

/* Everything that differs between the TV log and the manga log. */
const MODES = {
  tv: {
    key: 'tv', title: 'TV Log', menuSub: 'TV shows',
    store: 'tvlog:v1', prefsKey: 'tvlog:prefs', file: 'tv-log',
    noun: 'show', nouns: 'shows', item: 'Show',
    verbPast: 'watched', verbing: 'Watching', dateLabel: 'Watched',
    listName: 'Watchlist', wantLabel: 'Want to watch', toWhat: 'to watch',
    progressLabel: 'Seasons', progressPh: 'e.g. S1–S3, or all of it', progressWord: 'seasons',
    namePh: 'e.g. Severance',
    profilePh: 'e.g. Anime, or Watching with Sam',
    moodPh: 'e.g. short comedies, something like Dark',
    recsPh: '1. Dark (2017) — Because you loved Severance…',
    emptyText: 'Tap + to add a show, or bring in a list you already have: JSON, a CSV (IMDb works), or one show per line.',
    emptyLog: 'No watched shows yet. Tap <strong>+</strong> to log one.',
    emptyList: 'Nothing on your watchlist yet. Ask ChatGPT or Claude for ideas, then paste the reply here. You can also tap <strong>+</strong>.',
    importHelp: 'Paste or pick a file. You can use JSON, a CSV with a header row (IMDb ratings exports work), a list you sent to Notes, or one show per line. Only the name is required.',
    importEx: '[\n  { "name": "Severance", "rating": 9, "date": "2024-03" },\n  { "name": "The Wire", "rating": 10, "date": "2015" },\n  { "name": "Riverdale", "rating": 3, "status": "dropped" }\n]',
    coversTitle: 'Posters', coverWord: 'poster', coversToggle: 'Show posters & name suggestions',
    coversHelp: 'Looks up show names on TVmaze. Only the show name you look up is sent; your log stays on this device.',
    lookupName: 'TVmaze', lookupDelay: 600, // TVmaze allows ~20 requests per 10 seconds
    askBack: 'Got an answer back? Copy the reply, then add the picks to your watchlist.',
    statsYear: 'Shows by year watched',
    hints: {
      finished: 'Watched all of it, or everything that’s out so far.',
      watching: 'Currently in progress.',
      paused: 'Stopped for now, not because you disliked it. You plan to come back.',
      dropped: 'Tried it and didn’t like it. Recommendations will steer away from shows like this.',
      want: 'On your watchlist. It won’t be recommended to you again.',
    },
    prompt: {
      intro: 'I keep a log of the TV shows I’ve watched. Ratings are my own, out of 10 (10 = loved it).',
      current: 'Currently watching',
      list: 'Already on my watchlist (don’t recommend these)',
      ask: (n) => `Based on my taste, recommend ${n} TV shows I haven’t seen yet. Lean toward what I rated highly, steer away from what I rated low or dropped, and weigh my recent viewing a bit more. Include a couple of lesser-known picks. Don’t recommend anything listed above.`,
      format: '1. Title (Year) — one sentence on why I’d like it, referencing shows from my list',
    },
  },
  manga: {
    key: 'manga', title: 'Manga Log', menuSub: 'Manga, manhwa & manhua',
    store: 'mangalog:v1', prefsKey: 'mangalog:prefs', file: 'manga-log',
    noun: 'title', nouns: 'titles', item: 'Title',
    verbPast: 'read', verbing: 'Reading', dateLabel: 'Read',
    listName: 'Reading list', wantLabel: 'Want to read', toWhat: 'to read',
    progressLabel: 'Progress', progressPh: 'e.g. Ch. 120, or Vol. 1–10', progressWord: 'progress',
    namePh: 'e.g. Solo Leveling',
    profilePh: 'e.g. Manhwa',
    moodPh: 'e.g. short and funny, something like Vinland Saga',
    recsPh: '1. Vinland Saga (2005, Manga) — Because you loved Berserk…',
    emptyText: 'Tap + to add a manga, manhwa or manhua, or bring in a list you already have: JSON, a CSV, a MyAnimeList export, or one title per line.',
    emptyLog: 'Nothing read yet. Tap <strong>+</strong> to log something.',
    emptyList: 'Nothing on your reading list yet. Ask ChatGPT or Claude for ideas, then paste the reply here. You can also tap <strong>+</strong>.',
    importHelp: 'Paste or pick a file. You can use JSON, a CSV with a header row, a MyAnimeList export (.xml), a list you sent to Notes, or one title per line. Only the name is required.',
    importEx: '[\n  { "name": "Solo Leveling", "type": "manhwa", "rating": 9, "date": "2023" },\n  { "name": "Berserk", "type": "manga", "rating": 10, "progress": "Vol. 41" },\n  { "name": "Tales of Demons and Gods", "type": "manhua", "status": "dropped" }\n]',
    coversTitle: 'Covers', coverWord: 'cover', coversToggle: 'Show covers & name suggestions',
    coversHelp: 'Searches AniList, Kitsu and MyAnimeList together, so manhwa, manhua, webcomics and alternate or fan-translated titles turn up. Only the title you look up is sent; your log stays on this device.',
    lookupName: 'AniList, Kitsu or MyAnimeList', lookupDelay: 2100, // AniList allows ~30 requests per minute
    askBack: 'Got an answer back? Copy the reply, then add the picks to your reading list.',
    statsYear: 'Titles by year read',
    hints: {
      finished: 'Read all of it, or everything that’s out so far.',
      watching: 'Currently reading.',
      paused: 'Stopped for now, not because you disliked it. You plan to come back.',
      dropped: 'Tried it and didn’t like it. Recommendations will steer away from titles like this.',
      want: 'On your reading list. It won’t be recommended to you again.',
    },
    prompt: {
      intro: 'I keep a log of the manga, manhwa and manhua I’ve read. Ratings are my own, out of 10 (10 = loved it).',
      current: 'Currently reading',
      list: 'Already on my reading list (don’t recommend these)',
      ask: (n) => `Based on my taste, recommend ${n} manga, manhwa or manhua I haven’t read yet. Lean toward what I rated highly, steer away from what I rated low or dropped, and weigh my recent reading a bit more. Include a couple of lesser-known picks. Don’t recommend anything listed above.`,
      format: '1. Title (Year, Manga/Manhwa/Manhua/Comic) — one sentence on why I’d like it, referencing titles from my list',
    },
  },
};

function loadMode() {
  try { const m = localStorage.getItem(MODE_KEY); if (MODES[m]) return m; } catch (_) { /* ignore */ }
  return 'tv';
}

let M = MODES[loadMode()];

const statusLabel = (st) => ({ finished: 'Finished', watching: M.verbing, paused: 'Paused', dropped: 'Dropped', want: M.wantLabel }[st]);
const countNoun = (n) => `${n} ${n === 1 ? M.noun : M.nouns}`;

/* ---------------- Profiles ----------------
   Each log can hold several profiles (e.g. "Manhwa" and "Manga"), each with its own list,
   settings and backups. The first profile ("default") keeps the original storage keys,
   so data from before profiles existed carries straight over. */

const profilesKeyOf = (mode) => `${mode.key}:profiles`;
const activeKeyOf = (mode) => `${mode.key}:profile`;

function loadProfiles(mode = M) {
  let list = null;
  try { list = JSON.parse(localStorage.getItem(profilesKeyOf(mode))); } catch (_) { /* ignore */ }
  list = Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string') : [];
  return list.length ? list : [{ id: 'default', name: 'Profile 1' }];
}

function activeProfileOf(mode, list = loadProfiles(mode)) {
  let id = null;
  try { id = localStorage.getItem(activeKeyOf(mode)); } catch (_) { /* ignore */ }
  return list.find((x) => x.id === id) || list[0];
}

let profiles = loadProfiles();
let P = activeProfileOf(M, profiles);
let switchGen = 0; // bumps whenever the visible log or profile changes

const dataKey = (mode = M, prof = P) => (prof.id === 'default' ? mode.store : `${mode.store}:${prof.id}`);
const prefsKeyFor = (mode = M, prof = P) => (prof.id === 'default' ? mode.prefsKey : `${mode.prefsKey}:${prof.id}`);
const multiProfile = () => profiles.length > 1;
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function saveProfiles() {
  try {
    localStorage.setItem(profilesKeyOf(M), JSON.stringify(profiles));
    localStorage.setItem(activeKeyOf(M), P.id);
  } catch (_) { /* ignore */ }
}

function readList(mode, prof) {
  try {
    const d = JSON.parse(localStorage.getItem(dataKey(mode, prof)));
    return d && Array.isArray(d.shows) ? d.shows : [];
  } catch (_) { return []; }
}

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Storage ---------------- */

function migrate(s) {
  return {
    rating: null, date: null, seasons: '', note: '', tv: null, kind: null,
    ...s,
    status: STATUS_ORDER.includes(s.status) ? s.status : 'finished',
  };
}

function loadShows() {
  try {
    const data = JSON.parse(localStorage.getItem(dataKey()));
    if (data && Array.isArray(data.shows)) return data.shows.map(migrate);
  } catch (_) { /* ignore */ }
  return [];
}

function saveShows() {
  try {
    localStorage.setItem(dataKey(), JSON.stringify({ version: 2, shows }));
  } catch (_) {
    toast('Couldn’t save. Storage is full or blocked.');
  }
  // Ask the browser not to evict our data.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

const DEFAULT_PREFS = { sort: 'recent', dateMode: 'day', tab: 'log', count: 10, posters: true, ratingFilter: false, lastBackup: 0, firstUse: 0, snoozeUntil: 0 };

function loadPrefs() {
  let p;
  try { p = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(prefsKeyFor())) }; }
  catch (_) { p = { ...DEFAULT_PREFS }; }
  if (!p.firstUse) p.firstUse = Date.now();
  return p;
}

function savePrefs() {
  try { localStorage.setItem(prefsKeyFor(), JSON.stringify(prefs)); } catch (_) { /* ignore */ }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let shows = loadShows();
let prefs = loadPrefs();
savePrefs();
let query = '';

/* ---------------- Dates ----------------
   A "watched" value is stored as a string:
     "2024-03-15"            exact day
     "2024-03"               month
     "2024"                  year
     "2019/2021"             range (ISO-8601 interval style); ends can be any of the above
     null                    unknown
*/

function validPoint(y, m, d) {
  y = +y;
  if (!(y >= 1900 && y <= 2100)) return null;
  if (m == null) return String(y);
  m = +m;
  if (!(m >= 1 && m <= 12)) return null;
  const mm = String(m).padStart(2, '0');
  if (d == null) return `${y}-${mm}`;
  d = +d;
  const days = new Date(y, m, 0).getDate();
  if (!(d >= 1 && d <= days)) return null;
  return `${y}-${mm}-${String(d).padStart(2, '0')}`;
}

function monthIndex(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  return MONTH_NAMES.findIndex((n) => n.startsWith(w) || (w === 'sept' && n === 'september'));
}

/** Parse a single point in time. Returns "YYYY" | "YYYY-MM" | "YYYY-MM-DD" | null */
function parsePoint(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isInteger(input) ? validPoint(input) : null;
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase()
    .replace(/^(~|circa|ca\.?|c\.|around|about|approx\.?|approximately)\s*/, '')
    .replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  if ((m = s.match(/^(\d{4})$/))) return validPoint(m[1]);
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})$/))) return validPoint(m[1], m[2]);
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t ].*)?$/))) return validPoint(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return validPoint(m[2], m[1]);
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) {
    // Assume M/D/YYYY unless the first number can't be a month.
    const a = +m[1], b = +m[2];
    return a > 12 ? validPoint(m[3], b, a) : validPoint(m[3], a, b);
  }
  if ((m = s.match(/^([a-z]+\.?) (\d{4})$/))) {
    const i = monthIndex(m[1]);
    return i >= 0 ? validPoint(m[2], i + 1) : null;
  }
  if ((m = s.match(/^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/))) {
    const i = monthIndex(m[1]);
    return i >= 0 ? validPoint(m[3], i + 1, m[2]) : null;
  }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+\.?) (\d{4})$/))) {
    const i = monthIndex(m[2]);
    return i >= 0 ? validPoint(m[3], i + 1, m[1]) : null;
  }
  return null;
}

function makeRange(a, b) {
  if (!a && !b) return null;
  if (!a || !b) return a || b;
  if (a > b) [a, b] = [b, a];
  return a === b ? a : `${a}/${b}`;
}

const rangeStart = (v) => (v && v.includes('/') ? v.split('/')[0] : v);
const rangeEnd = (v) => (v && v.includes('/') ? v.split('/')[1] : v);

const SEASONS = { spring: [3, 5], summer: [6, 8], fall: [9, 11], autumn: [9, 11] };

/**
 * Parse anything that might describe when a show was watched.
 * Returns { value: string|null, ok: boolean } — ok=false means "had something but couldn't read it".
 */
function parseWatched(input) {
  if (input == null || input === '' || typeof input === 'boolean') return { value: null, ok: true };
  if (typeof input === 'number') {
    const v = parsePoint(input);
    return { value: v, ok: !!v };
  }
  if (Array.isArray(input)) {
    const a = parseWatched(input[0]).value, b = parseWatched(input[input.length - 1]).value;
    return { value: makeRange(rangeStart(a), rangeEnd(b)), ok: !!(a || b) };
  }
  if (typeof input === 'object') {
    const f = pick(input, ['from', 'start', 'startdate', 'startyear', 'begin', 'started']);
    const t = pick(input, ['to', 'end', 'enddate', 'endyear', 'until', 'finished', 'ended']);
    const a = parseWatched(f).value, b = parseWatched(t).value;
    return { value: makeRange(rangeStart(a), rangeEnd(b)), ok: !!(a || b) };
  }

  const raw = String(input).trim();
  const s = raw.toLowerCase();
  if (/^(unknown|n\/?a|none|null|-|—|\?+|not sure|idk|0{4}-0{2}-0{2})$/.test(s)) return { value: null, ok: true };

  const point = parsePoint(raw);
  if (point) return { value: point, ok: true };

  let m;
  // Decades: "2010s", "the 90s", "'90s"
  if ((m = s.match(/^(?:the )?(\d{3})0'?s$/))) {
    const y = +(m[1] + '0');
    return { value: makeRange(validPoint(y), validPoint(y + 9)), ok: true };
  }
  if ((m = s.match(/^(?:the )?'?(\d)0'?s$/))) {
    const y = (+m[1] >= 3 ? 1900 : 2000) + +m[1] * 10;
    return { value: makeRange(validPoint(y), validPoint(Math.min(y + 9, 2100))), ok: true };
  }
  // Seasons: "summer 2023"
  if ((m = s.match(/^(spring|summer|fall|autumn|winter) (\d{4})$/))) {
    const y = +m[2];
    if (m[1] === 'winter') return { value: makeRange(validPoint(y, 1), validPoint(y, 2)), ok: true };
    const [a, b] = SEASONS[m[1]];
    return { value: makeRange(validPoint(y, a), validPoint(y, b)), ok: true };
  }
  // "early/mid/late 2020"
  if ((m = s.match(/^(early|mid|late) (\d{4})$/))) {
    const y = +m[2];
    const span = { early: [1, 4], mid: [5, 8], late: [9, 12] }[m[1]];
    return { value: makeRange(validPoint(y, span[0]), validPoint(y, span[1])), ok: true };
  }
  // Month range within a year: "Jun – Aug 2023"
  if ((m = s.match(/^([a-z]{3,}\.?)\s*(?:–|—|-|to)\s*([a-z]{3,}\.?) (\d{4})$/))) {
    const a = monthIndex(m[1]), b = monthIndex(m[2]);
    if (a >= 0 && b >= 0) return { value: makeRange(validPoint(m[3], a + 1), validPoint(m[3], b + 1)), ok: true };
  }
  // Explicit range separators
  const parts = raw.split(/\s*(?:–|—|\bto\b|\.\.+|\buntil\b|\bthrough\b|\bthru\b|\s-\s|\/)\s*/i).filter(Boolean);
  if (parts.length === 2) {
    const a = parseWatched(parts[0]).value, b = parseWatched(parts[1]).value;
    if (a && b) return { value: makeRange(rangeStart(a), rangeEnd(b)), ok: true };
  }
  // Hyphen-joined: "2019-2021", "2021-03-2022-05"
  if ((m = raw.match(/^(\d{4}(?:-\d{1,2}){0,2})-(\d{4}(?:-\d{1,2}){0,2})$/))) {
    const a = parsePoint(m[1]), b = parsePoint(m[2]);
    if (a && b) return { value: makeRange(a, b), ok: true };
  }
  return { value: null, ok: false };
}

function fmtPoint(p) {
  const [y, m, d] = p.split('-');
  if (d) return `${MONTHS[+m - 1]} ${+d}, ${y}`;
  if (m) return `${MONTHS[+m - 1]} ${y}`;
  return y;
}

function fmtWatched(v) {
  if (!v) return '';
  if (!v.includes('/')) return fmtPoint(v);
  const [a, b] = v.split('/');
  if (/^\d{3}0$/.test(a) && b === String(+a + 9)) return `${a}s`;
  // Same-year month range: "Jun – Aug 2023"
  if (a.length === 7 && b.length === 7 && a.slice(0, 4) === b.slice(0, 4)) {
    return `${MONTHS[+a.slice(5) - 1]} – ${MONTHS[+b.slice(5) - 1]} ${a.slice(0, 4)}`;
  }
  return `${fmtPoint(a)} – ${fmtPoint(b)}`;
}

const endPoint = (v) => rangeEnd(v) || '';
const yearOf = (v) => endPoint(v).slice(0, 4);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------- Ratings & status ---------------- */

function parseRating(v, scale) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  let n, outOf = scale ? +scale : 10;
  if (typeof v === 'number') n = v;
  else {
    const s = String(v).trim();
    const stars = (s.match(/★/g) || []).length;
    if (stars) { n = stars + (s.includes('½') ? 0.5 : 0); outOf = 5; }
    else {
      const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:\/|out of|of)?\s*(\d+(?:\.\d+)?)?/i);
      if (!m) return null;
      n = parseFloat(m[1].replace(',', '.'));
      if (m[2]) outOf = parseFloat(m[2]);
      else if (s.includes('%')) outOf = 100;
    }
  }
  if (!isFinite(n) || !(outOf > 0)) return null;
  n = (n / outOf) * 10;
  return Math.round(Math.min(10, Math.max(0, n)) * 2) / 2;
}

const fmtRating = (r) => (Number.isInteger(r) ? String(r) : r.toFixed(1));

function parseKind(v) {
  if (v == null || v === '') return null;
  const s = normKey(v);
  if (/manhwa|webtoon|korea|^kr$|^ko$/.test(s)) return 'manhwa';
  if (/manhua|chin|taiwan|^cn$|^tw$|^hk$|^zh/.test(s)) return 'manhua';
  if (/manga|japan|^jp$|^ja$|oneshot|doujin/.test(s)) return 'manga';
  if (/comic|oel|western|^us$|^gb$|^uk$|^ca$|^fr$|^au$/.test(s)) return 'comic';
  return null;
}

function parseStatus(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'finished' : null;
  const s = normKey(v);
  if (!s) return null;
  if (/drop|abandon|quit|gaveup|dnf|didntfinish|disliked|stoppedwatching/.test(s)) return 'dropped';
  if (/want|plan|watchlist|towatch|backlog|queue|wish|later|notstarted|notyet|unwatched|notwatched|toread|unread|readinglist/.test(s)) return 'want';
  if (/pause|hold|hiatus|break|waiting|stopped/.test(s)) return 'paused';
  if (/watching|reading|progress|current|ongoing|started|airing/.test(s)) return 'watching';
  if (/finish|complet|watched|done|seen|caughtup|ended|read/.test(s)) return 'finished';
  return null;
}

/* ---------------- Import ---------------- */

const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(obj, keys) {
  const map = {};
  for (const k of Object.keys(obj)) map[normKey(k)] = obj[k];
  for (const k of keys) if (map[k] !== undefined && map[k] !== null && map[k] !== '') return map[k];
  return undefined;
}

const NAME_KEYS = ['name', 'title', 'mangatitle', 'seriestitle', 'show', 'showname', 'showtitle', 'series', 'seriesname', 'tvshow', 'tvshowname', 'program', 'programme'];
const RATING_KEYS = ['rating', 'yourrating', 'myrating', 'score', 'myscore', 'stars', 'rate', 'grade'];
const DATE_KEYS = ['date', 'watched', 'watcheddate', 'datewatched', 'watchedon', 'when', 'period', 'dates', 'watchdate', 'finished', 'finishedon', 'completed', 'lastwatchedat', 'watchedat', 'seenat', 'daterated', 'ratedat', 'time', 'yearwatched', 'year', 'updatedat'];
const STATUS_KEYS = ['status', 'state', 'watchstatus', 'mystatus', 'liststatus'];

function extractJSON(text) {
  const t = text.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const attempts = [t];
  const s = t.search(/[[{]/), e = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (s >= 0 && e > s) attempts.push(t.slice(s, e + 1));
  // Fix iOS "smart" quotes and trailing commas.
  for (const a of [...attempts]) attempts.push(a.replace(/[“”„″]/g, '"').replace(/,\s*([\]}])/g, '$1'));
  for (const a of attempts) {
    try {
      const data = JSON.parse(a);
      if (data && typeof data === 'object') return { data };
    } catch (_) { /* try next */ }
  }
  return { error: 'That doesn’t look like valid JSON yet.', looksJSON: /^[[{]/.test(t) };
}

function toItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      if (Array.isArray(data[k]) && ['shows', 'tvshows', 'tv', 'items', 'data', 'entries', 'list', 'log', 'series', 'watched'].includes(normKey(k))) return data[k];
    }
    if (pick(data, NAME_KEYS)) return [data];
    // { "Show name": 9, ... }
    return Object.entries(data).map(([name, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? { name, ...v } : { name, rating: v }));
  }
  return null;
}

/** Minimal RFC-4180 CSV parser. */
function parseCSV(text, delim) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function parseTable(text) {
  const t = text.trim().replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0];
  const delims = [',', '\t', ';'].filter((d) => first.includes(d));
  if (!delims.length) return null;
  const delim = delims.sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = parseCSV(t, delim);
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.trim());
  const keys = header.map(normKey);
  if (!keys.some((k) => NAME_KEYS.includes(k))) return null;
  // IMDb's "Year" is the release year, not when you watched it.
  const isImdb = keys.includes('const') || keys.includes('yourrating');
  const objs = rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => {
      if (isImdb && ['year', 'releasedate'].includes(keys[i])) return;
      o[h] = (r[i] ?? '').trim();
    });
    return o;
  });
  return { rows: objs, episodic: keys.some((k) => /episode/.test(k)) };
}

const BULLET = /^(?:[-*•◦▪‣]|\d{1,3}[.)])\s+/;
const HEADINGS = {
  watching: 'watching', 'currently watching': 'watching', 'in progress': 'watching',
  reading: 'watching', 'currently reading': 'watching', read: 'finished',
  finished: 'finished', completed: 'finished', watched: 'finished',
  paused: 'paused', 'on hold': 'paused', hiatus: 'paused',
  dropped: 'dropped', abandoned: 'dropped',
  'want to watch': 'want', watchlist: 'want', 'plan to watch': 'want', 'to watch': 'want',
  'want to read': 'want', 'plan to read': 'want', 'to read': 'want', 'reading list': 'want',
};

function statusHeading(line) {
  const k = line.replace(/[:#*_]/g, '').replace(/\(\d+\)\s*$/, '').trim().toLowerCase();
  return HEADINGS[k] || null;
}

/** Recognise one " · "-separated piece of a text line. Returns true if understood. */
function readPart(p, o) {
  p = p.trim();
  if (!p) return true;
  if (/^not rated$/i.test(p)) { o.rating = null; return true; }
  if (/^★/.test(p) || (/^\d+(?:[.,]\d+)?\s*(?:\/\s*\d+|%)?$/.test(p) && !/^\d{4}$/.test(p))) { o.rating = p; return true; }
  if (/^[“"].*[”"]$/.test(p)) { o.note = p.slice(1, -1); return true; }
  if (/^s\d|\bseasons?\b|\beps?\b|\bepisodes?\b/i.test(p)) { o.seasons = p; return true; }
  if (/^(manga|manhwa|manhua|comic)$/i.test(p)) { o.type = p.toLowerCase(); return true; }
  const st = statusHeading(p);
  if (st) { o.status = st; return true; }
  const d = parseWatched(p);
  if (d.ok && d.value) { o.date = p; return true; }
  return false;
}

function parseTextLine(body, status) {
  const o = { name: body, status };
  const m = body.match(/^(.+?)(?:\s+[—–-]\s+|:\s+|\s+\|\s+)(.+)$/);
  if (m) {
    const trial = { name: m[1], status };
    let understood = 0;
    const leftover = [];
    for (const part of m[2].split(/\s+[·|]\s+/)) {
      if (readPart(part, trial)) { understood++; continue; }
      // "9/10 - 2019" style: try splitting further on dashes.
      const sub = part.split(/\s+[—–-]\s+/);
      if (sub.length > 1 && sub.every((x) => readPart(x, trial))) understood++;
      else leftover.push(part.trim());
    }
    // Free-form bits next to a rating/date (e.g. "All 6") are most likely seasons.
    if (understood && leftover.length && !trial.seasons) trial.seasons = leftover.join(' · ');
    if (understood) Object.assign(o, trial);
  }
  // "Name (2024)" on a watchlist line → release year.
  const y = o.name.match(/^(.+?)\s*\((\d{4})\)$/);
  if (y && o.status === 'want') { o.name = y[1]; o.showyear = y[2]; }
  return o;
}

function parseTextList(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasBullets = lines.some((l) => BULLET.test(l));
  let status = null;
  const out = [];
  for (const line of lines) {
    const head = statusHeading(line);
    if (head) { status = head; continue; }
    if (hasBullets && !BULLET.test(line)) continue;
    const body = line.replace(BULLET, '').trim();
    if (body) out.push(parseTextLine(body, status));
  }
  return out;
}

/** Seasons (TV) or chapters/volumes (manga) under any of the usual names. */
const PROGRESS_KEYS = [
  ['seasons', 'S'], ['season', 'S'], ['seasonswatched', 'S'], ['progress', ''],
  ['chapters', 'Ch. '], ['chapter', 'Ch. '], ['chaptersread', 'Ch. '], ['myreadchapters', 'Ch. '],
  ['volumes', 'Vol. '], ['volume', 'Vol. '], ['myreadvolumes', 'Vol. '],
  ['episodes', 'Ep. '], ['mywatchedepisodes', 'Ep. '],
];

function readProgress(o) {
  for (const [k, prefix] of PROGRESS_KEYS) {
    const v = pick(o, [k]);
    if (v == null || typeof v === 'object') continue;
    if (/^\d+$/.test(String(v).trim())) {
      const n = +v;
      if (!n) continue;
      return (prefix || (M.key === 'manga' ? 'Ch. ' : 'S')) + n;
    }
    return String(v).trim();
  }
  return '';
}

/** MyAnimeList-style XML exports. */
function parseXML(text) {
  if (!/^\s*</.test(text) || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(text.trim(), 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  const nodes = [...doc.querySelectorAll('manga, anime')];
  if (!nodes.length) return null;
  return nodes.map((n) => Object.fromEntries([...n.children].map((c) => [c.tagName, c.textContent.trim()])));
}

function normalizeItem(o) {
  if (typeof o === 'string') o = { name: o };
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;

  const type = pick(o, ['titletype', 'type', 'mediatype', 'kind', 'format', 'seriestype', 'mangatype']);
  let kind = null;
  if (typeof type === 'string') {
    const t = normKey(type);
    if (M.key === 'manga') {
      if (/novel|anime|movie|film|^tv|ova|ona|music/.test(t)) return { skipType: true };
      kind = parseKind(type);
    } else if (/movie|film|episode|season|short|video|game|podcast|person/.test(t) && !/series|show/.test(t)) return { skipType: true };
  }
  if (M.key === 'manga' && !kind) kind = parseKind(pick(o, ['origin', 'countryoforigin', 'country']));

  let name = pick(o, NAME_KEYS);
  let tv = null;
  if (name && typeof name === 'object') { // e.g. Trakt: { show: { title, year } }
    const y = pick(name, ['year']);
    if (y) tv = { year: +y };
    name = pick(name, ['title', 'name']);
  }
  if (name == null || typeof name === 'object' || !String(name).trim()) return null;

  let rating = parseRating(pick(o, RATING_KEYS), pick(o, ['scale', 'outof', 'max', 'maxrating']));
  if (rating === 0 && pick(o, ['myscore']) !== undefined) rating = null; // MyAnimeList uses 0 for "not rated"
  let when = pick(o, DATE_KEYS);
  const from = pick(o, ['from', 'start', 'startdate', 'startyear', 'started', 'startedon', 'mystartdate']);
  const to = pick(o, ['to', 'end', 'enddate', 'endyear', 'ended', 'until', 'myfinishdate']);
  if (when === undefined && (from !== undefined || to !== undefined)) when = { from, to };
  const parsed = parseWatched(when);

  const status = parseStatus(pick(o, STATUS_KEYS));
  const seasons = readProgress(o);
  const note = pick(o, ['note', 'notes', 'comment', 'comments', 'mycomments', 'review', 'thoughts', 'why', 'reason']);

  const tvId = pick(o, ['tvmazeid', 'tvmaze', 'anilistid', 'anilist', 'kitsuid', 'malid']);
  const tvSrc = pick(o, ['kitsuid']) ? 'kitsu' : pick(o, ['malid']) ? 'mal' : pick(o, ['anilistid', 'anilist']) ? 'anilist' : undefined;
  const poster = pick(o, ['poster', 'posterurl', 'image', 'cover', 'coverurl', 'coverimage']);
  const showYear = pick(o, ['showyear', 'premiered', 'firstaired', 'releaseyear']);
  if (tvId || typeof poster === 'string' || showYear) {
    tv = { ...(tv || {}) };
    if (+tvId) { tv.id = +tvId; if (tvSrc) tv.src = tvSrc; }
    if (typeof poster === 'string' && /^https:\/\//.test(poster)) tv.poster = poster;
    if (showYear && parseInt(showYear, 10)) tv.year = parseInt(showYear, 10);
  }

  return {
    item: {
      name: String(name).trim().replace(/\s+/g, ' '),
      status: status || 'finished',
      kind,
      rating: status === 'want' ? null : rating,
      date: parsed.value,
      seasons: typeof seasons === 'string' ? seasons.trim() : '',
      note: typeof note === 'string' ? note.trim().slice(0, 500) : '',
      tv,
      _sg: !!status,
    },
    badDate: !parsed.ok,
  };
}

/** Episode-level exports (e.g. TV Time) → one entry per show spanning first–last watch. */
function collapseEpisodes(items) {
  const map = new Map();
  for (const it of items) {
    const k = nameKey(it.name);
    const ex = map.get(k);
    if (!ex) { map.set(k, { ...it, _pts: it.date ? [rangeStart(it.date), rangeEnd(it.date)] : [] }); continue; }
    if (it.rating != null) ex.rating = it.rating;
    if (it.date) ex._pts.push(rangeStart(it.date), rangeEnd(it.date));
  }
  return [...map.values()].map(({ _pts, ...it }) => {
    if (_pts.length) {
      const months = _pts.map((p) => p.slice(0, 7)).sort();
      it.date = makeRange(months[0], months[months.length - 1]);
    }
    return it;
  });
}

function parseImport(text) {
  if (!text.trim()) return { empty: true };
  let raw, collapse = false;
  const xml = parseXML(text);
  const json = xml ? {} : extractJSON(text);
  if (xml) raw = xml;
  else if (json.data !== undefined) {
    raw = toItems(json.data);
    if (!raw) return { error: 'Couldn’t find a list of shows in that JSON.' };
  } else if (json.looksJSON) {
    return { error: json.error };
  } else {
    const table = parseTable(text);
    if (table) { raw = table.rows; collapse = table.episodic; }
    else raw = parseTextList(text);
    if (!raw.length) return { error: 'Couldn’t read that. Paste JSON, a CSV with a header row, or one show per line.' };
  }
  let items = [];
  let skipped = 0, nonTv = 0, badDates = 0;
  for (const r of raw) {
    const n = normalizeItem(r);
    if (!n) { skipped++; continue; }
    if (n.skipType) { nonTv++; continue; }
    if (n.badDate) badDates++;
    items.push(n.item);
  }
  if (collapse) items = collapseEpisodes(items);
  return { items, skipped, nonTv, badDates };
}

const nameKey = (n) => n.toLowerCase().replace(/\s+/g, ' ').trim();

function mergeImport(items, replace) {
  const now = Date.now();
  const clean = ({ _sg, ...it }) => it;
  if (replace) {
    shows = items.map((it, i) => migrate({ id: uid(), ...clean(it), added: now + i }));
    return { added: items.length, updated: 0, same: 0 };
  }
  let added = 0, updated = 0, same = 0;
  items.forEach((it, i) => {
    const nk = nameKey(it.name);
    let ex = shows.find((s) => nameKey(s.name) === nk && (s.date || null) === (it.date || null));
    if (!ex) {
      const sameName = shows.filter((s) => nameKey(s.name) === nk);
      if (sameName.length === 1 && (!it.date || !sameName[0].date)) ex = sameName[0];
    }
    if (ex) {
      let changed = false;
      const set = (k, v) => { if (v !== ex[k]) { ex[k] = v; changed = true; } };
      if (it.rating != null) set('rating', it.rating);
      if (it.date && !ex.date) set('date', it.date);
      if (it._sg) set('status', it.status);
      if (it.seasons) set('seasons', it.seasons);
      if (it.note) set('note', it.note);
      if (it.kind && !ex.kind) set('kind', it.kind);
      if (it.tv && !(ex.tv && ex.tv.id)) { ex.tv = { ...(ex.tv || {}), ...it.tv }; changed = true; }
      changed ? updated++ : same++;
    } else {
      shows.push(migrate({ id: uid(), ...clean(it), added: now + i }));
      added++;
    }
  });
  return { added, updated, same };
}

function exportData() {
  return sorted(shows, 'recent').map((s) => {
    const manga = M.key === 'manga';
    const o = { name: s.name };
    if (manga) o.type = s.kind || null;
    Object.assign(o, { status: manga && s.status === 'watching' ? 'reading' : s.status, rating: s.rating ?? null, date: s.date ?? null });
    if (s.seasons) o[manga ? 'progress' : 'seasons'] = s.seasons;
    if (s.note) o.note = s.note;
    if (s.tv && s.tv.id) o[manga ? `${s.tv.src === 'kitsu' ? 'kitsu' : s.tv.src === 'mal' ? 'mal' : 'anilist'}Id` : 'tvmazeId'] = s.tv.id;
    if (s.tv && s.tv.poster) o[manga ? 'cover' : 'poster'] = s.tv.poster;
    if (s.tv && s.tv.year) o[manga ? 'releaseYear' : 'showYear'] = s.tv.year;
    return o;
  });
}

/* ---------------- Prompts & text export ---------------- */

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();

function promptLine(s) {
  const bits = [];
  if (s.status !== 'want') bits.push(s.rating != null ? `${fmtRating(s.rating)}/10` : 'not rated');
  const w = fmtWatched(s.date);
  if (w) bits.push(`${M.verbPast} ${w}`);
  if (s.seasons) bits.push(`${M.progressWord}: ${s.seasons}`);
  let line = `- ${s.name}`;
  const paren = [s.status === 'want' && s.tv && s.tv.year, M.key === 'manga' && KIND_LABELS[s.kind]].filter(Boolean);
  if (paren.length) line += ` (${paren.join(', ')})`;
  if (bits.length) line += ` — ${bits.join(', ')}`;
  if (s.note) line += `. My note: "${oneLine(s.note)}"`;
  return line;
}

function buildPrompt({ count = 10, mood = '' } = {}) {
  const sections = [
    ['finished', 'Finished'],
    ['watching', M.prompt.current],
    ['paused', 'Paused (I stopped for now, but NOT because I disliked it. I plan to go back)'],
    ['dropped', 'Dropped (I tried these and quit because I didn’t like them. Treat them as dislikes)'],
    ['want', M.prompt.list],
  ];
  const out = [M.prompt.intro, ''];
  for (const [st, title] of sections) {
    const list = sorted(shows.filter((s) => s.status === st), st === 'want' ? 'recent' : 'rating');
    if (list.length) out.push(`${title}:`, ...list.map(promptLine), '');
  }
  if (mood.trim()) out.push(`Right now I’m in the mood for: ${oneLine(mood)}`, '');
  out.push(
    M.prompt.ask(count),
    '',
    'Format each recommendation on its own line, exactly like this:',
    M.prompt.format,
  );
  return out.join('\n');
}

function buildNotesText() {
  const logged = shows.filter((s) => s.status !== 'want').length;
  const want = shows.length - logged;
  const lines = [multiProfile() ? `${M.title} — ${P.name}` : M.title, `Exported ${fmtPoint(todayISO())} · ${countNoun(logged)}${want ? ` · ${want} on ${M.listName.toLowerCase()}` : ''}`];
  for (const st of STATUS_ORDER) {
    const list = sorted(shows.filter((s) => s.status === st), 'recent');
    if (!list.length) continue;
    lines.push('', statusLabel(st));
    for (const s of list) {
      const bits = [];
      if (st !== 'want') bits.push(s.rating != null ? `${fmtRating(s.rating)}/10` : 'not rated');
      if (M.key === 'manga' && s.kind) bits.push(KIND_LABELS[s.kind]);
      const w = fmtWatched(s.date);
      if (w) bits.push(w);
      if (s.seasons) bits.push(s.seasons);
      if (s.note) bits.push(`“${oneLine(s.note)}”`);
      const name = st === 'want' && s.tv && s.tv.year ? `${s.name} (${s.tv.year})` : s.name;
      lines.push(`• ${name}${bits.length ? ' — ' + bits.join(' · ') : ''}`);
    }
  }
  return lines.join('\n');
}

function formatPrompt() {
  const manga = M.key === 'manga';
  const example = manga
    ? '{ "name": "Title", "type": "manhwa", "status": "finished", "rating": 8, "date": "2024-03", "progress": "Ch. 120" }'
    : '{ "name": "Show title", "status": "finished", "rating": 8, "date": "2024-03" }';
  return `Convert my list of ${manga ? 'manga, manhwa and manhua' : 'TV shows'} below into JSON, and reply with only the JSON array. Use this exact format:

[
  ${example}
]

Rules:
${manga ? '- "type" is "manga" (Japanese), "manhwa" (Korean) or "manhua" (Chinese). Use null if unsure.\n' : ''}- "status" is one of: "finished", "${manga ? 'reading' : 'watching'}", "paused" (stopped for now but plan to return), "dropped" (quit because I didn't like it), "want" (${M.wantLabel.toLowerCase()}).
- "rating" is a number out of 10 (decimals like 7.5 are fine). Convert other scales to 10. Use null if there's no rating.
- "date" is when I ${M.verbPast} it. Use "YYYY-MM-DD", "YYYY-MM", or "YYYY" depending on how precise it is, or a range like "2019/2021". Use null if unknown.
${manga ? '- "progress" is how far I got, like "Ch. 120" or "Vol. 10". Leave it out if unknown.\n' : ''}- Keep the names as written; just fix obvious typos.

My list:
`;
}

/* ---------------- Parsing AI recommendations ---------------- */

const SKIP_TITLE = /^(why|reason|because|genre|where|similar|note|tone|vibe|pitch|watch|read|available|streaming|seasons?|episodes?|chapters?|volumes?|runtime|length|rating|type|status)\b/i;
const META_PAREN = /\s*\((?=[^)]*(?:\d{4}|manhwa|manhua|manga|webtoon|comic))[^)]*\)/i;

function parseRecs(text) {
  const lines = text.split(/\r?\n/);
  const numbered = /^\s*(?:#{1,6}\s*)?\d{1,2}[.)]\s+/;
  const useNumbered = lines.some((l) => numbered.test(l));
  const out = [];
  const seen = new Set();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let body = null;
    if (useNumbered) {
      if (numbered.test(line)) body = line.replace(numbered, '');
    } else if (/^(?:#{1,6}\s*)?(?:[-*•]\s+)/.test(line) && !/^\s{2,}/.test(raw)) {
      body = line.replace(/^(?:#{1,6}\s*)?[-*•]\s+/, '');
    } else if (/^\*\*[^*]+\*\*/.test(line)) {
      body = line;
    }
    if (!body) continue;

    let title, rest;
    const em = body.match(/^\*\*(.+?)\*\*\s*(.*)$/) || body.match(/^__(.+?)__\s*(.*)$/) || body.match(/^\*(.+?)\*\s*(.*)$/) || body.match(/^_(.+?)_\s*(.*)$/);
    if (em) { title = em[1]; rest = em[2]; }
    else {
      const sp = body.match(/^(.+?)(\s*\((?:\d{4}|manhwa|manhua|manga|webtoon|comic)[^)]*\).*|\s+[—–-]\s+.*|:\s.*)$/i);
      if (sp) { title = sp[1]; rest = sp[2]; } else { title = body; rest = ''; }
    }
    // "(2018, Manhwa)" after the title holds the year and the type.
    const meta = (title.match(META_PAREN) || rest.match(/^\s*\(([^)]*)\)/) || [''])[0];
    const ym = meta.match(/\b(?:19|20)\d{2}\b/);
    const year = ym ? +ym[0] : null;
    const kind = parseKind(meta);
    title = title.replace(META_PAREN, '').replace(/[*_"“”]/g, '').replace(/[\s:–—-]+$/, '').trim();
    const reason = rest.replace(/^\s*\([^)]*\)\s*/, '').replace(/^[\s—–:-]+/, '').replace(/\*+|__/g, '').trim();
    if (!title || title.length > 80 || title.split(/\s+/).length > 12 || SKIP_TITLE.test(title)) continue;
    const k = nameKey(title);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: title, year, kind, reason: reason.slice(0, 300) });
  }
  return out;
}

/* ---------------- Lookups: TVmaze (TV) and AniList (manga) ---------------- */

function tvFromShow(s) {
  const img = s.image && (s.image.medium || s.image.original);
  return {
    id: s.id,
    name: s.name,
    year: s.premiered ? +s.premiered.slice(0, 4) : null,
    poster: img ? img.replace(/^http:/, 'https:') : null,
    network: (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || '',
  };
}

async function tvSearch(q, signal, retry = true) {
  const r = await fetch(`${TVMAZE}/search/shows?q=${encodeURIComponent(q)}`, { signal });
  if (r.status === 429 && retry) { await sleep(2500); return tvSearch(q, signal, false); }
  if (!r.ok) throw new Error(`TVmaze ${r.status}`);
  const j = await r.json();
  return j.map((x) => tvFromShow(x.show));
}

/* Manga lookups search several databases at once, because no single one has everything:
   AniList (strong alternate and fan-translated titles), Kitsu (webcomics, manhua),
   MyAnimeList via Jikan (huge manhwa/manhua catalogue). Each one failing is fine. */

const anilistQuery = (filtered) => `query ($q: String) {
  Page(perPage: 8) {
    media(search: $q, type: MANGA, format_not: NOVEL, sort: SEARCH_MATCH${filtered ? ', isAdult: false' : ''}) {
      id
      countryOfOrigin
      title { romaji english }
      synonyms
      startDate { year }
      coverImage { medium }
    }
  }
}`;

function kindFromCountry(c) {
  if (!c) return null;
  return { JP: 'manga', KR: 'manhwa', CN: 'manhua', TW: 'manhua', HK: 'manhua' }[c] || 'comic';
}

/** When on, each source's own content-rating filter is applied to suggestions. */
const ratingFiltered = () => !!prefs.ratingFilter;

function result(source, fields) {
  return { source, network: KIND_LABELS[fields.kind] || '', ...fields, alt: (fields.alt || []).filter(Boolean) };
}

async function anilistSearch(q, signal, retry = true) {
  const r = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: anilistQuery(ratingFiltered()), variables: { q } }),
    signal,
  });
  if (r.status === 429 && retry) { await sleep(5000); return anilistSearch(q, signal, false); }
  if (!r.ok) throw new Error(`AniList ${r.status}`);
  const j = await r.json();
  const media = (j && j.data && j.data.Page && j.data.Page.media) || [];
  return media.map((m) => result('anilist', {
    id: m.id,
    name: m.title.english || m.title.romaji,
    alt: [m.title.romaji, m.title.english, ...(m.synonyms || [])],
    year: (m.startDate && m.startDate.year) || null,
    poster: (m.coverImage && m.coverImage.medium) || null,
    kind: kindFromCountry(m.countryOfOrigin),
  }));
}

const KITSU_KINDS = { manga: 'manga', oneshot: 'manga', doujin: 'manga', manhwa: 'manhwa', manhua: 'manhua', oel: 'comic' };

async function kitsuSearch(q, signal) {
  const params = new URLSearchParams({
    'filter[text]': q,
    'page[limit]': '8',
    'fields[manga]': 'canonicalTitle,titles,abbreviatedTitles,subtype,startDate,posterImage,ageRating',
  });
  const r = await fetch(`${KITSU}?${params}`, { signal });
  if (!r.ok) throw new Error(`Kitsu ${r.status}`);
  const j = await r.json();
  return ((j && j.data) || [])
    .filter((m) => m.attributes && KITSU_KINDS[m.attributes.subtype] && (!ratingFiltered() || m.attributes.ageRating !== 'R18'))
    .map((m) => {
      const a = m.attributes;
      const t = a.titles || {};
      return result('kitsu', {
        id: +m.id || null,
        name: t.en || t.en_us || a.canonicalTitle,
        alt: [a.canonicalTitle, ...Object.values(t), ...(a.abbreviatedTitles || [])],
        year: a.startDate ? +a.startDate.slice(0, 4) : null,
        poster: (a.posterImage && (a.posterImage.small || a.posterImage.medium)) || null,
        kind: KITSU_KINDS[a.subtype],
      });
    });
}

const JIKAN_KINDS = { manga: 'manga', oneshot: 'manga', doujinshi: 'manga', manhwa: 'manhwa', manhua: 'manhua', oel: 'comic' };

async function jikanSearch(q, signal, retry = true) {
  const params = new URLSearchParams({ q, limit: '8' });
  if (ratingFiltered()) params.set('sfw', 'true');
  const r = await fetch(`${JIKAN}?${params}`, { signal });
  if (r.status === 429 && retry) { await sleep(1500); return jikanSearch(q, signal, false); }
  if (!r.ok) throw new Error(`Jikan ${r.status}`);
  const j = await r.json();
  return ((j && j.data) || [])
    .filter((m) => JIKAN_KINDS[normKey(m.type || '')])
    .map((m) => {
      const img = m.images && m.images.jpg;
      const from = m.published && m.published.prop && m.published.prop.from;
      return result('mal', {
        id: m.mal_id,
        name: m.title_english || m.title,
        alt: [m.title, m.title_english, ...(m.title_synonyms || []), ...((m.titles || []).map((t) => t.title))],
        year: (from && from.year) || null,
        poster: (img && (img.image_url || img.small_image_url)) || null,
        kind: JIKAN_KINDS[normKey(m.type || '')],
      });
    });
}

const MANGA_SOURCES = [anilistSearch, kitsuSearch, jikanSearch];

const looseKey = (n) => String(n).toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const namesOf = (r) => [r.name, ...(r.alt || [])].map(looseKey).filter((k) => k.length > 1);

/** Combine results from several sources, folding duplicates together. */
function mergeResults(lists, q) {
  const out = [];
  for (const list of lists) {
    for (const r of list) {
      const keys = namesOf(r);
      const dup = out.find((o) => (!o.year || !r.year || Math.abs(o.year - r.year) <= 2)
        && (!o.kind || !r.kind || o.kind === r.kind)
        && namesOf(o).some((k) => keys.includes(k)));
      if (dup) {
        if (!dup.poster && r.poster) dup.poster = r.poster;
        if (!dup.year && r.year) dup.year = r.year;
        if (!dup.kind && r.kind) { dup.kind = r.kind; dup.network = r.network; }
        dup.alt = [...new Set([...dup.alt, ...r.alt])];
      } else out.push({ ...r });
    }
  }
  // Exact name matches first, then partial ones; otherwise keep each source's own ranking.
  const k = looseKey(q);
  const score = (r) => { const n = namesOf(r); return n.includes(k) ? 2 : n.some((x) => x.includes(k) || (x.length > 3 && k.includes(x))) ? 1 : 0; };
  return out.map((r, i) => [r, score(r), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((x) => x[0]);
}

/** Abort after `ms`, or when `parent` aborts. */
function timeoutSignal(parent, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  if (parent) {
    if (parent.aborted) c.abort();
    else parent.addEventListener('abort', () => c.abort(), { once: true });
  }
  return { signal: c.signal, clear: () => clearTimeout(t) };
}

const searchCache = new Map(); // finished suggestion searches, so retyping a title is instant

/**
 * Search for suggestions, calling onUpdate(results, done) every time a source answers,
 * so a slow or unreachable source never holds up the others. Slow sources time out.
 */
async function streamSearch(q, signal, onUpdate) {
  const key = `${M.key}|${prefs.ratingFilter ? 1 : 0}|${q.toLowerCase()}`;
  if (searchCache.has(key)) { onUpdate(searchCache.get(key), true); return; }
  const sources = M.key === 'manga' ? MANGA_SOURCES : [tvSearch];
  const lists = new Array(sources.length).fill(null);
  let pending = sources.length, anyOk = false;
  await Promise.all(sources.map(async (fn, i) => {
    const t = timeoutSignal(signal, 6000);
    try { lists[i] = await fn(q, t.signal, false); anyOk = true; }
    catch (_) { lists[i] = []; }
    finally { t.clear(); pending--; }
    if (signal && signal.aborted) return;
    const merged = M.key === 'manga' ? mergeResults(lists.filter(Boolean), q) : lists[i];
    if (pending === 0 && anyOk) {
      searchCache.set(key, merged);
      if (searchCache.size > 60) searchCache.delete(searchCache.keys().next().value);
    }
    onUpdate(merged, pending === 0);
  }));
}

async function mangaSearchAll(q, signal) {
  const settled = await Promise.allSettled(MANGA_SOURCES.map((fn) => fn(q, signal)));
  if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const ok = settled.filter((x) => x.status === 'fulfilled').map((x) => x.value);
  if (!ok.length) throw settled[0].reason;
  return mergeResults(ok, q);
}

const lookupSearch = (q, signal) => (M.key === 'manga' ? mangaSearchAll(q, signal) : tvSearch(q, signal));

/** Best cover match for a logged title: try each source in turn, stop at the first good match. */
async function findMatch(name, year, kind) {
  if (M.key !== 'manga') return bestMatch(await tvSearch(name), name, year);
  let lastErr = null, anyOk = false;
  for (const fn of MANGA_SOURCES) {
    try {
      const best = bestMatch(await fn(name), name, year, kind);
      anyOk = true;
      if (best) return best;
    } catch (e) { lastErr = e; }
  }
  if (!anyOk) throw lastErr || new Error('lookup failed');
  return null;
}

/** What gets stored on a show from a lookup result. */
const metaOf = (r) => ({ id: r.id, name: r.name, year: r.year, poster: r.poster, network: r.network, src: r.source });

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'is', 'i', 'my', 'no', 'wa', 'ga', 'wo']);
const wordsOf = (n) => String(n).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP_WORDS.has(w));

function bestMatch(results, name, year, kind) {
  const k = looseKey(name);
  const close = results.filter((r) => namesOf(r).some((rk) => rk === k || (k.length > 3 && rk.length > 3 && (rk.includes(k) || k.includes(rk)))));
  let pool = close;
  if (!close.length) {
    // Loose fallback for fan translations: most of the words match one of the known titles.
    const qw = new Set(wordsOf(name));
    if (qw.size < 2) return null;
    const sim = (r) => Math.max(0, ...[r.name, ...(r.alt || [])].map((t) => {
      const tw = new Set(wordsOf(t));
      const inter = [...qw].filter((w) => tw.has(w)).length;
      return inter / new Set([...qw, ...tw]).size;
    }));
    pool = results.filter((r) => sim(r) >= 0.6).sort((a, b) => sim(b) - sim(a));
    if (!pool.length) return null;
  } else {
    const exact = close.filter((r) => namesOf(r).includes(k));
    if (exact.length) pool = exact;
  }
  if (kind) {
    const sameKind = pool.filter((r) => r.kind === kind);
    if (sameKind.length) pool = sameKind;
  }
  return (year && pool.find((r) => r.year === year)) || pool[0];
}

let posterRun = null;

async function findPosters(manual = false) {
  if (!prefs.posters) return;
  if (posterRun) { if (manual) toast(`Already looking for ${M.coverWord}s…`); return; }
  const todo = shows.filter((s) => !(s.tv && (s.tv.id || (s.tv.miss && s.tv.v === LOOKUP_VERSION))));
  if (!todo.length) { if (manual) toast(`Every ${M.noun} already has a ${M.coverWord}`); return; }
  const gen = switchGen;
  posterRun = (async () => {
    let found = 0, done = 0;
    for (const s of todo) {
      while (document.getElementById('showSheet').open && switchGen === gen) await sleep(1000);
      if (!prefs.posters || switchGen !== gen) break;
      if (manual) toast(`Finding ${M.coverWord}s… ${done + 1} of ${todo.length}`, 4000);
      try {
        const best = await findMatch(s.name, s.tv && s.tv.year, s.kind);
        if (switchGen !== gen) break; // switched logs mid-lookup
        if (best) {
          s.tv = metaOf(best);
          if (best.kind && !s.kind) s.kind = best.kind;
          found++;
        } else s.tv = { ...(s.tv || {}), miss: true, v: LOOKUP_VERSION };
      } catch (_) {
        if (manual) toast(`Couldn’t reach ${M.lookupName}. Are you online?`);
        break;
      }
      done++;
      if (done % 5 === 0) { saveShows(); render(); }
      await sleep(M.lookupDelay);
    }
    if (switchGen !== gen) return;
    saveShows();
    render();
    if (manual && done === todo.length) toast(found ? `Found ${found} ${M.coverWord}${found === 1 ? '' : 's'}` : `No new ${M.coverWord}s found`);
  })();
  try { await posterRun; } finally { posterRun = null; if (switchGen !== gen) findPosters(); }
}

/* ---------------- Clipboard / toast ---------------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
    ta.remove();
    return ok;
  }
}

let toastTimer;
function toast(msg, ms = 2400, action = null) {
  const el = $('#toast');
  // Modal dialogs live in the top layer, so the toast has to move inside one to be visible.
  const host = $('dialog[open]') || document.body;
  if (el.parentElement !== host) host.appendChild(el);
  $('.toast-msg', el).textContent = msg;
  const btn = $('.toast-action', el);
  btn.hidden = !action;
  btn.textContent = action ? action.label : '';
  btn.onclick = action ? () => { el.classList.remove('show'); action.fn(); } : null;
  el.classList.toggle('actionable', !!action);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Sorting & rendering ---------------- */

const sortName = (n) => n.replace(/^(the|a|an)\s+/i, '');
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compareRecent(a, b) {
  const ka = endPoint(a.date), kb = endPoint(b.date);
  if (ka !== kb) {
    if (!ka) return 1;
    if (!kb) return -1;
    return ka < kb ? 1 : -1;
  }
  return (b.added || 0) - (a.added || 0);
}

function sorted(list, mode) {
  const arr = [...list];
  if (mode === 'rating') {
    arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || collator.compare(sortName(a.name), sortName(b.name)));
  } else if (mode === 'name') {
    arr.sort((a, b) => collator.compare(sortName(a.name), sortName(b.name)));
  } else {
    arr.sort(compareRecent);
  }
  return arr;
}

function scoreHTML(r) {
  if (r == null) return '<span class="score none">—</span>';
  const cls = r >= 8 ? 'hi' : r < 5 ? 'lo' : '';
  return `<span class="score ${cls}">${fmtRating(r)}</span>`;
}

function thumbHTML(s) {
  if (!prefs.posters) return '';
  const p = s.tv && s.tv.poster;
  if (p) return `<img class="thumb" src="${esc(p)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  return `<span class="thumb ph" aria-hidden="true">${esc(sortName(s.name).charAt(0).toUpperCase())}</span>`;
}

function rowHTML(s) {
  const bits = M.key === 'manga' && s.kind ? [KIND_LABELS[s.kind]] : [];
  if (s.status === 'want') {
    if (s.tv && s.tv.year) bits.push(String(s.tv.year));
    if (s.note) bits.push(oneLine(s.note));
  } else {
    const when = fmtWatched(s.date);
    if (when) bits.push(when);
    if (s.seasons) bits.push(s.seasons);
  }
  const tag = ['watching', 'paused', 'dropped'].includes(s.status) ? `<span class="tag tag-${s.status}">${statusLabel(s.status)}</span>` : '';
  const sub = tag || bits.length ? `<span class="row-when">${tag}${esc(bits.join(' · '))}</span>` : '';
  return `<button type="button" class="row" data-id="${esc(s.id)}">
    ${thumbHTML(s)}
    <span class="row-main">
      <span class="row-name">${esc(s.name)}</span>
      ${sub}
    </span>
    ${s.status === 'want' ? '' : scoreHTML(s.rating)}
  </button>`;
}

const card = (arr) => `<div class="card">${arr.map(rowHTML).join('')}</div>`;
const group = (label, arr) => `
  <section class="group">
    <h2 class="group-label"><span>${esc(label)}</span><span>${arr.length}</span></h2>
    ${card(arr)}
  </section>`;

function backupNudge() {
  if (shows.length < 5) return null;
  const now = Date.now();
  if (prefs.snoozeUntil > now) return null;
  if (prefs.lastBackup) {
    const days = Math.floor((now - prefs.lastBackup) / DAY);
    return days >= 30 ? `Your last backup was ${days} days ago.` : null;
  }
  return now - prefs.firstUse > 3 * DAY ? 'You haven’t backed up your log yet. It only lives on this phone.' : null;
}

function render() {
  const list = $('#list');
  const tab = prefs.tab === 'want' ? 'want' : 'log';
  const pool = shows.filter((s) => (tab === 'want' ? s.status === 'want' : s.status !== 'want'));
  const q = query.trim().toLowerCase();
  const match = (s) => !q || `${s.name} ${s.note} ${s.seasons} ${statusLabel(s.status)} ${KIND_LABELS[s.kind] || ''}`.toLowerCase().includes(q);
  const items = sorted(pool.filter(match), prefs.sort);

  // Summary
  const logged = shows.filter((s) => s.status !== 'want');
  const want = shows.length - logged.length;
  const rated = logged.filter((s) => s.rating != null);
  const avg = rated.length ? rated.reduce((t, s) => t + s.rating, 0) / rated.length : null;
  const parts = shows.length ? [countNoun(logged.length), avg != null ? `avg ${avg.toFixed(1)}` : '', want ? `${want} ${M.toWhat}` : ''] : [];
  $('#summary').innerHTML = [multiProfile() ? `<span class="pf-chip">${esc(P.name)}</span>` : '', ...parts.map(esc)].filter(Boolean).join(' · ');

  $$('#tabSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  $('#wantCount').textContent = want || '';
  $('#sortSel').value = prefs.sort;

  const nudge = tab === 'log' ? backupNudge() : null;
  $('#nudge').hidden = !nudge;
  if (nudge) $('#nudgeText').textContent = nudge;

  const isEmpty = shows.length === 0;
  $('#empty').hidden = !isEmpty;
  $('#controls').hidden = isEmpty;
  if (isEmpty) { list.innerHTML = ''; return; }

  const recsBtn = '<button type="button" class="btn ghost recs-btn" data-act="recs">＋ Paste AI recommendations</button>';

  if (!pool.length) {
    list.innerHTML = tab === 'want'
      ? `<div class="soft-empty"><p class="muted">${M.emptyList}</p>${recsBtn}</div>`
      : `<div class="soft-empty"><p class="muted">${M.emptyLog}</p></div>`;
    return;
  }
  if (!items.length) { list.innerHTML = `<p class="no-match muted">No ${M.nouns} match “${esc(query.trim())}”.</p>`; return; }

  let html = '';
  if (tab === 'want') {
    html = recsBtn + `<section class="group">${card(items)}</section>`;
  } else if (prefs.sort === 'recent') {
    const watching = items.filter((s) => s.status === 'watching');
    if (watching.length) html += group(statusLabel('watching'), watching);
    const groups = new Map();
    for (const s of items) {
      if (s.status === 'watching') continue;
      const y = yearOf(s.date) || 'Undated';
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(s);
    }
    html += [...groups].map(([label, arr]) => group(label, arr)).join('');
  } else {
    html = `<section class="group">${card(items)}</section>`;
  }
  list.innerHTML = html;
}

/* ---------------- Add / edit sheet ---------------- */

const showSheet = $('#showSheet');
const showForm = $('#showForm');
const fName = $('#fName');
let editingId = null;
let currentRating = null;
let dateMode = 'day';
let formStatus = 'finished';
let formTv = null;

// Build rating buttons 1–10
$('#ratingGrid').innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" data-v="${i + 1}" aria-label="${i + 1} out of 10">${i + 1}</button>`).join('');

function setRating(r) {
  currentRating = r;
  const base = r == null ? null : Math.floor(r);
  const half = r != null && r % 1 !== 0;
  $$('#ratingGrid button').forEach((b) => {
    const v = +b.dataset.v;
    b.setAttribute('aria-pressed', String(base === v));
    b.classList.toggle('lit', base != null && v < base);
  });
  const hb = $('#halfBtn');
  hb.setAttribute('aria-pressed', String(half));
  hb.disabled = r == null || base >= 10;
  $('#ratingLabel').textContent = r == null ? 'Not rated' : `${fmtRating(r)} / 10`;
}

$('#ratingGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const v = +b.dataset.v;
  const base = currentRating == null ? null : Math.floor(currentRating);
  const half = currentRating != null && currentRating % 1 !== 0;
  if (base === v) setRating(null);
  else setRating(half && v < 10 ? v + 0.5 : v);
});

$('#halfBtn').addEventListener('click', () => {
  if (currentRating == null) return;
  const base = Math.floor(currentRating);
  setRating(currentRating % 1 ? base : Math.min(10, base + 0.5));
});

let formKind = null;

function setKind(k) {
  formKind = k;
  $$('#kindSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
}

$('#kindSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setKind(formKind === b.dataset.kind ? null : b.dataset.kind);
});

function setStatus(st) {
  formStatus = st;
  $$('#statusSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === st)));
  $$('[data-hide-want]', showForm).forEach((el) => { el.hidden = st === 'want'; });
  $('#statusHint').textContent = M.hints[st];
  $('#fNote').placeholder = st === 'want' ? 'Why? Who recommended it…' : st === 'dropped' ? 'What put you off?' : 'What you thought, who recommended it…';
}

$('#statusSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setStatus(b.dataset.status);
});

function setDateMode(mode) {
  dateMode = mode;
  $$('#dateSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $$('.date-panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === mode));
  const now = todayISO();
  if (mode === 'day' && !$('#dDay').value) $('#dDay').value = now;
  if (mode === 'month' && !$('#dMonth').value) $('#dMonth').value = now.slice(0, 7);
  if (mode === 'year' && !$('#dYear').value) $('#dYear').value = now.slice(0, 4);
}

$('#dateSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setDateMode(b.dataset.mode);
});

function fillDate(value) {
  ['#dDay', '#dMonth', '#dYear', '#dFrom', '#dTo'].forEach((s) => { $(s).value = ''; });
  if (!value) return 'none';
  if (value.includes('/')) {
    const [a, b] = value.split('/');
    $('#dFrom').value = a;
    $('#dTo').value = b;
    return 'range';
  }
  if (value.length === 10) { $('#dDay').value = value; return 'day'; }
  if (value.length === 7) { $('#dMonth').value = value; return 'month'; }
  $('#dYear').value = value;
  return 'year';
}

function readDate() {
  switch (dateMode) {
    case 'none': return { ok: true, value: null };
    case 'day': {
      const v = parsePoint($('#dDay').value);
      return v ? { ok: true, value: v } : { ok: false, error: 'Pick a date, or choose “Not sure”' };
    }
    case 'month': {
      const v = parsePoint($('#dMonth').value);
      return v ? { ok: true, value: v } : { ok: false, error: 'Enter a month like 2024-03' };
    }
    case 'year': {
      const v = parsePoint($('#dYear').value);
      return v ? { ok: true, value: v } : { ok: false, error: 'Enter a year like 2021' };
    }
    case 'range': {
      const a = parsePoint($('#dFrom').value), b = parsePoint($('#dTo').value);
      if (!a || !b) return { ok: false, error: 'Enter both years, like 2019 to 2021' };
      return { ok: true, value: makeRange(a, b) };
    }
  }
  return { ok: true, value: null };
}

function renderMatch() {
  const show = !!(formTv && formTv.id);
  $('#matchRow').hidden = !show;
  if (!show) return;
  $('#matchImg').hidden = !formTv.poster;
  if (formTv.poster) $('#matchImg').src = formTv.poster;
  $('#matchText').textContent = [formTv.name, formTv.year, formTv.network].filter(Boolean).join(' · ');
}

/* Name suggestions */
let suggestTimer, suggestCtl, suggestions = [];

function hideSuggest() {
  $('#suggest').hidden = true;
  suggestions = [];
}

function renderSuggest(list, done) {
  suggestions = list.slice(0, 8);
  const rows = suggestions.map((r, i) => `
    <button type="button" role="option" data-i="${i}">
      ${r.poster ? `<img src="${esc(r.poster)}" alt="" referrerpolicy="no-referrer">` : '<span class="ph"></span>'}
      <span><strong>${esc(r.name)}</strong><small>${esc([r.year, r.network].filter(Boolean).join(' · '))}</small></span>
    </button>`).join('');
  const status = !done
    ? '<p class="suggest-note">Searching…</p>'
    : suggestions.length ? '' : '<p class="suggest-note">No matches found. You can still save it as typed.</p>';
  $('#suggest').innerHTML = rows + status;
  $('#suggest').hidden = false;
}

fName.addEventListener('input', () => {
  if (formTv && fName.value.trim() !== formTv.name) { formTv = null; renderMatch(); }
  clearTimeout(suggestTimer);
  if (suggestCtl) suggestCtl.abort();
  const q = fName.value.trim();
  if (!prefs.posters || q.length < 2) { hideSuggest(); return; }
  suggestTimer = setTimeout(() => {
    const ctl = new AbortController();
    suggestCtl = ctl;
    if (!suggestions.length) renderSuggest([], false); // instant feedback while the first source answers
    streamSearch(q, ctl.signal, (list, done) => {
      if (ctl.signal.aborted || fName.value.trim() !== q) return;
      renderSuggest(list, done);
    }).catch(() => {});
  }, 300);
});

// Keep focus in the input while tapping a suggestion so the tap registers.
$('#suggest').addEventListener('pointerdown', (e) => e.preventDefault());
$('#suggest').addEventListener('mousedown', (e) => e.preventDefault());
$('#suggest').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  formTv = suggestions[+b.dataset.i];
  fName.value = formTv.name;
  if (formTv.kind) setKind(formTv.kind);
  hideSuggest();
  renderMatch();
  fName.blur();
});
fName.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== fName) { if (suggestCtl) suggestCtl.abort(); hideSuggest(); } }, 150));
fName.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideSuggest(); });
$('#matchClear').addEventListener('click', () => { formTv = null; renderMatch(); });

function openSheet(d) {
  if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
  else d.setAttribute('open', '');
}

function closeSheet(d) {
  if (typeof d.close === 'function') d.close();
  else d.removeAttribute('open');
}

function openAdd(status) {
  editingId = null;
  $('#showSheetTitle').textContent = status === 'want' ? `Add to ${M.listName.toLowerCase()}` : `Add ${M.noun}`;
  $('#deleteBtn').hidden = true;
  const q = query.trim();
  fName.value = q && !shows.some((s) => nameKey(s.name) === nameKey(q)) ? q : '';
  formTv = null;
  renderMatch();
  hideSuggest();
  setStatus(status);
  setKind(null);
  setRating(null);
  fillDate(null);
  setDateMode(prefs.dateMode || 'day');
  $('#fSeasons').value = '';
  $('#fNote').value = '';
  openSheet(showSheet);
  fName.focus();
}

function openEdit(id) {
  const s = shows.find((x) => x.id === id);
  if (!s) return;
  editingId = id;
  $('#showSheetTitle').textContent = `Edit ${M.noun}`;
  $('#deleteBtn').hidden = false;
  fName.value = s.name;
  formTv = s.tv && s.tv.id ? { ...s.tv } : null;
  renderMatch();
  hideSuggest();
  setStatus(s.status);
  setKind(s.kind || null);
  setRating(s.rating ?? null);
  const mode = fillDate(s.date);
  setDateMode(s.status === 'want' && !s.date ? (prefs.dateMode || 'day') : mode);
  $('#fSeasons').value = s.seasons || '';
  $('#fNote').value = s.note || '';
  openSheet(showSheet);
}

showForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = fName.value.trim().replace(/\s+/g, ' ');
  if (!name) { toast(`Add the ${M.noun}’s name`); fName.focus(); return; }
  const isWant = formStatus === 'want';
  const d = isWant ? { ok: true, value: null } : readDate();
  if (!d.ok) { toast(d.error); return; }

  const existing = editingId && shows.find((x) => x.id === editingId);
  // Keep a previous "no match" marker unless the name changed; drop stale matches.
  let tv = formTv && formTv.id ? metaOf(formTv) : null;
  if (!tv && existing && existing.tv && !existing.tv.id && nameKey(existing.name) === nameKey(name)) tv = existing.tv;
  const data = {
    name,
    status: formStatus,
    kind: M.key === 'manga' ? formKind : (existing && existing.kind) || null,
    rating: isWant ? null : currentRating,
    date: d.value,
    seasons: isWant ? '' : $('#fSeasons').value.trim(),
    note: $('#fNote').value.trim().slice(0, 500),
    tv,
  };

  if (existing) Object.assign(existing, data);
  else {
    shows.push({ id: uid(), ...data, added: Date.now() });
    if (!isWant) { prefs.dateMode = dateMode; savePrefs(); }
  }
  saveShows();
  closeSheet(showSheet);
  render();
  toast(existing ? 'Saved' : isWant ? `Added ${name} to your ${M.listName.toLowerCase()}` : `Logged ${name}`);
  if (!tv) findPosters();
});

$('#deleteBtn').addEventListener('click', () => {
  const idx = shows.findIndex((x) => x.id === editingId);
  if (idx < 0) return;
  const [removed] = shows.splice(idx, 1);
  saveShows();
  closeSheet(showSheet);
  render();
  toast(`Deleted ${removed.name}`, 5000, {
    label: 'Undo',
    fn: () => {
      shows.splice(Math.min(idx, shows.length), 0, removed);
      saveShows();
      render();
      toast('Restored');
    },
  });
});

/* ---------------- Ask an AI ---------------- */

const askSheet = $('#askSheet');
let askTarget = 'chatgpt';
let askCount = 10;

function askOptions() {
  return { count: askCount, mood: $('#askMood').value };
}

function updateAskPreview() {
  $$('#askCount button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.count === askCount)));
  $('#askPreview').textContent = buildPrompt(askOptions());
}

function openAsk(which) {
  if (!shows.length) { toast(`Log a few ${M.nouns} first`); return; }
  askTarget = which;
  askCount = [5, 10, 15].includes(+prefs.count) ? +prefs.count : 10;
  const label = which === 'claude' ? 'Claude' : 'ChatGPT';
  $('#askTitle').textContent = `Ask ${label}`;
  $('#askOpen').textContent = `Open ${label}`;
  $('#askMood').value = '';
  $('.preview', askSheet).open = false;
  updateAskPreview();
  openSheet(askSheet);
}

$('#askCount').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  askCount = +b.dataset.count;
  prefs.count = askCount;
  savePrefs();
  updateAskPreview();
});
$('#askMood').addEventListener('input', updateAskPreview);
$('#askMood').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#askOpen').click(); } });

$('#askOpen').addEventListener('click', () => {
  const prompt = buildPrompt(askOptions());
  const encoded = encodeURIComponent(prompt);
  const base = askTarget === 'claude' ? 'https://claude.ai/new' : 'https://chatgpt.com/';
  const fits = encoded.length <= MAX_URL_PROMPT;
  copyText(prompt); // backup in case the site doesn't pre-fill
  // Must open synchronously inside the tap so Safari doesn't block it.
  window.open(fits ? `${base}?q=${encoded}` : base, '_blank', 'noopener');
  closeSheet(askSheet);
  toast(fits ? 'Prompt copied too, just in case' : 'Long list, so the prompt was copied. Just paste it in.', 3200);
});

$('#askCopy').addEventListener('click', async () => {
  const ok = await copyText(buildPrompt(askOptions()));
  toast(ok ? 'Prompt copied. Paste it into any AI.' : 'Couldn’t copy');
});

$('#askToRecs').addEventListener('click', () => { closeSheet(askSheet); openRecs(); });

$('#askGpt').addEventListener('click', () => openAsk('chatgpt'));
$('#askClaude').addEventListener('click', () => openAsk('claude'));

/* ---------------- Paste recommendations ---------------- */

const recsSheet = $('#recsSheet');
let recs = [];

function openRecs() {
  $('#recsText').value = '';
  updateRecs();
  openSheet(recsSheet);
}

function updateRecs() {
  recs = parseRecs($('#recsText').value).map((r) => ({
    ...r,
    exists: shows.some((s) => nameKey(s.name) === nameKey(r.name)),
  }));
  const list = $('#recsList');
  if (!$('#recsText').value.trim()) list.innerHTML = '';
  else if (!recs.length) list.innerHTML = '<p class="small muted">No titles found yet. Paste the numbered list from the reply.</p>';
  else {
    list.innerHTML = recs.map((r, i) => `
      <label class="rec ${r.exists ? 'exists' : ''}">
        <input type="checkbox" data-i="${i}" ${r.exists ? 'disabled' : 'checked'}>
        <span>
          <strong>${esc(r.name)}${r.year || r.kind ? ` <span class="muted">(${esc([r.year, KIND_LABELS[r.kind]].filter(Boolean).join(', '))})</span>` : ''}</strong>
          <small>${r.exists ? 'Already in your log' : esc(r.reason)}</small>
        </span>
      </label>`).join('');
  }
  updateRecsButton();
}

function updateRecsButton() {
  const n = $$('#recsList input:checked').length;
  $('#recsAdd').disabled = !n;
  $('#recsAdd').textContent = n ? `Add ${n} to ${M.listName.toLowerCase()}` : `Add to ${M.listName.toLowerCase()}`;
}

$('#recsText').addEventListener('input', updateRecs);
$('#recsList').addEventListener('change', updateRecsButton);
$('#recsAdd').addEventListener('click', () => {
  const picked = $$('#recsList input:checked').map((c) => recs[+c.dataset.i]);
  const now = Date.now();
  picked.forEach((r, i) => {
    shows.push(migrate({ id: uid(), name: r.name, status: 'want', kind: M.key === 'manga' ? r.kind : null, note: r.reason, tv: r.year ? { year: r.year } : null, added: now + i }));
  });
  saveShows();
  prefs.tab = 'want';
  savePrefs();
  closeSheet(recsSheet);
  render();
  toast(`Added ${picked.length} to your ${M.listName.toLowerCase()}`);
  findPosters();
});

/* ---------------- Stats ---------------- */

function bars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row">
      <span class="bar-label">${esc(r.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${r.value ? Math.max(2, (r.value / max) * 100) : 0}%"></span></span>
      <span class="bar-val">${r.value}${r.extra ? `<small>${esc(r.extra)}</small>` : ''}</span>
    </div>`).join('')}</div>`;
}

function renderStats() {
  const logged = shows.filter((s) => s.status !== 'want');
  const rated = logged.filter((s) => s.rating != null);
  const avg = (arr) => (arr.length ? arr.reduce((t, s) => t + s.rating, 0) / arr.length : null);
  const all = avg(rated);
  const count = (st) => shows.filter((s) => s.status === st).length;
  const body = $('#statsBody');

  if (!logged.length) {
    body.innerHTML = `<p class="muted center">Log a few ${M.nouns} to see stats.</p>`;
    return;
  }

  const tiles = [
    ['Logged', logged.length],
    ['Avg rating', all != null ? all.toFixed(1) : '—'],
    ['Finished', count('finished')],
    ['Dropped', count('dropped')],
  ];

  const ratingRows = [];
  for (let b = 10; b >= 1; b--) ratingRows.push({ label: String(b), value: rated.filter((s) => Math.min(10, Math.max(1, Math.floor(s.rating))) === b).length });

  const years = new Map();
  for (const s of logged) {
    const y = yearOf(s.date);
    if (!y) continue;
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(s);
  }
  const yearRows = [...years].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([y, arr]) => {
    const a = avg(arr.filter((s) => s.rating != null));
    return { label: y, value: arr.length, extra: a != null ? `avg ${a.toFixed(1)}` : '' };
  });

  const statusRows = STATUS_ORDER.map((st) => ({ label: statusLabel(st), value: count(st) })).filter((r) => r.value);

  const kindRows = M.key === 'manga' ? Object.keys(KIND_LABELS).map((k) => ({ label: KIND_LABELS[k], value: logged.filter((s) => s.kind === k).length })).filter((r) => r.value) : [];
  const top = sorted(rated, 'rating').slice(0, 5);

  body.innerHTML = `
    <div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><span class="tile-v">${esc(v)}</span><span class="tile-k">${esc(k)}</span></div>`).join('')}</div>
    ${rated.length ? `<section class="block"><h3>Ratings</h3>${bars(ratingRows)}</section>` : ''}
    ${yearRows.length ? `<section class="block"><h3>${M.statsYear}</h3>${bars(yearRows)}</section>` : ''}
    <section class="block"><h3>Status</h3>${bars(statusRows)}</section>
    ${kindRows.length ? `<section class="block"><h3>Type</h3>${bars(kindRows)}</section>` : ''}
    ${top.length ? `<section class="block"><h3>Top rated</h3><ol class="toplist">${top.map((s) => `<li><span>${esc(s.name)}</span><span class="score hi">${fmtRating(s.rating)}</span></li>`).join('')}</ol></section>` : ''}`;
}

$('#statsBtn').addEventListener('click', () => { renderStats(); openSheet($('#statsSheet')); });

/* ---------------- Import / export sheet ---------------- */

const dataSheet = $('#dataSheet');
const importText = $('#importText');
const importPreview = $('#importPreview');
let pendingImport = null;

function markBackup() {
  prefs.lastBackup = Date.now();
  prefs.snoozeUntil = 0;
  savePrefs();
  updateBackupInfo();
  render();
}

function updateBackupInfo() {
  const t = prefs.lastBackup;
  let txt = 'Not backed up yet.';
  if (t) {
    const days = Math.floor((Date.now() - t) / DAY);
    txt = `Last backup: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}.`;
  }
  $('#backupInfo').textContent = `${txt} Your log lives only on this device. A Notes export or JSON file can be imported back.`;
}

function openData() {
  updateBackupInfo();
  $('#postersToggle').checked = !!prefs.posters;
  $('#ratingFilterToggle').checked = !!prefs.ratingFilter;
  $('#ratingFilterRow').hidden = M.key !== 'manga';
  openSheet(dataSheet);
}

function updateImportPreview() {
  const r = parseImport(importText.value);
  pendingImport = null;
  importPreview.className = 'small';
  $('#importBtn').disabled = true;
  $('#importBtn').textContent = 'Import';
  if (r.empty) { importPreview.textContent = ''; return; }
  if (r.error) { importPreview.textContent = r.error; importPreview.classList.add('err'); return; }
  if (!r.items.length) {
    importPreview.textContent = r.nonTv ? `Only movies or episodes found (${r.nonTv}). Nothing to import.` : `No ${M.nouns} with a name found.`;
    importPreview.classList.add('err');
    return;
  }
  pendingImport = r.items;
  const notes = [];
  if (r.nonTv) notes.push(`${r.nonTv} movies/episodes skipped`);
  if (r.skipped) notes.push(`${r.skipped} skipped (no name)`);
  if (r.badDates) notes.push(`${r.badDates} date${r.badDates === 1 ? '' : 's'} not understood, left blank`);
  const n = r.items.length;
  importPreview.textContent = `✓ ${countNoun(n)} found${notes.length ? ' · ' + notes.join(' · ') : ''}`;
  importPreview.classList.add('ok');
  $('#importBtn').disabled = false;
  $('#importBtn').textContent = `Import ${countNoun(n)}`;
}

importText.addEventListener('input', updateImportPreview);

$('#pickFile').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    importText.value = await file.text();
    updateImportPreview();
  } catch (_) { toast('Couldn’t read that file'); }
  e.target.value = '';
});

$('#importBtn').addEventListener('click', () => {
  if (!pendingImport) return;
  const replace = $('#importReplace').checked;
  if (replace && shows.length && !confirm(`Replace your ${countNoun(shows.length)} with this import?`)) return;
  const { added, updated, same } = mergeImport(pendingImport, replace);
  saveShows();
  render();
  importText.value = '';
  $('#importReplace').checked = false;
  updateImportPreview();
  closeSheet(dataSheet);
  const parts = [`${added} added`];
  if (updated) parts.push(`${updated} updated`);
  if (same) parts.push(`${same} already logged`);
  toast(`Imported · ${parts.join(' · ')}`, 3200);
  findPosters();
});

$('#copyFormatPrompt').addEventListener('click', async () => {
  const ok = await copyText(formatPrompt());
  toast(ok ? 'Copied. Paste it into any AI and add your list after it.' : 'Couldn’t copy', 3200);
});

async function exportToNotes() {
  if (!shows.length) { toast('Nothing to export yet'); return; }
  const text = buildNotesText();
  // On iPhone the share sheet has Notes right there.
  if (navigator.share) {
    try { await navigator.share({ text }); markBackup(); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const ok = await copyText(text);
  if (ok) markBackup();
  toast(ok ? 'Copied. Paste it into a new note.' : 'Couldn’t copy', 3200);
}

async function saveBackupFile() {
  if (!shows.length) { toast('Nothing to export yet'); return; }
  const json = JSON.stringify(exportData(), null, 2);
  const filename = `${M.file}${multiProfile() ? `-${slug(P.name) || P.id}` : ''}-${todayISO()}.json`;
  const file = typeof File === 'function' ? new File([json], filename, { type: 'application/json' }) : null;
  // On iPhone, the share sheet is the reliable way to "Save to Files".
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${M.title}${multiProfile() ? ` (${P.name})` : ''} backup` }); markBackup(); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  markBackup();
}

$('#toNotes').addEventListener('click', exportToNotes);
$('#saveJson').addEventListener('click', saveBackupFile);
$('#copyJson').addEventListener('click', async () => {
  if (!shows.length) { toast('Nothing to export yet'); return; }
  const ok = await copyText(JSON.stringify(exportData(), null, 2));
  if (ok) markBackup();
  toast(ok ? `Copied ${countNoun(shows.length)} as JSON` : 'Couldn’t copy');
});

$('#postersToggle').addEventListener('change', (e) => {
  prefs.posters = e.target.checked;
  savePrefs();
  render();
  if (prefs.posters) findPosters();
});
$('#ratingFilterToggle').addEventListener('change', (e) => {
  prefs.ratingFilter = e.target.checked;
  savePrefs();
  toast(prefs.ratingFilter ? 'Content rating filter on' : 'Content rating filter off');
});

$('#findPosters').addEventListener('click', () => {
  if (!prefs.posters) { toast(`Turn on ${M.coverWord}s first`); return; }
  // Retry shows that previously had no match.
  shows.forEach((s) => { if (s.tv && s.tv.miss) delete s.tv.miss; });
  findPosters(true);
});

$('#eraseAll').addEventListener('click', () => {
  if (!shows.length) { toast('Already empty'); return; }
  if (!confirm(`Erase all ${countNoun(shows.length)} in ${multiProfile() ? `the “${P.name}” profile` : `your ${M.title}`} from this device? This can’t be undone.`)) return;
  shows = [];
  saveShows();
  render();
  closeSheet(dataSheet);
  toast('Everything erased');
});

/* ---------------- Wiring ---------------- */

$('#addBtn').addEventListener('click', () => openAdd(prefs.tab === 'want' ? 'want' : 'finished'));
$('#menuBtn').addEventListener('click', openData);
$('#emptyImport').addEventListener('click', openData);

$('#nudgeBackup').addEventListener('click', saveBackupFile);
$('#nudgeLater').addEventListener('click', () => {
  prefs.snoozeUntil = Date.now() + 7 * DAY;
  savePrefs();
  render();
});

$('#list').addEventListener('click', (e) => {
  if (e.target.closest('[data-act="recs"]')) { openRecs(); return; }
  const row = e.target.closest('.row');
  if (row) openEdit(row.dataset.id);
});

// Broken poster URLs fall back to the letter placeholder.
$('#list').addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const ph = document.createElement('span');
  ph.className = 'thumb ph';
  img.replaceWith(ph);
}, true);

$('#search').addEventListener('input', (e) => { query = e.target.value; render(); });

$('#tabSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  prefs.tab = b.dataset.tab;
  savePrefs();
  render();
});

$('#sortSel').addEventListener('change', (e) => {
  prefs.sort = e.target.value;
  savePrefs();
  render();
});

// Close buttons, and tapping the dimmed backdrop closes a sheet.
$$('dialog.sheet').forEach((d) => {
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => closeSheet(d)));
  d.addEventListener('click', (e) => { if (e.target === d) closeSheet(d); });
});

// Keep multiple tabs in sync.
window.addEventListener('storage', (e) => {
  if (e.key === dataKey()) { shows = loadShows(); render(); }
});

/* ---------------- Switching logs (TV / manga) ---------------- */

function applyModeText() {
  document.title = multiProfile() ? `${M.title} · ${P.name}` : M.title;
  $$('[data-t]').forEach((el) => { el.textContent = M[el.dataset.t]; });
  $$('[data-tp]').forEach((el) => { el.placeholder = M[el.dataset.tp]; });
  $('#kindField').hidden = M.key !== 'manga';
  $('#statusSeg [data-status="watching"]').textContent = M.verbing;
  $('#recsTitle').textContent = `Add to ${M.listName.toLowerCase()}`;
  $('#findPosters').textContent = `Find missing ${M.coverWord}s`;
  $$('#modeMenu [data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === M.key)));
}

function loggedCount(key) {
  const mode = MODES[key];
  const list = key === M.key ? shows : readList(mode, activeProfileOf(mode));
  const n = list.filter((x) => x.status !== 'want').length;
  const label = n ? `${n} ${n === 1 ? mode.noun : mode.nouns}` : '';
  const prof = key === M.key ? P : activeProfileOf(mode);
  return loadProfiles(mode).length > 1 ? [prof.name, label].filter(Boolean).join(' · ') : label;
}

const EDIT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderProfileMenu() {
  $('#pfLabel').textContent = `${M.title} profiles`;
  $('#pfList').innerHTML = profiles.map((x) => {
    const list = x.id === P.id ? shows : readList(M, x);
    const n = list.filter((y) => y.status !== 'want').length;
    return `<div class="pf-row">
      <button type="button" class="pf-pick" role="menuitemradio" aria-checked="${x.id === P.id}" data-profile="${esc(x.id)}">
        <span class="pf-dot" aria-hidden="true"></span>
        <span class="pf-name">${esc(x.name)}</span>
        <span class="pf-count">${n ? countNoun(n) : ''}</span>
      </button>
      <button type="button" class="pf-edit" data-edit="${esc(x.id)}" aria-label="Rename or delete ${esc(x.name)}">${EDIT_ICON}</button>
    </div>`;
  }).join('');
}

function toggleModeMenu(open) {
  if (open) {
    $$('#modeMenu [data-mode]').forEach((b) => { $('.mm-count', b).textContent = loggedCount(b.dataset.mode); });
    renderProfileMenu();
  }
  $('#modeMenu').hidden = !open;
  $('#menuScrim').hidden = !open;
  $('#modeBtn').setAttribute('aria-expanded', String(open));
}

/** Load whatever log + profile is now active and redraw everything. */
function reloadContext() {
  switchGen++;
  shows = loadShows();
  prefs = loadPrefs();
  savePrefs();
  query = '';
  $('#search').value = '';
  applyModeText();
  render();
  window.scrollTo(0, 0);
  if (prefs.posters && navigator.onLine !== false) findPosters();
}

function setMode(key) {
  toggleModeMenu(false);
  if (!MODES[key] || key === M.key) return;
  M = MODES[key];
  try { localStorage.setItem(MODE_KEY, key); } catch (_) { /* ignore */ }
  profiles = loadProfiles();
  P = activeProfileOf(M, profiles);
  reloadContext();
  toast(multiProfile() ? `Switched to ${M.title} · ${P.name}` : `Switched to ${M.title}`);
}

function setProfile(id) {
  toggleModeMenu(false);
  const next = profiles.find((x) => x.id === id);
  if (!next || next === P) return;
  P = next;
  saveProfiles();
  reloadContext();
  toast(`Switched to ${P.name}`);
}

/* Profile sheet: create, rename, delete */
const profileSheet = $('#profileSheet');
let editingProfile = null;

function openProfileSheet(id) {
  toggleModeMenu(false);
  editingProfile = id ? profiles.find((x) => x.id === id) || null : null;
  $('#profileTitle').textContent = editingProfile ? 'Edit profile' : `New ${M.title} profile`;
  $('#pName').value = editingProfile ? editingProfile.name : '';
  $('#pName').placeholder = M.profilePh;
  $('#profileHint').textContent = `Each profile keeps its own ${M.nouns}, ${M.listName.toLowerCase()}, stats and backups.`;
  $('#profileDelete').hidden = !editingProfile || profiles.length < 2;
  openSheet(profileSheet);
  $('#pName').focus();
}

$('#profileForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fallback = `Profile ${profiles.length + (editingProfile ? 0 : 1)}`;
  const name = $('#pName').value.trim().replace(/\s+/g, ' ').slice(0, 40) || (editingProfile ? editingProfile.name : fallback);
  if (profiles.some((x) => x !== editingProfile && x.name.toLowerCase() === name.toLowerCase())) {
    toast('You already have a profile with that name');
    return;
  }
  closeSheet(profileSheet);
  if (editingProfile) {
    editingProfile.name = name;
    saveProfiles();
    applyModeText();
    render();
    toast('Profile renamed');
    return;
  }
  const created = { id: `p${Date.now().toString(36)}`, name };
  profiles.push(created);
  P = created;
  saveProfiles();
  reloadContext();
  toast(`Created ${name}`);
});

$('#profileDelete').addEventListener('click', () => {
  const x = editingProfile;
  if (!x || profiles.length < 2) return;
  const n = (x === P ? shows : readList(M, x)).length;
  if (!confirm(`Delete the “${x.name}” profile${n ? ` and its ${countNoun(n)}` : ''}? This can’t be undone.`)) return;
  try {
    localStorage.removeItem(dataKey(M, x));
    localStorage.removeItem(prefsKeyFor(M, x));
  } catch (_) { /* ignore */ }
  profiles = profiles.filter((y) => y !== x);
  closeSheet(profileSheet);
  if (P === x) {
    P = profiles[0];
    saveProfiles();
    reloadContext();
  } else {
    saveProfiles();
    applyModeText();
    render();
  }
  toast(`Deleted ${x.name}`);
});

$('#modeBtn').addEventListener('click', () => toggleModeMenu($('#modeMenu').hidden));
$('#menuScrim').addEventListener('click', () => toggleModeMenu(false));
$('#modeMenu').addEventListener('click', (e) => {
  const t = e.target.closest('[data-mode], [data-profile], [data-edit], [data-act="new-profile"]');
  if (!t) return;
  if (t.dataset.mode) setMode(t.dataset.mode);
  else if (t.dataset.profile) setProfile(t.dataset.profile);
  else if (t.dataset.edit) openProfileSheet(t.dataset.edit);
  else openProfileSheet(null);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modeMenu').hidden) toggleModeMenu(false); });

applyModeText();
render();

if (prefs.posters && navigator.onLine !== false) setTimeout(() => findPosters(), 1500);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Exposed for tests / debugging in the console.
window.TVLog = { parseWatched, parsePoint, parseRating, parseStatus, parseKind, parseImport, parseRecs, fmtWatched, buildPrompt, buildNotesText, formatPrompt, setMode, setProfile, mode: () => M.key, profile: () => P.name };
