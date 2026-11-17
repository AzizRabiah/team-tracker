'use strict';
(function () {

/* =====================================================================
   Constants
   ===================================================================== */
const LS_KEY = 'cloudTracker.v1';
const LS_SESSION = 'cloudTracker.session.v1';
const POLL_MS = 15000;
const FORMAT = 'cloud-tracker';
const VERSION = 1;

const KINDS = [
  { id: 'notstarted', label: 'Not started' },
  { id: 'ontrack', label: 'On track' },
  { id: 'risk', label: 'Needs attention' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];
const KIND_RANK = { blocked: 0, risk: 1, ontrack: 2, notstarted: 3, done: 4 };
// brand palette: Oasis, Sun, Sunset, Coral, Purple, Moon, Sea, Silver
const PALETTE = ['#00c48c', '#ffdd40', '#ff6a39', '#ff375e', '#4f008c', '#a54ee1', '#1bced8', '#8e9aa0'];
const FIELD_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'select', label: 'Dropdown list' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LOGO_RE = /^data:image\/(png|jpeg|svg\+xml|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/* =====================================================================
   Helpers
   ===================================================================== */
const $ = (s, r) => (r || document).querySelector(s);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const uid = () => 'x' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const pad = (n) => String(n).padStart(2, '0');
const HEX = /^#[0-9a-f]{6}$/i;

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'vars') for (const vk of Object.keys(v)) el.style.setProperty(vk, v[vk]);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid);
  }
  return el;
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function parseISO(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const p = s.split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}
function diffDays(a, b) {
  const x = parseISO(a), y = parseISO(b);
  if (x == null || y == null) return 0;
  return Math.round((y - x) / 86400000);
}
function addDays(iso, n) {
  const d = new Date(parseISO(iso) + n * 86400000);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}
function fmtDate(iso) {
  const t = parseISO(iso);
  if (t == null) return '';
  const d = new Date(t);
  const s = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  return d.getUTCFullYear() === new Date().getFullYear() ? s : s + ' ' + d.getUTCFullYear();
}
const ttl = (it) => it.title || it.nextStep || it.update || it.challenge || 'Untitled';
const days = (n) => n + (n === 1 ? ' day' : ' days');
const topics = (n) => n + (n === 1 ? ' topic' : ' topics');

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function inkOn(hex) {
  const L = lum(hex);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0533 ? '#ffffff' : '#1d252d';
}

/* =====================================================================
   Default data
   ===================================================================== */
function defaultStatuses() {
  return [
    { id: 'ns', label: 'Not started', kind: 'notstarted', color: '#8e9aa0' },
    { id: 'ok', label: 'On track', kind: 'ontrack', color: '#00c48c' },
    { id: 'risk', label: 'Needs attention', kind: 'risk', color: '#ffdd40' },
    { id: 'blk', label: 'Blocked', kind: 'blocked', color: '#ff375e' },
    { id: 'done', label: 'Done', kind: 'done', color: '#4f008c' },
  ];
}
function defaultWorkstreams() {
  const g = 'Group 1';
  return [
    { id: 'ws1', name: 'Workstream A', group: g, summary: '', outlook: '' },
    { id: 'ws2', name: 'Workstream B', group: g, summary: '', outlook: '' },
    { id: 'ws3', name: 'Workstream C', group: g, summary: '', outlook: '' },
    { id: 'ws4', name: 'Workstream D', group: g, summary: '', outlook: '' },
    { id: 'ws5', name: 'Workstream E', group: '', summary: '', outlook: '' },
    { id: 'ws6', name: 'Workstream F', group: '', summary: '', outlook: '' },
  ];
}
function defaultDeciders() {
  return [
    { id: 'gm', label: 'GM', color: '#4f008c' },
    { id: 'gm2', label: 'GM of another unit', color: '#ff6a39' },
    { id: 'dir', label: 'Director', color: '#1bced8' },
    { id: 'sm', label: 'Section manager', color: '#a54ee1' },
  ];
}
function emptyData() {
  return {
    format: FORMAT,
    version: VERSION,
    meta: {
      title: 'Tracker',
      subtitle: '',
      brand: '',
      brandSub: '',
      summary: '',
      logo: '',
      updated: todayISO(),
      lastMeeting: '',
      sample: false,
    },
    config: { statuses: defaultStatuses(), workstreams: defaultWorkstreams(), fields: [], deciders: defaultDeciders() },
    items: [],
  };
}
function newItem(ws) {
  return {
    id: uid(), ws: ws || '', title: '', status: '',
    update: '', updateDate: '',
    nextStep: '', nextDate: '', targetDate: '',
    challenge: '', decision: { needed: false, text: '', by: '' },
    custom: {}, history: [], created: todayISO(),
  };
}

function sampleData() {
  const T = todayISO();
  const d = (n) => addDays(T, n);
  const data = emptyData();
  data.meta.sample = true;
  data.meta.summary = 'Example: write 2-3 lines here for the GM. What is on track, what is stuck, and what you need from leadership.';
  const ws = data.config.workstreams;
  ws[0].summary = 'Example: the agreement and technical link are moving, with open comments on testing.';
  ws[0].outlook = 'Example: close the test comments and sign the agreement.';
  ws[1].summary = 'Example: waiting for the pricing decision before we continue.';
  ws[4].summary = 'Example: the timeline is waiting for the partner to reply.';
  ws[4].outlook = 'Example: set a date for the follow-up meeting.';

  const H = (date, status, text) => ({ date, status, text });
  const mk = (o) => Object.assign(newItem(o.ws), o);
  data.items = [
    mk({ ws: 'ws1', title: 'Example: Technical connectivity test', status: 'risk',
      update: 'The first test raised some issues.', updateDate: d(-6), nextStep: 'Re-run the test after the fix', nextDate: d(2), targetDate: d(14),
      challenge: 'Needs a change from the network team.',
      history: [H(d(-14), 'ok', 'Testing started.'), H(d(-6), 'risk', 'The first test raised some issues.')] }),
    mk({ ws: 'ws2', title: 'Example: Approve pricing model', status: 'blk',
      update: 'Proposal is ready and waiting for a decision.', updateDate: d(-10), nextStep: 'Get the decision and inform the partner', nextDate: d(-2), targetDate: d(10),
      challenge: 'The decision is stuck with leadership.', decision: { needed: true, text: 'Approve the proposed pricing model.', by: 'GM' },
      history: [H(d(-18), 'ok', 'Prepared the proposal.'), H(d(-10), 'blk', 'Proposal is ready and waiting for a decision.')] }),
    mk({ ws: 'ws3', title: 'Example: Introductory meeting', status: 'ns',
      nextStep: 'Set a date for the meeting', nextDate: d(12), targetDate: d(20) }),
    mk({ ws: 'ws4', title: 'Example: Review approval', status: 'risk',
      update: 'Request submitted, waiting for its turn in the review queue.', updateDate: d(-20), nextStep: 'Follow up with the review team', nextDate: d(6), targetDate: d(25),
      challenge: 'The review queue is full and no date was given.', decision: { needed: true, text: 'Set the review priority.', by: 'GM of another unit' },
      history: [H(d(-20), 'risk', 'Request submitted, waiting for its turn in the review queue.')] }),
    mk({ ws: 'ws5', title: 'Example: Agree on the timeline', status: 'ok',
      update: 'Sent the proposed timeline.', updateDate: d(-4), nextStep: 'Partner reply', nextDate: d(5), targetDate: d(21),
      history: [H(d(-4), 'ok', 'Sent the proposed timeline.')] }),
    mk({ ws: 'ws6', title: 'Example: Schedule the follow-up meeting', status: 'ok',
      update: 'Reached out, waiting for dates.', updateDate: d(-1), nextStep: 'Confirm the date', nextDate: d(3), targetDate: d(10),
      history: [H(d(-1), 'ok', 'Reached out, waiting for dates.')] }),
  ];
  return data;
}

/* =====================================================================
   Validation (everything loaded from a file is sanitized)
   ===================================================================== */
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This file is not a tracker file.');
  if (raw.format && raw.format !== FORMAT) throw new Error('This file does not belong to this tracker.');
  const D = emptyData();
  const m = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const meta = {
    title: str(m.title) || D.meta.title,
    subtitle: str(m.subtitle),
    brand: str(m.brand).slice(0, 40),
    brandSub: str(m.brandSub).slice(0, 40),
    summary: str(m.summary),
    logo: LOGO_RE.test(str(m.logo)) && str(m.logo).length < 450000 ? m.logo : '',
    updated: parseISO(m.updated) != null ? m.updated : todayISO(),
    lastMeeting: parseISO(m.lastMeeting) != null ? m.lastMeeting : '',
    sample: m.sample === true,
  };
  const c = raw.config && typeof raw.config === 'object' ? raw.config : {};

  let statuses = (Array.isArray(c.statuses) ? c.statuses : []).map((s) => ({
    id: str(s && s.id) || uid(),
    label: str(s && s.label) || 'Status',
    kind: KINDS.some((k) => k.id === (s && s.kind)) ? s.kind : 'ontrack',
    color: HEX.test(str(s && s.color)) ? s.color : '#8e9aa0',
  }));
  if (!statuses.length) statuses = defaultStatuses();

  let workstreams = (Array.isArray(c.workstreams) ? c.workstreams : []).map((w) => ({
    id: str(w && w.id) || uid(),
    name: str(w && w.name) || 'Workstream',
    group: str(w && w.group),
    summary: str(w && w.summary),
    outlook: str(w && w.outlook),
  }));
  if (!workstreams.length) workstreams = defaultWorkstreams();

  const fields = (Array.isArray(c.fields) ? c.fields : []).map((f) => ({
    id: str(f && f.id) || uid(),
    name: str(f && f.name) || 'Field',
    type: FIELD_TYPES.some((t) => t.id === (f && f.type)) ? f.type : 'text',
    options: Array.isArray(f && f.options) ? f.options.map(str).filter(Boolean) : [],
  }));

  let deciders = (Array.isArray(c.deciders) ? c.deciders : defaultDeciders()).map((d) => ({
    id: str(d && d.id) || uid(),
    label: str(d && d.label) || 'Decision maker',
    color: HEX.test(str(d && d.color)) ? d.color : '#4f008c',
  }));
  const dLabel = new Map(deciders.map((d) => [d.id, d.label]));
  const wsIds = new Set(workstreams.map((w) => w.id));
  const stIds = new Set(statuses.map((s) => s.id));
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((x) => x && typeof x === 'object').map((x) => {
    let wsId = str(x.ws);
    if (!wsIds.has(wsId)) {
      let un = workstreams.find((w) => w.id === '_unassigned');
      if (!un) { un = { id: '_unassigned', name: 'Unassigned', group: '', summary: '', outlook: '' }; workstreams.push(un); wsIds.add(un.id); }
      wsId = un.id;
    }
    const dec = x.decision && typeof x.decision === 'object' ? x.decision : {};
    const custom = {};
    if (x.custom && typeof x.custom === 'object') for (const k of Object.keys(x.custom)) custom[k] = str(x.custom[k]);
    return {
      id: str(x.id) || uid(),
      ws: wsId,
      title: str(x.title),
      status: stIds.has(x.status) ? x.status : statuses[0].id,
      update: str(x.update), updateDate: parseISO(x.updateDate) != null ? x.updateDate : '',
      nextStep: str(x.nextStep), nextDate: parseISO(x.nextDate) != null ? x.nextDate : '',
      targetDate: parseISO(x.targetDate) != null ? x.targetDate : '',
      challenge: str(x.challenge),
      decision: { needed: dec.needed === true, text: str(dec.text), by: dLabel.has(dec.by) ? dLabel.get(dec.by) : str(dec.by).slice(0, 60) },
      custom,
      history: (Array.isArray(x.history) ? x.history : []).filter((e) => e && parseISO(e.date) != null)
        .map((e) => ({ date: e.date, status: stIds.has(e.status) ? e.status : '', text: str(e.text) })),
      created: parseISO(x.created) != null ? x.created : todayISO(),
    };
  });
  return { format: FORMAT, version: VERSION, meta, config: { statuses, workstreams, fields, deciders }, items };
}

/* =====================================================================
   State and saving. Everything stays on this computer:
   the browser's own storage plus the file the user picks.
   ===================================================================== */
function readCloud() {
  try {
    const el = $('#cloud-config');
    const c = JSON.parse((el && el.textContent || '').trim() || 'null');
    if (c && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(str(c.url)) && str(c.key).length > 20) return { url: c.url, key: c.key };
  } catch (e) { /* offline build */ }
  return null;
}
const CLOUD = readCloud();
let state;
let TODAY = todayISO();
const ui = { edit: false, open: new Set(), dirty: false, fileName: '', handle: null, restored: false, allUpcoming: false, chgOpen: false, hideSample: false, sync: 'saved', notice: null };

function persistLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ state, dirty: ui.dirty, seed: seedKey() })); } catch (e) { /* storage unavailable */ }
}
function seedKey() {
  const el = $('#tracker-data');
  const t = el ? (el.textContent || '').trim() : '';
  let x = 5381;
  for (let i = 0; i < t.length; i++) x = ((x * 33) ^ t.charCodeAt(i)) >>> 0;
  return t.length + ':' + x;
}
function readSeed() {
  const el = $('#tracker-data');
  try {
    const t = (el && el.textContent || '').trim();
    if (!t || t === 'null') return null;
    return normalize(JSON.parse(t));
  } catch (e) { return null; }
}
function loadInitial() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (raw && raw.state && raw.dirty === true && raw.seed === seedKey()) {
      ui.dirty = true;
      ui.restored = true;
      return normalize(raw.state);
    }
  } catch (e) { /* ignore a damaged draft */ }
  ui.dirty = false;
  return readSeed() || sampleData();
}
function mutate(fn) {
  fn();
  state.meta.updated = todayISO();
  if (CLOUD) { schedulePush(0); render(); return; }
  ui.dirty = true;
  persistLocal();
  render();
}
function quietSet(fn) {
  fn();
  state.meta.updated = todayISO();
  if (CLOUD) { schedulePush(700); return; }
  ui.dirty = true;
  persistLocal();
  const s = $('#savestate');
  if (s) { s.textContent = saveText(); s.className = 'savestate dirty'; }
}
function saveText() {
  if (CLOUD) return ui.sync === 'saving' ? 'Saving...' : ui.sync === 'error' ? 'Not saved' : 'All changes saved';
  return ui.dirty ? 'Unsaved changes' : 'All changes saved';
}
function showSaveState() {
  const s = $('#savestate');
  if (s) { s.textContent = saveText(); s.className = 'savestate' + (ui.sync === 'saved' ? '' : ' dirty'); }
}

const FILE_TYPES = [{ description: 'Tracker page (HTML)', accept: { 'text/html': ['.html', '.htm'] } }];
const DEFAULT_FILE = 'cloud-tracker.html';
let PRISTINE = '';

function download(text, name, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'text/html' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// The data lives inside this page, in one JSON block. Saving writes a copy of the page with the new data in that block.
function buildPage() {
  const m = /<script[^>]*id="tracker-data"[^>]*>/.exec(PRISTINE);
  if (!m) throw new Error('Could not find the data block in this page.');
  const start = m.index + m[0].length;
  const end = PRISTINE.indexOf('<' + '/script>', start);
  const json = JSON.stringify(state).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return PRISTINE.slice(0, start) + json + PRISTINE.slice(end);
}
function importText(text, name) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON.'); }
  state = normalize(parsed);
  ui.open.clear();
  if (CLOUD) {
    schedulePush(0);
    render();
    toast('Imported ' + (name || 'file') + '. It replaces what is saved online.');
    return;
  }
  ui.dirty = true;
  persistLocal();
  render();
  toast('Imported ' + (name || 'file') + '. Click Save to keep it in this page.');
}
async function saveFile(forceNew) {
  let text;
  try { text = buildPage(); } catch (e) { toast(e.message); return; }
  try {
    if (window.showSaveFilePicker) {
      if (!ui.handle || forceNew) {
        ui.handle = await window.showSaveFilePicker({ suggestedName: ui.fileName || DEFAULT_FILE, types: FILE_TYPES });
      } else if (ui.handle.requestPermission) {
        const perm = await ui.handle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw new Error('no permission to write to the file');
      }
      const w = await ui.handle.createWritable();
      await w.write(text);
      await w.close();
      ui.fileName = ui.handle.name;
      saveHandle(ui.handle);
      ui.dirty = false;
      persistLocal();
      render();
      toast('Saved to ' + ui.fileName);
    } else {
      download(text, DEFAULT_FILE);
      ui.dirty = false;
      persistLocal();
      render();
      toast('Downloaded ' + DEFAULT_FILE + '. Use it in place of the old copy.');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    ui.handle = null;
    download(text, DEFAULT_FILE);
    ui.dirty = false;
    persistLocal();
    render();
    toast('Could not write to the file directly (' + e.message + '). Downloaded a copy instead.');
  }
}

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('cloudTracker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveHandle(handle) {
  try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(handle, 'handle'); } catch (e) { /* not supported */ }
}
async function loadHandle() {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const q = db.transaction('kv').objectStore('kv').get('handle');
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  } catch (e) { return null; }
}

/* =====================================================================
   Shared mode. Supabase over fetch (login + REST). Row Level Security on
   the server decides who can read and write; the key in this page is public.
   Each topic is one row with a revision number. A save only goes through
   if the revision is still the one this page loaded, so two people editing
   the same topic cannot silently overwrite each other.
   ===================================================================== */
const cloud = { me: null, pending: 0, session: null, base: null, revs: new Map(), cfgRev: 0, sig: '', timer: null, queue: Promise.resolve(), stale: false, poll: null };

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
    if (s && s.access_token && s.refresh_token) cloud.session = s;
  } catch (e) { /* storage unavailable */ }
}
function storeSession() {
  try {
    if (cloud.session) localStorage.setItem(LS_SESSION, JSON.stringify(cloud.session));
    else localStorage.removeItem(LS_SESSION);
  } catch (e) { /* storage unavailable */ }
}
function takeSession(j) {
  cloud.session = {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    email: str(j.user && j.user.email) || (cloud.session && cloud.session.email) || '',
  };
  storeSession();
}
async function authCall(grant, body) {
  const r = await fetch(CLOUD.url + '/auth/v1/token?grant_type=' + grant, {
    method: 'POST', headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}
function authMsg(j) {
  const c = j.error_code || '';
  if (c === 'invalid_credentials') return 'Wrong email or password.';
  if (c === 'signup_disabled') return 'Sign up is closed.';
  if (c === 'user_already_exists') return 'This email already has an account. Use Sign in.';
  if (c === 'weak_password') return 'Choose a stronger password, at least 8 characters.';
  if (c === 'email_not_confirmed') return 'Confirm your email first. Check your inbox.';
  if (c === 'same_password') return 'Choose a different password.';
  if (/rate_limit/.test(c)) return 'Too many tries. Wait a few minutes and try again.';
  return j.msg || j.error_description || 'Something went wrong.';
}
async function authReq(path, method, body, token) {
  const hd = { apikey: CLOUD.key, 'Content-Type': 'application/json' };
  if (token) hd.Authorization = 'Bearer ' + token;
  let r;
  try { r = await fetch(CLOUD.url + '/auth/v1/' + path, { method, headers: hd, body: JSON.stringify(body) }); } catch (e) { throw new Error('No connection.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(authMsg(j));
  return j;
}
const backHere = () => '?redirect_to=' + encodeURIComponent(location.origin + location.pathname);
function jwtSub(t) {
  try { return JSON.parse(atob(str(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch (e) { return ''; }
}
async function signIn(email, password) {
  const j = await authReq('token?grant_type=password', 'POST', { email, password });
  takeSession(j);
}
// Links in confirmation and reset emails come back to this page with the session in the address.
function takeHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.get('access_token') && !p.get('error_description')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (p.get('error_description')) return { error: 'This link is not valid any more. Ask for a new one.' };
  takeSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600 });
  return { type: p.get('type') };
}
let refreshing = null;
function refreshSession() {
  if (!cloud.session) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = authCall('refresh_token', { refresh_token: cloud.session.refresh_token })
      .then(({ ok, j }) => { if (ok) { takeSession(j); return true; } cloud.session = null; storeSession(); return false; })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}
async function api(path, o) {
  o = o || {};
  if (cloud.session && cloud.session.expires_at - Date.now() / 1000 < 60) await refreshSession();
  if (!cloud.session) { const e = new Error('Signed out.'); e.auth = true; throw e; }
  const go = () => {
    const hd = { apikey: CLOUD.key, Authorization: 'Bearer ' + cloud.session.access_token };
    if (o.body !== undefined) hd['Content-Type'] = 'application/json';
    if (o.prefer) hd.Prefer = o.prefer;
    return fetch(CLOUD.url + '/rest/v1/' + path, { method: o.method || 'GET', headers: hd, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  };
  let r = await go();
  if (r.status === 401 && await refreshSession()) r = await go();
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
  if (r.status === 401 || !cloud.session) { const e = new Error('Signed out.'); e.auth = true; throw e; }
  if (!r.ok) {
    const e = new Error((j && j.message) || 'Request failed (' + r.status + ')');
    e.conflict = r.status === 409;
    throw e;
  }
  return j;
}
const eq = (v) => 'eq.' + encodeURIComponent(v);

async function fetchRemote() {
  const [c, t] = await Promise.all([
    api('config?select=data,rev,updated_at&id=eq.1'),
    api('topics?select=id,data,rev,updated_at&order=created_at.asc,id.asc')]);
  if (!c || !c[0]) throw new Error('The shared settings are missing on the server.');
  return { cfg: c[0], rows: t || [] };
}
const sigOf = (cfgRev, rows) => cfgRev + '|' + rows.map((r) => r.id + ':' + r.rev).join(',');
function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function snapshot() {
  const m = Object.assign({}, state.meta);
  delete m.updated;
  return { cfg: JSON.stringify({ meta: m, config: state.config }), items: new Map(state.items.map((i) => [i.id, JSON.stringify(i)])) };
}
function applyRemote(rem) {
  const d = rem.cfg.data && typeof rem.cfg.data === 'object' ? rem.cfg.data : {};
  state = normalize({ format: FORMAT, version: VERSION, meta: d.meta, config: d.config,
    items: rem.rows.map((r) => Object.assign({}, r.data, { id: r.id })) });
  let last = str(rem.cfg.updated_at);
  for (const r of rem.rows) if (str(r.updated_at) > last) last = str(r.updated_at);
  state.meta.updated = last ? isoOf(new Date(last)) : todayISO();
  state.meta.sample = false;
  cloud.revs = new Map(rem.rows.map((r) => [r.id, r.rev]));
  cloud.cfgRev = rem.cfg.rev;
  cloud.sig = sigOf(rem.cfg.rev, rem.rows);
  cloud.base = snapshot();
  cloud.stale = false;
  ui.sync = 'saved';
  ui.notice = null;
}

function schedulePush(delay) {
  ui.sync = 'saving';
  ui.notice = null;
  showSaveState();
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(() => { cloud.queue = cloud.queue.then(pushAll); }, delay);
}
function diffOps(cur, base) {
  const ops = [];
  if (cur.cfg !== base.cfg) ops.push({ t: 'cfg', js: cur.cfg });
  for (const [id, js] of cur.items) {
    if (!base.items.has(id)) ops.push({ t: 'new', id, js });
    else if (base.items.get(id) !== js) ops.push({ t: 'upd', id, js });
  }
  for (const id of base.items.keys()) if (!cur.items.has(id)) ops.push({ t: 'del', id });
  return ops;
}
async function pushOne(op) {
  const rep = 'return=representation';
  const lost = () => { const e = new Error('Someone else changed this.'); e.conflict = true; return e; };
  if (op.t === 'cfg') {
    const rows = await api('config?id=eq.1&rev=' + eq(cloud.cfgRev), { method: 'PATCH', prefer: rep, body: { data: JSON.parse(op.js) } });
    if (!rows || !rows.length) throw lost();
    cloud.cfgRev = rows[0].rev;
    cloud.base.cfg = op.js;
  } else if (op.t === 'new') {
    const rows = await api('topics', { method: 'POST', prefer: rep, body: { id: op.id, data: JSON.parse(op.js) } });
    cloud.revs.set(op.id, rows[0].rev);
    cloud.base.items.set(op.id, op.js);
  } else if (op.t === 'upd') {
    const rows = await api('topics?id=' + eq(op.id) + '&rev=' + eq(cloud.revs.get(op.id)), { method: 'PATCH', prefer: rep, body: { data: JSON.parse(op.js) } });
    if (!rows || !rows.length) throw lost();
    cloud.revs.set(op.id, rows[0].rev);
    cloud.base.items.set(op.id, op.js);
  } else {
    const rows = await api('topics?id=' + eq(op.id) + '&rev=' + eq(cloud.revs.get(op.id)), { method: 'DELETE', prefer: rep });
    if (!rows || !rows.length) throw lost();
    cloud.revs.delete(op.id);
    cloud.base.items.delete(op.id);
  }
}
async function pushAll() {
  if (cloud.stale || !cloud.session) return;
  try {
    for (;;) {
      const ops = diffOps(snapshot(), cloud.base);
      if (!ops.length) break;
      for (const op of ops) await pushOne(op);
    }
  } catch (e) {
    if (e.auth) { showLogin('Your session ended. Sign in again.'); return; }
    ui.sync = 'error';
    if (e.conflict) { cloud.stale = true; ui.notice = { kind: 'conflict' }; }
    else ui.notice = { kind: 'error', msg: e.message };
    renderBanners();
    showSaveState();
    return;
  }
  ui.sync = 'saved';
  ui.notice = null;
  renderBanners();
  showSaveState();
}
async function reloadRemote() {
  try {
    applyRemote(await fetchRemote());
    render();
    toast('Loaded the latest version.');
  } catch (e) {
    if (e.auth) showLogin('Your session ended. Sign in again.');
    else toast('Could not reload: ' + e.message);
  }
}

async function pollOnce() {
  if (!cloud.session || cloud.stale || ui.sync !== 'saved' || document.hidden || $('#dlg').open) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  try {
    refreshPending().catch(() => {});
    const [c, t] = await Promise.all([api('config?select=rev&id=eq.1'), api('topics?select=id,rev&order=created_at.asc,id.asc')]);
    if (!c || !c[0] || sigOf(c[0].rev, t || []) === cloud.sig) return;
    const rem = await fetchRemote();
    if (ui.sync !== 'saved' || $('#dlg').open) return;
    applyRemote(rem);
    render();
    toast('Someone changed the tracker. Showing the latest.');
  } catch (e) {
    if (e.auth) showLogin('Your session ended. Sign in again.');
  }
}
function startPoll() {
  clearInterval(cloud.poll);
  cloud.poll = setInterval(pollOnce, POLL_MS);
}

function authShell(title, sub) {
  clearInterval(cloud.poll);
  clearTimeout(cloud.timer);
  ui.edit = false;
  document.title = title;
  $('#editbar').replaceChildren();
  $('#banners').replaceChildren();
  $('#top').replaceChildren(h('div', { class: 'top-in' }, h('h1', { text: title }), sub ? h('p', { class: 'sub', text: sub }) : null));
}
const showLogin = (msg) => showAuth('in', msg);
function showAuth(mode, msg, info) {
  const T = { in: ['Sign in', 'Sign in'], up: ['Create account', 'Create account'] }[mode];
  authShell(T[0], mode === 'up' ? 'An admin approves new accounts before they can see the tracker.' : '');
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'username', required: true, dir: 'ltr' });
  const pw = h('input', { type: 'password', name: 'password', autocomplete: mode === 'in' ? 'current-password' : 'new-password',
    required: true, minlength: mode === 'in' ? null : '8', dir: 'ltr' });
  const err = h('div', { class: 'err', role: 'alert', text: msg || '' });
  const ok = h('div', { class: 'ok', role: 'status', text: info || '' });
  const go = btn(T[1], null, 'primary', { type: 'submit' });
  const to = (label, m) => btn(label, () => showAuth(m), 'small link');
  const form = h('form', { class: 'login', onsubmit: async (e) => {
    e.preventDefault();
    go.disabled = true;
    err.textContent = '';
    ok.textContent = '';
    try {
      const em = email.value.trim();
      if (mode === 'in') { await signIn(em, pw.value); await enter(); }
      else if (mode === 'up') {
        const j = await authReq('signup' + backHere(), 'POST', { email: em, password: pw.value });
        if (j.access_token) { takeSession(j); await enter(); }
        else showAuth('in', '', 'Check your email and click the link to confirm it. Then sign in.');
      }
    } catch (x) {
      err.textContent = x.message;
      go.disabled = false;
      pw.value = '';
      pw.focus();
    }
  } },
  fld('Email', email),
  fld('Password', pw),
  mode === 'up' ? h('p', { class: 'hint-s', text: 'At least 8 characters. You can change it later in Settings.' }) : null,
  h('div', { class: 'login-f' }, go, mode === 'in' ? to('Create account', 'up') : to('Back to sign in', 'in')),
  ok, err);
  $('#page').replaceChildren(h('section', { class: 'panel login-p' }, form));
  email.focus();
}
function showPending(email) {
  authShell('Waiting for approval', '');
  $('#page').replaceChildren(h('section', { class: 'panel login-p' },
    h('p', { class: 'pend', text: 'Your account is ready' + (email ? ' (' + email + ')' : '') + '. An admin has to approve it before you can see the tracker.' }),
    h('div', { class: 'login-f' },
      btn('Check again', async () => { try { await enter(); } catch (e) { toast(e.message); } }, 'primary'),
      btn('Sign out', signOut, 'small link'))));
}
async function fetchMe() {
  const rows = await api('members?select=user_id,email,approved,is_admin&user_id=eq.' + encodeURIComponent(jwtSub(cloud.session && cloud.session.access_token)));
  return rows && rows[0] || null;
}
async function refreshPending() {
  if (!cloud.me || !cloud.me.is_admin) { cloud.pending = 0; return; }
  const rows = await api('members?select=user_id&approved=eq.false');
  const n = rows ? rows.length : 0;
  if (n !== cloud.pending) { cloud.pending = n; renderBanners(); }
}
async function enter() {
  try {
    cloud.me = await fetchMe();
    if (!cloud.me || !cloud.me.approved) { showPending(cloud.me && cloud.me.email); return; }
    applyRemote(await fetchRemote());
    cloud.pending = 0;
    await refreshPending().catch(() => {});
  } catch (e) {
    if (e.auth) { showLogin('Your session ended. Sign in again.'); return; }
    throw new Error('Could not load the tracker: ' + e.message);
  }
  render();
  startPoll();
}
function signOut() {
  if (ui.sync !== 'saved') { toast('Wait until your changes are saved.'); return; }
  const tok = cloud.session && cloud.session.access_token;
  cloud.session = null;
  storeSession();
  state = emptyData();
  if (tok) fetch(CLOUD.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + tok } }).catch(() => {});
  showLogin();
}

/* =====================================================================
   Calculations
   ===================================================================== */
const statusById = (id) => state.config.statuses.find((s) => s.id === id) || state.config.statuses[0];
const wsById = (id) => state.config.workstreams.find((w) => w.id === id);
const kindOf = (it) => statusById(it.status).kind;
const isActive = (it) => kindOf(it) !== 'done';
function overdueDays(it) {
  if (!isActive(it) || !it.nextDate) return 0;
  const d = diffDays(TODAY, it.nextDate);
  return d < 0 ? -d : 0;
}
function targetPassed(it) { return isActive(it) && it.targetDate && diffDays(TODAY, it.targetDate) < 0; }
function sortItems(list) {
  return list.slice().sort((a, b) =>
    (KIND_RANK[kindOf(a)] - KIND_RANK[kindOf(b)]) ||
    ((a.nextDate || '9999') < (b.nextDate || '9999') ? -1 : (a.nextDate || '9999') > (b.nextDate || '9999') ? 1 : 0));
}
function countsFor(items) {
  return state.config.statuses.map((s) => ({ s, n: items.filter((i) => i.status === s.id).length }));
}

/* =====================================================================
   View parts
   ===================================================================== */
const ICONS = {
  ontrack: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="currentColor"/></svg>',
  risk: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.9 16.6 15.6H1.4z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 6.8v4" style="stroke:var(--g)" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="13" r="1" style="fill:var(--g)"/></svg>',
  blocked: '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="1.6" y="1.6" width="14.8" height="14.8" rx="3.4" fill="currentColor"/><path d="M6 6l6 6M12 6l-6 6" style="stroke:var(--g)" stroke-width="1.9" stroke-linecap="round"/></svg>',
  done: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="currentColor"/><path d="M5.3 9.3 8 12l4.8-5.8" fill="none" style="stroke:var(--g)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  notstarted: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};
function icon(status) {
  const s = typeof status === 'string' ? statusById(status) : status;
  const el = h('span', { class: 'si', vars: { color: s.color, '--g': inkOn(s.color) } });
  el.innerHTML = ICONS[s.kind] || ICONS.ontrack; // static markup from this file, never user data
  return el;
}
// The "decision from" tag is one quiet color. It only turns to the attention color when the topic itself is urgent.
const urgent = (it) => isActive(it) && (['risk', 'blocked'].includes(kindOf(it)) || overdueDays(it) > 0 || targetPassed(it));
function dtag(it, short) {
  const name = (it.decision.by || '').trim();
  const hot = urgent(it);
  return h('span', { class: 'dtag' + (hot ? ' hot' : ''), text: name ? (short ? name : 'Decision: ' + name) : 'Decision needed' });
}
function pill(status) {
  const s = typeof status === 'string' ? statusById(status) : status;
  const p = h('span', { class: 'pill', vars: { '--c': s.color } }, icon(s), s.label);
  return p;
}

function segBar(counts, tall, label) {
  const total = counts.reduce((a, c) => a + c.n, 0);
  const bar = h('div', { class: 'seg ' + (tall ? 'tall' : 'thin'), role: 'img',
    'aria-label': label + ': ' + counts.filter((c) => c.n).map((c) => c.s.label + ' ' + c.n).join(', ') });
  if (!total) { bar.append(h('div', { class: 'seg-empty' })); return bar; }
  for (const c of counts) {
    if (!c.n) continue;
    const pct = Math.round((c.n / total) * 100);
    const part = h('div', { class: 'seg-part', 'data-tip': c.s.label + ': ' + c.n + ' (' + pct + '%)' });
    part.style.flex = c.n + ' 1 0';
    part.style.background = c.s.color;
    part.style.color = inkOn(c.s.color);
    if (tall && c.n / total >= 0.06) part.append(String(c.n));
    bar.append(part);
  }
  return bar;
}
function legend(counts) {
  return h('ul', { class: 'legend' }, counts.filter((c) => c.n).map((c) => h('li', {}, icon(c.s), c.s.label)));
}
function countText(items) {
  const att = items.filter((i) => isActive(i) && ['risk', 'blocked'].includes(kindOf(i))).length;
  if (!items.length) return h('span', { class: 'ws-count', text: 'No topics' });
  return h('span', { class: 'ws-count', text: topics(items.length) + (att ? ', ' + att + ' need attention' : '') });
}
function readLogo(file, done) {
  if (!file) return;
  if (file.size > 300 * 1024) { toast('The logo must be under 300 KB.'); return; }
  const r = new FileReader();
  r.onload = () => {
    const v = String(r.result);
    if (!LOGO_RE.test(v)) { toast('Use a PNG, JPG, SVG or WebP image.'); return; }
    done(v);
  };
  r.readAsDataURL(file);
}
function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  const t = h('div', { class: 'toast', role: 'status', text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 3800);
}
function confirmBtn(label, sure, fn, cls) {
  const b = h('button', { class: cls || 'btn', type: 'button', text: label });
  let armed = false, t;
  b.addEventListener('click', () => {
    if (!armed) {
      armed = true; b.textContent = sure;
      clearTimeout(t); t = setTimeout(() => { armed = false; b.textContent = label; }, 4000);
    } else { clearTimeout(t); fn(); }
  });
  return b;
}
function track(d, key) {
  d.open = ui.open.has(key);
  d.dataset.key = key;
  d.addEventListener('toggle', () => { if (d.open) ui.open.add(key); else ui.open.delete(key); });
}
function btn(label, fn, cls, extra) {
  return h('button', Object.assign({ class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', text: label, onclick: fn }, extra || {}));
}
function tbtn(label, fn) { return h('button', { class: 'tbtn', type: 'button', text: label, onclick: fn }); }

/* =====================================================================
   Rendering
   ===================================================================== */
function render() {
  const y = window.scrollY;
  TODAY = todayISO();
  document.title = state.meta.title || 'Tracker';
  renderEditBar();
  renderBanners();
  renderTop();
  renderPage();
  window.scrollTo(0, y);
}

function renderEditBar() {
  const box = $('#editbar');
  if (!ui.edit) { box.replaceChildren(); return; }
  box.replaceChildren(h('div', { class: 'editbar' }, h('div', { class: 'editbar-in' },
    h('span', { class: 'badge', text: 'Editing' }),
    h('span', { class: 'savestate' + ((CLOUD ? ui.sync !== 'saved' : ui.dirty) ? ' dirty' : ''), id: 'savestate', text: saveText() }),
    h('span', { class: 'grow' }),
    btn('Add topic', () => openItem(null)),
    btn('Settings', openSettings),
    CLOUD ? null : btn('Save', () => saveFile(false), 'primary'),
    btn('Done', () => { ui.edit = false; render(); }))));
}

function renderBanners() {
  const out = [];
  const note = (text, ...acts) => h('div', { class: 'banner warn' }, h('div', { class: 'banner-in' }, h('span', { text }), ...acts));
  if (CLOUD && cloud.pending) {
    out.push(note(cloud.pending + (cloud.pending === 1 ? ' person is' : ' people are') + ' waiting for your approval.',
      btn('Review', openSettings, 'small primary')));
  }
  if (CLOUD && ui.notice) {
    if (ui.notice.kind === 'conflict') {
      out.push(note('Someone else changed this while you were editing, so your change was not saved. Reload to see their version.',
        btn('Reload', reloadRemote, 'small primary')));
    } else {
      out.push(note('Could not save: ' + ui.notice.msg, btn('Try again', () => schedulePush(0), 'small'), btn('Reload', reloadRemote, 'small link')));
    }
  }
  if (state.meta.sample && !ui.hideSample) {
    out.push(h('div', { class: 'banner' }, h('div', { class: 'banner-in' },
      h('span', { text: 'This is sample data so you can see the layout. Clear it when you are ready to add real topics.' }),
      confirmBtn('Clear examples', 'Click again to confirm', clearAll, 'btn small'),
      btn('Hide', () => { ui.hideSample = true; renderBanners(); }, 'small link'))));
  }
  $('#banners').replaceChildren(...out);
}

function renderTop() {
  const m = state.meta;
  const top = $('#top');
  const actions = h('div', { class: 'top-actions' });
  if (!ui.edit) {
    if (!CLOUD && ui.dirty) actions.append(tbtn('Save', () => saveFile(false)));
    actions.append(tbtn('Edit', () => { ui.edit = true; render(); }));
  }
  if (CLOUD) actions.append(tbtn('Sign out', signOut));
  const inner = h('div', { class: 'top-in' },
    h('div', { class: 'brandrow' },
      m.logo ? h('img', { class: 'logo', src: m.logo, alt: '' })
        : m.brand ? h('div', { class: 'brand-tag' }, m.brand, m.brandSub ? h('i') : null, m.brandSub ? h('span', { text: m.brandSub }) : null) : null,
      actions),
    h('h1', { text: m.title, dir: 'auto' }),
    m.subtitle ? h('p', { class: 'sub', text: m.subtitle, dir: 'auto' }) : null,
    h('p', { class: 'dates' },
      h('span', { text: 'Updated ' + fmtDate(m.updated) }),
      null));
  if (ui.edit) {
    const ta = h('textarea', { class: 'in', rows: 3, dir: 'auto', value: m.summary, placeholder: 'A short summary for the GM: what is on track, what is stuck, what you need from leadership' });
    ta.addEventListener('input', () => quietSet(() => { state.meta.summary = ta.value; }));
    inner.append(h('label', { class: 'fld edit-only' }, h('span', { text: 'Summary (shown under the title)' }), ta));
  } else if (m.summary) {
    inner.append(h('p', { class: 'exec-summary', text: m.summary, dir: 'auto' }));
  }
  top.replaceChildren(inner);
}

function renderPage() {
  const frag = document.createDocumentFragment();
  if (state.items.length) frag.append(overviewPanel());
  else frag.append(h('div', { class: 'empty', text: 'No topics yet. Click Edit at the top, then add your first topic under any workstream.' }));
  if (state.items.length) frag.append(boardSection());
  if (state.items.length) { const nx = nextSection(); if (nx) frag.append(nx); frag.append(challengesSection()); }
  frag.append(h('h2', { class: 'part', text: 'Topics' }));
  for (const g of workstreamSections()) frag.append(g);
  $('#page').replaceChildren(frag);
}

function overviewPanel() {
  const total = state.items.length;
  const counts = countsFor(state.items);
  return h('section', { class: 'panel overview' },
    h('div', { class: 'ov-head' }, h('h2', { text: 'Overall status' }), h('span', { class: 'ov-count', text: topics(total) })),
    segBar(counts, true, 'Status breakdown'),
    legend(counts));
}
function boardRow(ws) {
  const items = state.items.filter((i) => i.ws === ws.id);
  const act = items.filter(isActive);
  let lead = sortItems(act)[0];
  const st = lead ? statusById(lead.status) : items.length ? statusById(items[0].status) : state.config.statuses.find((x) => x.kind === 'notstarted') || state.config.statuses[0];
  const nexts = act.filter((i) => i.nextDate).map((i) => i.nextDate).sort();
  const nx = nexts[0];
  const late = nx && diffDays(TODAY, nx) < 0;
  const att = act.filter((i) => ['risk', 'blocked'].includes(kindOf(i))).length;
  const a = h('a', { class: 'brow', href: '#ws-' + ws.id, onclick: (e) => { e.preventDefault(); const el = document.getElementById('ws-' + ws.id); if (el) el.scrollIntoView({ block: 'start' }); } },
    icon(st),
    h('span', { class: 'nm', dir: 'auto', text: ws.name }),
    segBar(countsFor(items), false, ws.name),
    h('span', { class: 'bc', text: items.length ? topics(items.length) : 'No topics' }),
    h('span', { class: 'bn' + (late ? ' late' : ''), text: nx ? (late ? 'Overdue ' : 'Due ') + fmtDate(nx) : 'No date' }));
  return a;
}
function boardSection() {
  const all = state.config.workstreams;
  const seen = new Set();
  const box = h('div', { class: 'panel board' });
  for (const ws of all) {
    if (ws.group) {
      if (seen.has(ws.group)) continue;
      seen.add(ws.group);
      box.append(h('div', { class: 'bgroup', dir: 'auto', text: ws.group }));
      for (const m of all.filter((w) => w.group === ws.group)) box.append(boardRow(m));
    } else {
      box.append(boardRow(ws));
    }
  }
  return h('section', { class: 'sec', id: 'board' },
    h('h2', { text: 'Where each workstream stands' }),
    box);
}
function calendar(events) {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = {};
  for (const e of events) (byDay[e.date] = byDay[e.date] || []).push(e);
  const dates = events.map((e) => e.date).concat([TODAY]).sort();
  const first = dates[0], last = dates[dates.length - 1];
  const wd = (iso) => new Date(parseISO(iso)).getUTCDay();
  let start = addDays(first, -wd(first));
  let end = addDays(last, 6 - wd(last));
  if (diffDays(start, end) > 7 * 6 - 1) end = addDays(start, 7 * 6 - 1);
  const cells = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const t = new Date(parseISO(day)), n = t.getUTCDate();
    const list = byDay[day] || [];
    const label = n === 1 || day === start ? MONTHS[t.getUTCMonth()] + ' ' + n : String(n);
    const cell = h(list.length ? 'button' : 'div', { class: 'cal-c' + (day === TODAY ? ' today' : '') + (list.length ? ' has' : '') + (day < TODAY ? ' past' : ''),
      type: list.length ? 'button' : null, onclick: list.length ? () => jumpTo(list[0].it.id) : null,
      'aria-label': fmtDate(day) + (list.length ? ': ' + list.map((e) => (e.target ? 'Target: ' : '') + ttl(e.it)).join(', ') : '') },
      h('span', { class: 'cal-n', text: label }),
      list.length ? h('span', { class: 'cal-dots' }, list.slice(0, 4).map((e) => h('i', { class: e.target ? 'tg' : null, vars: { '--c': statusById(e.it.status).color } }))) : null);
    cells.push(cell);
  }
  return h('div', { class: 'cal' },
    h('div', { class: 'cal-h' }, WD.map((x) => h('span', { text: x }))),
    h('div', { class: 'cal-g' }, cells));
}

// Each topic can put two dates on the calendar: the action date and the target date.
function nextSection() {
  const act = state.items.filter(isActive);
  const events = [];
  for (const it of act) {
    if (it.nextDate) events.push({ it, date: it.nextDate, target: false });
    if (it.targetDate && it.targetDate !== it.nextDate) events.push({ it, date: it.targetDate, target: true });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!events.length) return null;
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // One row per topic, sorted by its first date. The target date is shown inside the date cell.
  const topicsDated = act.filter((it) => it.nextDate || it.targetDate)
    .sort((a, b) => ((a.nextDate || a.targetDate) < (b.nextDate || b.targetDate) ? -1 : (a.nextDate || a.targetDate) > (b.nextDate || b.targetDate) ? 1 : 0));
  const rows = topicsDated.map((it) => {
    const st = statusById(it.status), w = wsById(it.ws);
    const main = it.nextDate || it.targetDate;
    const n = diffDays(TODAY, main);
    const t = new Date(parseISO(main));
    const rel = n < 0 ? 'Overdue ' + days(-n) : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In ' + days(n);
    const tgLate = it.targetDate && diffDays(TODAY, it.targetDate) < 0;
    return h('tr', { class: 'at-r' + (n < 0 ? ' late' : ''), vars: { '--c': st.color }, tabindex: '0', onclick: () => jumpTo(it.id),
      onkeydown: (ev2) => { if (ev2.key === 'Enter') jumpTo(it.id); } },
      h('td', { class: 'at-d' }, h('b', { text: t.getUTCDate() + ' ' + MONTHS[t.getUTCMonth()] + (t.getUTCFullYear() !== new Date().getFullYear() ? ' ' + t.getUTCFullYear() : '') }),
        h('span', { text: ' ' + WD[t.getUTCDay()] }), h('em', { text: rel }),
        it.nextDate && it.targetDate ? h('small', { class: 'at-tg' + (tgLate ? ' late' : ''), text: 'Target ' + fmtDate(it.targetDate) })
          : !it.nextDate ? h('small', { class: 'at-tg' + (tgLate ? ' late' : ''), text: 'Target date' }) : null),
      h('td', { class: 'at-t' }, h('i', { dir: 'auto', text: w ? (w.group ? w.group + ': ' : '') + w.name : '' }), it.title ? h('b', { dir: 'auto', text: it.title }) : null),
      h('td', { class: 'at-a', dir: 'auto' }, it.nextStep ? it.nextStep : h('span', { class: 'at-none', text: '-' })),
      h('td', { class: 'at-s' }, pill(st)),
      h('td', { class: 'at-x' }, it.decision.needed ? dtag(it, true) : h('span', { class: 'at-none', text: '-' })),
      h('td', { class: 'at-c', dir: 'auto' }, it.challenge ? it.challenge : h('span', { class: 'at-none', text: '-' })));
  });
  const miss = act.filter((it) => !it.nextDate && !it.targetDate).length;
  return h('section', { class: 'sec', id: 'next' },
    h('h2', { text: 'Actions required' }),
    h('div', { class: 'panel cal-p' }, calendar(events),
      h('p', { class: 'cal-key' }, h('i'), ' Action date', h('i', { class: 'tg' }), ' Target date')),
    h('div', { class: 'panel rm' },
      h('table', { class: 'at' },
        h('thead', {}, h('tr', {}, ['Date', 'Topic', 'Action required', 'Status', 'Decision from', 'Challenge'].map((x) => h('th', { scope: 'col', text: x })))),
        h('tbody', {}, rows)),
      miss ? h('p', { class: 'chart-note', text: miss + (miss === 1 ? ' topic has' : ' topics have') + ' no date yet, so ' + (miss === 1 ? 'it is' : 'they are') + ' not shown here.' }) : null));
}

function challengesSection() {
  const dec = sortItems(state.items.filter((i) => isActive(i) && i.decision.needed));
  const risk = sortItems(state.items.filter((i) => isActive(i) && (['risk', 'blocked'].includes(kindOf(i)) || overdueDays(i) > 0 || targetPassed(i))));
  const sec = h('section', { class: 'sec', id: 'challenges' },
    h('h2', {}, 'Challenges and support needed'),
    null);
  if (!dec.length && !risk.length) {
    sec.append(h('div', { class: 'panel decisions' }, h('p', { class: 'hint', style: 'margin:0', text: 'Nothing is blocked, late, or waiting for a decision right now.' })));
    return sec;
  }
  const jump = (id) => (e) => { e.preventDefault(); jumpTo(id); };
  if (dec.length) {
    sec.append(h('h3', { class: 'sub-h' }, 'Decisions needed', h('span', { class: 'cnt', text: String(dec.length) })),
      h('div', { class: 'panel decisions' }, h('ul', { class: 'dec-list' }, dec.map((it) => {
        const w = wsById(it.ws);
        return h('li', {}, icon(it.status), h('div', {},
          h('div', { class: 'd-title' }, h('a', { href: '#it-' + it.id, dir: 'auto', onclick: jump(it.id), text: ttl(it) })),
          it.decision.text ? h('div', { class: 'd-text', dir: 'auto', text: it.decision.text }) : null,
          h('div', { class: 'd-meta' }, dtag(it), w ? ' ' + w.name : '')));
      }))));
  }
  if (risk.length) {
    sec.append(h('h3', { class: 'sub-h' }, 'Blocked, at risk or late', h('span', { class: 'cnt', text: String(risk.length) })),
      h('div', { class: 'panel decisions' }, h('ul', { class: 'dec-list' }, risk.map((it) => {
        const w = wsById(it.ws);
        const od = overdueDays(it);
        const flags = [];
        if (od) flags.push('Overdue by ' + days(od)); else if (targetPassed(it)) flags.push('Past target date');
        return h('li', {}, icon(it.status), h('div', {},
          h('div', { class: 'd-title' }, h('a', { href: '#it-' + it.id, dir: 'auto', onclick: jump(it.id), text: ttl(it) })),
          (it.challenge || it.update) ? h('div', { class: 'd-text', dir: 'auto', text: it.challenge || it.update }) : null,
          h('div', { class: 'd-meta', text: [w ? w.name : '', statusById(it.status).label].concat(flags).filter(Boolean).join(', ') })));
      }))));
  }
  return sec;
}

function workstreamSections() {
  const out = [];
  const seen = new Set();
  const all = state.config.workstreams;
  for (const ws of all) {
    if (ws.group) {
      if (seen.has(ws.group)) continue;
      seen.add(ws.group);
      const members = all.filter((w) => w.group === ws.group);
      const ids = new Set(members.map((m) => m.id));
      const gi = state.items.filter((i) => ids.has(i.ws));
      const g = h('section', { class: 'group' },
        h('div', { class: 'gt' }, h('h2', { text: ws.group, dir: 'auto' }), segBar(countsFor(gi), false, ws.group), countText(gi)));
      for (const m of members) g.append(wsBlock(m, 3));
      out.push(g);
    } else {
      out.push(h('section', { class: 'group' }, wsBlock(ws, 2)));
    }
  }
  return out;
}

function wsBlock(ws, level) {
  const items = state.items.filter((i) => i.ws === ws.id);
  const el = h('div', { class: 'panel ws', id: 'ws-' + ws.id });
  const top = h('div', { class: 'ws-top' },
    h('div', { class: 'ws-head' }, h('h' + level, { text: ws.name, dir: 'auto' }), segBar(countsFor(items), false, ws.name), countText(items)));
  if (ui.edit) {
    const mk = (label, key) => {
      const ta = h('textarea', { class: 'in', rows: 2, dir: 'auto', value: ws[key] });
      ta.addEventListener('input', () => quietSet(() => { ws[key] = ta.value; }));
      return h('label', {}, label, ta);
    };
    top.append(h('div', { class: 'ws-edit edit-only' }, mk('Where we are (one or two lines for the GM)', 'summary'), mk('Action required', 'outlook')));
  } else if (ws.summary || ws.outlook) {
    top.append(h('div', { class: 'ws-notes' },
      ws.summary ? h('p', { dir: 'auto' }, h('b', { text: 'Where we are: ' }), ws.summary) : null,
      ws.outlook ? h('p', { dir: 'auto' }, h('b', { text: 'Action required: ' }), ws.outlook) : null));
  }
  el.append(top);
  const act = sortItems(items.filter(isActive));
  const dn = items.filter((i) => !isActive(i)).sort((a, b) => ((b.updateDate || '') > (a.updateDate || '') ? 1 : -1));
  if (act.length) el.append(h('div', { class: 'items' }, act.map(itemRow)));
  if (dn.length) {
    const d = h('details', { class: 'done-list' }, h('summary', { text: 'Done (' + dn.length + ')' }), h('div', { class: 'items' }, dn.map(itemRow)));
    track(d, 'done-' + ws.id);
    el.append(d);
  }
  if (ui.edit) el.append(h('div', { class: 'ws-tools edit-only' }, btn('Add topic to ' + ws.name, () => openItem(null, ws.id), 'small')));
  return el;
}

function field(label, node) {
  if (node == null || node === '') return null;
  return h('div', { class: 'f' }, h('div', { class: 'k', text: label }), h('div', { class: 'v', dir: 'auto' }, node));
}

function itemRow(it) {
  const st = statusById(it.status);
  const od = overdueDays(it), tp = targetPassed(it);
  const d = h('details', { class: 'item', id: 'it-' + it.id, vars: { '--c': st.color } });
  track(d, it.id);

  const l1 = h('div', { class: 'it-l1' },
    h('span', { class: 'it-title', dir: 'auto', text: ttl(it) }),
    h('span', { style: 'display:inline-flex;gap:8px;align-items:center' }, pill(st),
      ui.edit ? btn('Edit', (e) => { e.preventDefault(); e.stopPropagation(); openItem(it.id); }, 'small edit-only') : null));
  const main = h('div', { class: 'it-main' }, l1);
  if (it.update) main.append(h('div', { class: 'it-upd', dir: 'auto', text: it.update }));

  const meta = h('div', { class: 'it-meta' });
  if (it.nextStep || it.nextDate) {
    meta.append(h('span', { dir: 'auto' }, h('b', { text: 'Action required: ' }), (it.nextStep || '') + (it.nextDate ? (it.nextStep ? ', ' : '') + fmtDate(it.nextDate) : '')));
  }
  if (od) meta.append(h('span', { class: 'flag crit', text: 'Overdue by ' + days(od) }));
  if (!od && tp) meta.append(h('span', { class: 'flag crit', text: 'Past target date' }));
  if (isActive(it) && it.decision.needed) meta.append(dtag(it));
  if (meta.childNodes.length) main.append(meta);

  d.append(h('summary', {}, main));

  const w = wsById(it.ws);
  const body = h('div', { class: 'it-body' },
    field('Where we are', it.update ? it.update + (it.updateDate ? ' (' + fmtDate(it.updateDate) + ')' : '') : ''),
    field('Action required', (it.nextStep || '') + (it.nextDate ? (it.nextStep ? ', ' : '') + fmtDate(it.nextDate) : '')),
    field('Target date', it.targetDate ? fmtDate(it.targetDate) : ''),
    field('Challenge', it.challenge),
    field('Decision needed', it.decision.needed ? (it.decision.text || 'Decision required') + (it.decision.by ? ' (' + it.decision.by + ')' : '') : ''),
    ...state.config.fields.map((f) => field(f.name, it.custom[f.id] ? (f.type === 'date' ? fmtDate(it.custom[f.id]) : it.custom[f.id]) : '')),
    );
  if (it.history.length) {
    const hs = it.history.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    body.append(h('div', { class: 'f' }, h('div', { class: 'k', text: 'History' }),
      h('ul', { class: 'hist' }, hs.map((e) => h('li', { dir: 'auto' }, h('b', { text: fmtDate(e.date) }), ' ' + (e.status ? statusById(e.status).label : '') + (e.text ? ': ' + e.text : ''))))));
  }
  d.append(body);
  return d;
}

function jumpTo(id) {
  ui.open.add(id);
  render();
  const el = document.getElementById('it-' + id);
  if (!el) return;
  const dl = el.closest('details.done-list');
  if (dl) { dl.open = true; ui.open.add(dl.dataset.key); }
  el.scrollIntoView({ block: 'center' });
}

/* =====================================================================
   Topic dialog
   ===================================================================== */
function select(opts, val) {
  const s = h('select', {}, opts.map((o) => h('option', { value: o[0], text: o[1] })));
  s.value = val;
  return s;
}
function fld(label, node) { return h('label', { class: 'fld' }, h('span', { text: label }), node); }
function txt(val, ph) { return h('input', { type: 'text', dir: 'auto', value: val || '', placeholder: ph || '' }); }
function area(val, rows) { return h('textarea', { rows: rows || 2, dir: 'auto', value: val || '' }); }

function openItem(id, wsId) {
  const prev = id ? state.items.find((i) => i.id === id) : null;
  const it = prev ? JSON.parse(JSON.stringify(prev)) : newItem(wsId);
  if (!it.ws) it.ws = wsId || state.config.workstreams[0].id;
  if (!it.status) it.status = (state.config.statuses.find((s) => s.kind === 'ontrack') || state.config.statuses[0]).id;
  const c = {};
  c.title = txt(it.title, 'Optional. For example: Sign the agreement');
  c.ws = select(state.config.workstreams.map((w) => [w.id, (w.group ? w.group + ': ' : '') + w.name]), it.ws);
  c.status = select(state.config.statuses.map((s) => [s.id, s.label]), it.status);
  c.update = area(it.update, 3);
  c.updateDate = h('input', { type: 'date', value: it.updateDate });
  c.nextStep = area(it.nextStep, 2);
  c.nextDate = h('input', { type: 'date', value: it.nextDate });
  c.targetDate = h('input', { type: 'date', value: it.targetDate });
  c.challenge = area(it.challenge, 2);
  c.decNeeded = h('input', { type: 'checkbox', checked: it.decision.needed });
  c.decText = area(it.decision.text, 2);
  c.decFrom = h('input', { type: 'text', value: it.decision.by, maxlength: '60', placeholder: 'For example: GM', list: 'dec-names' });
  c.decList = h('datalist', { id: 'dec-names' }, state.config.deciders.map((d) => h('option', { value: d.label })));
  c.custom = {};
  for (const f of state.config.fields) {
    const v = it.custom[f.id] || '';
    if (f.type === 'select') c.custom[f.id] = select([['', 'None']].concat(f.options.map((o) => [o, o])), f.options.includes(v) ? v : '');
    else if (f.type === 'number') c.custom[f.id] = h('input', { type: 'number', value: v });
    else if (f.type === 'date') c.custom[f.id] = h('input', { type: 'date', value: v });
    else c.custom[f.id] = txt(v);
  }
  const err = h('div', { class: 'err', role: 'alert' });
  const dlg = $('#dlg');
  const decBox = h('div', {}, fld('Decision from', c.decFrom), c.decList, fld('What decision is needed', c.decText));
  const showDec = () => { decBox.hidden = !c.decNeeded.checked; };
  c.decNeeded.addEventListener('change', showDec);
  showDec();

  const save = () => {
    if (!c.title.value.trim() && !c.nextStep.value.trim() && !c.update.value.trim() && !c.challenge.value.trim()) { err.textContent = 'Fill in at least the action required, or a title.'; c.nextStep.focus(); return; }
    const next = Object.assign({}, it, {
      title: c.title.value.trim(), ws: c.ws.value, status: c.status.value,
      update: c.update.value.trim(), updateDate: c.updateDate.value,
      nextStep: c.nextStep.value.trim(), nextDate: c.nextDate.value, targetDate: c.targetDate.value,
      challenge: c.challenge.value.trim(),
      decision: { needed: c.decNeeded.checked, text: c.decText.value.trim(), by: c.decFrom.value.trim() },
      custom: {},
    });
    for (const f of state.config.fields) next.custom[f.id] = c.custom[f.id].value;
    const textChanged = next.update !== (prev ? prev.update : '');
    const statusChanged = prev ? next.status !== prev.status : true;
    const manualDate = next.updateDate !== (prev ? prev.updateDate : '');
    if (!manualDate && (textChanged || statusChanged)) next.updateDate = TODAY;
    if ((!manualDate && (textChanged || statusChanged)) || (!prev && next.update)) {
      next.history = (next.history || []).concat([{ date: next.updateDate || TODAY, status: next.status, text: next.update }]);
    }
    mutate(() => {
      if (prev) Object.assign(prev, next); else state.items.push(next);
      ui.open.add(next.id);
    });
    dlg.close();
  };

  const footer = h('div', { class: 'dlg-f' },
    btn('Save', save, 'primary'), btn('Cancel', () => dlg.close()), h('span', { class: 'sp' }),
    prev ? confirmBtn('Delete topic', 'Click again to delete', () => { mutate(() => { state.items = state.items.filter((x) => x.id !== prev.id); }); dlg.close(); }, 'btn danger') : null);

  dlg.replaceChildren(h('form', { class: 'dlg', method: 'dialog', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', { class: 'dlg-h' }, h('h2', { text: prev ? 'Edit topic' : 'New topic' })),
    h('div', { class: 'dlg-b' },
      fld('Topic', c.title), fld('Workstream', c.ws), fld('Status', c.status),
      fld('Where we are (latest update)', c.update),
      fld('Action required', c.nextStep),
      fld('Challenge or blocker', c.challenge),
      state.config.fields.map((f) => fld(f.name, c.custom[f.id])),
      h('label', { class: 'chk' }, c.decNeeded, h('span', { text: 'Needs a decision' })),
      decBox,
      h('details', { class: 'dates-d', open: (it.nextDate || it.targetDate) ? true : null },
        h('summary', { text: 'Dates (optional)' }),
        h('p', { class: 'hint-s', text: 'Dates build the \u201cActions required\u201d table. A topic with no date is left out of it. Any date works, near or far.' }),
        fld('Action date', c.nextDate), fld('Target date', c.targetDate),
        fld('Last updated (changes automatically when you edit the status or text)', c.updateDate)),
      err),

    footer));
  dlg.showModal();
  c.title.focus();
}

/* =====================================================================
   Settings dialog
   ===================================================================== */
function openSettings() {
  const draft = {
    title: state.meta.title, subtitle: state.meta.subtitle, logo: state.meta.logo,
    brand: state.meta.brand, brandSub: state.meta.brandSub,
    statuses: JSON.parse(JSON.stringify(state.config.statuses)),
    deciders: JSON.parse(JSON.stringify(state.config.deciders)),
    workstreams: JSON.parse(JSON.stringify(state.config.workstreams)),
    fields: JSON.parse(JSON.stringify(state.config.fields)),
  };
  const dlg = $('#dlg');
  const body = h('div', { class: 'dlg-b' });
  const err = h('div', { class: 'err', role: 'alert' });
  const usedWs = (id) => state.items.filter((i) => i.ws === id).length;
  const usedSt = (id) => state.items.filter((i) => i.status === id).length;
  const usedDec = (label) => state.items.filter((i) => (i.decision.by || '').trim().toLowerCase() === label.trim().toLowerCase()).length;

  const bind = (input, key, obj) => { input.addEventListener('input', () => { obj[key] = input.value; }); return input; };
  const iconBtn = (label, text, fn, disabled, tip) => h('button', { class: 'btn small', type: 'button', text, 'aria-label': label, title: tip || label, disabled: disabled ? true : null, onclick: fn });
  const move = (arr, i, dir) => { const j = i + dir; if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; build(); };

  const isAdmin = CLOUD && cloud.me && cloud.me.is_admin;
  const peopleBox = h('div', { class: 'people' });
  let people = null;
  const setAccess = async (p) => {
    try {
      const rows = await api('members?user_id=eq.' + encodeURIComponent(p.user_id), { method: 'PATCH', prefer: 'return=representation', body: { approved: !p.approved } });
      if (!rows || !rows.length) throw new Error('Not allowed.');
      p.approved = !p.approved;
      renderPeople();
      refreshPending().catch(() => {});
    } catch (e) { toast('Could not change access: ' + e.message); }
  };
  const personRow = (p) => h('div', { class: 'prow' },
    h('span', { class: 'em', dir: 'ltr', text: p.email }),
    h('span', { class: 'hint-s', text: p.approved ? (p.is_admin ? 'Admin' : 'Approved') : 'Waiting' }),
    p.user_id === cloud.me.user_id ? null
      : btn(p.approved ? 'Remove access' : 'Approve', () => setAccess(p), 'small' + (p.approved ? '' : ' primary')));
  const renderPeople = () => {
    peopleBox.replaceChildren(...(people ? people.map(personRow) : [h('p', { class: 'hint-s', text: 'Loading...' })]));
  };
  const loadPeople = async () => {
    try { people = await api('members?select=user_id,email,approved,is_admin&order=approved.asc,created_at.asc'); } catch (e) { people = []; toast('Could not load people: ' + e.message); }
    renderPeople();
  };

  function build() {
    const top = body.scrollTop;
    const sec = [];

    sec.push(h('h3', { text: 'General' }),
      fld('Page title', bind(txt(draft.title), 'title', draft)),
      fld('Subtitle', bind(txt(draft.subtitle), 'subtitle', draft)),
      fld('Header name', bind(txt(draft.brand), 'brand', draft)),
      fld('Header second line', bind(txt(draft.brandSub), 'brandSub', draft)));

    sec.push(h('h3', { text: 'Workstreams' }),
      h('p', { class: 'hint-s', text: 'Workstreams with the same group name appear together under one heading (like Group 1). Leave the group empty for a standalone workstream.' }),
      draft.workstreams.map((w, i) => {
        const n = usedWs(w.id);
        return h('div', { class: 'row-e' },
          h('div', { class: 'cols' }, bind(txt(w.name, 'Workstream name'), 'name', w), bind(txt(w.group, 'Group (optional)'), 'group', w)),
          h('div', { class: 'btns' },
            iconBtn('Move up', '▲', () => move(draft.workstreams, i, -1), i === 0),
            iconBtn('Move down', '▼', () => move(draft.workstreams, i, 1), i === draft.workstreams.length - 1),
            iconBtn('Delete workstream', '✕', () => { draft.workstreams.splice(i, 1); build(); }, n > 0 || draft.workstreams.length === 1,
              n > 0 ? 'It has ' + n + ' topics. Move them to another workstream first.' : 'Delete workstream')));
      }),
      h('div', { style: 'margin-top:10px' }, btn('Add workstream', () => { draft.workstreams.push({ id: uid(), name: '', group: '', summary: '', outlook: '' }); build(); }, 'small')));

    sec.push(h('h3', { text: 'Statuses' }),
      h('p', { class: 'hint-s', text: 'The type decides the icon and how it is counted. "Done" topics are never overdue. "Blocked" and "Needs attention" feed the big number at the top.' }),
      draft.statuses.map((s, i) => {
        const n = usedSt(s.id);
        const kindSel = select(KINDS.map((k) => [k.id, k.label]), s.kind);
        kindSel.addEventListener('change', () => { s.kind = kindSel.value; });
        const pal = PALETTE.includes(s.color) ? PALETTE : [s.color].concat(PALETTE);
        const sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, pal.map((col) =>
          h('button', { class: 'sw', type: 'button', role: 'radio', 'aria-checked': col === s.color ? 'true' : 'false', 'aria-label': col, style: 'background:' + col,
            onclick: () => { s.color = col; build(); } })));
        return h('div', { class: 'row-e' },
          h('div', { class: 'cols' }, bind(txt(s.label, 'Status name'), 'label', s), kindSel, sw),
          h('div', { class: 'btns' },
            iconBtn('Move up', '▲', () => move(draft.statuses, i, -1), i === 0),
            iconBtn('Move down', '▼', () => move(draft.statuses, i, 1), i === draft.statuses.length - 1),
            iconBtn('Delete status', '✕', () => { draft.statuses.splice(i, 1); build(); }, n > 0 || draft.statuses.length === 1,
              n > 0 ? n + ' topics use this status. Change them first.' : 'Delete status')));
      }),
      h('div', { style: 'margin-top:10px' }, btn('Add status', () => { draft.statuses.push({ id: uid(), label: '', kind: 'ontrack', color: '#4f008c' }); build(); }, 'small')));

    sec.push(h('h3', { text: 'Who decides' }),
      h('p', { class: 'hint-s', text: 'On a topic you type who decides. Names listed here show up as suggestions. The tag turns red only when the topic is blocked, needs attention or is late.' }),
      draft.deciders.map((d, i) => {
        const n = usedDec(d.label);
        return h('div', { class: 'row-e' },
          h('div', { class: 'cols' }, bind(txt(d.label, 'Name, for example GM'), 'label', d)),
          h('div', { class: 'btns' },
            iconBtn('Move up', '▲', () => move(draft.deciders, i, -1), i === 0),
            iconBtn('Move down', '▼', () => move(draft.deciders, i, 1), i === draft.deciders.length - 1),
            iconBtn('Delete', '✕', () => { draft.deciders.splice(i, 1); build(); }, n > 0,
              n > 0 ? n + ' topics use this name. Change them first.' : 'Delete')));
      }),
      h('div', { style: 'margin-top:10px' }, btn('Add person', () => { draft.deciders.push({ id: uid(), label: '', color: '#4f008c' }); build(); }, 'small')));

    sec.push(h('h3', { text: 'Extra fields' }),
      h('p', { class: 'hint-s', text: 'Anything else you want to track per topic, such as a contract number or a value. Extra fields appear in the topic form and in its details.' }),
      draft.fields.map((f, i) => {
        const typeSel = select(FIELD_TYPES.map((t) => [t.id, t.label]), f.type);
        const opt = txt(f.options.join(', '), 'Options, separated by commas');
        opt.addEventListener('input', () => { f.options = opt.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean); });
        typeSel.addEventListener('change', () => { f.type = typeSel.value; build(); });
        return h('div', { class: 'row-e' },
          h('div', { class: 'cols' }, bind(txt(f.name, 'Field name'), 'name', f), typeSel, f.type === 'select' ? opt : null),
          h('div', { class: 'btns' }, iconBtn('Delete field', '✕', () => { draft.fields.splice(i, 1); build(); })));
      }),
      h('div', { style: 'margin-top:10px' }, btn('Add field', () => { draft.fields.push({ id: uid(), name: '', type: 'text', options: [] }); build(); }, 'small')));

    if (CLOUD) {
      const npw = h('input', { type: 'password', autocomplete: 'new-password', minlength: '8', dir: 'ltr', placeholder: 'New password, at least 8 characters' });
      const msg = h('div', { class: 'hint-s', role: 'status' });
      sec.push(h('h3', { text: 'My account' }),
        h('p', { class: 'hint-s', text: 'Signed in as ' + (cloud.me ? cloud.me.email : '') + '.' }),
        h('div', { class: 'cols' }, npw, btn('Change password', async () => {
          if (npw.value.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; }
          try {
            await authReq('user', 'PUT', { password: npw.value }, cloud.session && cloud.session.access_token);
            npw.value = '';
            msg.textContent = 'Password changed.';
          } catch (e) { msg.textContent = e.message; }
        }, 'small')), msg);
    }

    if (isAdmin) {
      sec.push(h('h3', { text: 'People' }),
        h('p', { class: 'hint-s', text: 'People create their own account on the sign in page. They see nothing until you approve them here.' }),
        peopleBox);
    }

    sec.push(h('h3', { text: 'Data' }),
      h('p', { class: 'hint-s', text: CLOUD ? 'Changes are saved online as you make them. These actions run immediately and close this window.'
        : 'Your data is saved inside this page when you click Save. These actions run immediately and close this window.' }),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px' },
        CLOUD ? null : btn('Save as a new file', () => { dlg.close(); saveFile(true); }),
        CLOUD ? null : btn('Import data from a JSON file', () => { dlg.close(); $('#file-input').click(); }),
        CLOUD ? null : btn('Export a JSON backup', () => download(JSON.stringify(state, null, 2), 'tracker-backup-' + TODAY + '.json', 'application/json')),
        confirmBtn('Delete all topics', 'Click again to confirm', () => { dlg.close(); clearAll(); }, 'btn danger'),
        CLOUD ? null : confirmBtn('Restore sample data', 'Click again to confirm', () => { dlg.close(); mutate(() => { state = sampleData(); ui.hideSample = false; }); }, 'btn')));
    sec.push(err);
    body.replaceChildren(...sec.flat(Infinity).filter(Boolean));
    body.scrollTop = top;
  }

  const save = () => {
    err.textContent = '';
    const bad = (m) => { err.textContent = m; err.scrollIntoView({ block: 'nearest' }); };
    if (draft.workstreams.some((w) => !w.name.trim())) return bad('A workstream has no name.');
    if (draft.statuses.some((s) => !s.label.trim())) return bad('A status has no name.');
    if (draft.deciders.some((d) => !d.label.trim())) return bad('A name in "Who decides" is empty.');
    if (draft.fields.some((f) => !f.name.trim())) return bad('An extra field has no name.');
    if (draft.fields.some((f) => f.type === 'select' && !f.options.length)) return bad('A dropdown field needs at least one option.');
    mutate(() => {
      state.meta.title = draft.title.trim() || 'Tracker';
      state.meta.subtitle = draft.subtitle.trim();
      state.meta.logo = draft.logo;
      state.meta.brand = draft.brand.trim();
      state.meta.brandSub = draft.brandSub.trim();
      state.config.deciders = draft.deciders.map((d) => ({ id: d.id, label: d.label.trim(), color: d.color }));
      state.config.statuses = draft.statuses.map((s) => ({ id: s.id, label: s.label.trim(), kind: s.kind, color: s.color }));
      state.config.workstreams = draft.workstreams.map((w) => Object.assign({}, w, { name: w.name.trim(), group: w.group.trim() }));
      state.config.fields = draft.fields.map((f) => ({ id: f.id, name: f.name.trim(), type: f.type, options: f.options }));
    });
    dlg.close();
  };

  dlg.replaceChildren(h('form', { class: 'dlg', method: 'dialog', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', { class: 'dlg-h' }, h('h2', { text: 'Settings' })),
    body,
    h('div', { class: 'dlg-f' }, btn('Save settings', save, 'primary'), btn('Cancel', () => dlg.close()))));
  renderPeople();
  build();
  dlg.showModal();
  if (isAdmin) loadPeople();
}

function clearAll() {
  mutate(() => { state.items = []; state.meta.sample = false; state.meta.summary = ''; state.config.workstreams.forEach((w) => { w.summary = ''; w.outlook = ''; }); });
  toast('Cleared. Click Edit and add your first topic.');
}

/* =====================================================================
   Tooltips and events
   ===================================================================== */
let tipEl = null;
function showTip(target, x, y) {
  if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip' }); document.body.append(tipEl); }
  tipEl.textContent = target.getAttribute('data-tip');
  tipEl.style.left = Math.max(8, Math.min(window.innerWidth - tipEl.offsetWidth - 8, x - tipEl.offsetWidth / 2)) + 'px';
  tipEl.style.top = Math.max(8, y - tipEl.offsetHeight - 10) + 'px';
}
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }

function bindGlobal() {
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(t, e.clientX, t.getBoundingClientRect().top); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hideTip(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!CLOUD) saveFile(false); }
  });
  document.addEventListener('visibilitychange', () => { if (CLOUD && !document.hidden) pollOnce(); });
  window.addEventListener('beforeunload', (e) => {
    if (CLOUD ? ui.sync !== 'saved' : ui.edit && ui.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  $('#file-input').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { importText(await f.text(), f.name); } catch (err) { toast('Could not import the file: ' + err.message); }
  });
}

async function init() {
  if (CLOUD) {
    state = emptyData();
    bindGlobal();
    loadSession();
    const hs = takeHash();
    try {
      if (hs && hs.error) showLogin(hs.error);
      else if (cloud.session) await enter();
      else showLogin();
    } catch (e) { showLogin(e.message); }
    return;
  }
  PRISTINE = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  state = loadInitial();
  ui.fileName = decodeURIComponent((location.pathname.split('/').pop() || '')) || DEFAULT_FILE;
  bindGlobal();
  render();
  if (ui.restored) toast('Restored your unsaved changes.');
  ui.handle = await loadHandle();
}
init();

})();
