'use strict';
/* ====== إعداد اختياري: ضع معرّف التطبيق هنا لتجاوز شاشة الإعداد ====== */
const CLIENT_ID = '';
/* ===================================================================== */

const SCOPES = 'Files.Read Files.ReadWrite.AppFolder User.Read offline_access';
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const DATA_FILE = 'library-data.json';
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|ogg|oga|opus|flac|wav|wma|webm|mp4a)$/i;
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const arNum = n => String(Number(n));
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
const fmtLong = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}:${pad(m)} ساعة` : `${Math.max(1, m)} دقيقة`; };
const base = n => String(n || '').replace(/\.[^.\/]+$/, '');
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const grad = n => { const h = hash(n) % 360; return `linear-gradient(150deg, hsl(${h} 85% 68%), hsl(${(h + 25) % 360} 72% 36%) 75%)`; };
const nat = (a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true, sensitivity: 'base' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const SS = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} }
};
function safeUrl(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u.replace(/["'()\\\s]/g, c => encodeURIComponent(c)) : ''; }
function coverStyle(name, thumb) { const u = safeUrl(thumb); return `background-image:${u ? `url("${u}"), ` : ''}${grad(name)}`; }
function cover(name, thumb, cls = '', label = true) {
  return `<div class="cover ${cls}" style="${coverStyle(name, thumb)}">${label && !safeUrl(thumb) ? esc(base(name)) : ''}</div>`;
}

/* ---------- icons ---------- */
const sv = (p, o = {}) => `<svg width="${o.s || 20}" height="${o.s || 20}" viewBox="0 0 24 24" fill="${o.f || 'none'}" stroke="${o.f ? 'none' : 'currentColor'}" stroke-width="${o.w || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  lib: sv('<path d="M5 4v16M10 4v16M15 5l4 15"/>', { s: 22 }),
  mark: sv('<path d="M7 4h10v16l-5-4-5 4z"/>', { s: 22 }),
  markS: sv('<path d="M7 4h10v16l-5-4-5 4z"/>', { s: 16 }),
  markPlus: sv('<path d="M7 4h10v16l-5-4-5 4z"/><path d="M12 8v5M9.5 10.5h5"/>'),
  note: sv('<path d="M5 4h14v12l-4 4H5z"/><path d="M9 9h6M9 13h4"/>', { s: 22 }),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', { s: 22 }),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', { s: 18, w: 2 }),
  back: sv('<path d="M9 5l7 7-7 7"/>', { w: 2 }),
  down: sv('<path d="M6 9l6 6 6-6"/>', { w: 2 }),
  list: sv('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  play: s => sv('<path d="M7 4.5v15l12-7.5z"/>', { f: 'currentColor', s }),
  pause: s => sv('<rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/>', { f: 'currentColor', s }),
  prev: sv('<path d="M19 5v14L9 12z"/><rect x="5" y="5" width="2.4" height="14" rx="1"/>', { f: 'currentColor', s: 26 }),
  next: sv('<path d="M5 5v14l10-7z"/><rect x="16.6" y="5" width="2.4" height="14" rx="1"/>', { f: 'currentColor', s: 26 }),
  rw: sv('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>', { s: 32, w: 1.6 }),
  fw: sv('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>', { s: 32, w: 1.6 }),
  plus: sv('<path d="M12 5v14M5 12h14"/>', { s: 15 }),
  moon: sv('<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>', { s: 15 }),
  check: sv('<path d="M5 12l5 5 9-10"/>', { s: 16, w: 2.4 }),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>', { s: 16, w: 2.2 }),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>', { s: 16 }),
  trash: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', { s: 16 }),
  clock: sv('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', { s: 16, w: 2 }),
  dl: sv('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', { s: 16 }),
  folder: sv('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', { s: 18 })
};
const eq = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';

/* ---------- config & state ---------- */
let cfg = Object.assign({ clientId: CLIENT_ID, rootPath: '', rootId: '', rootIdPath: null, demo: false, skip: 30, pauseOnNote: true, lite: false, speed: 1 }, LS.get('cfg', {}));
if (CLIENT_ID) cfg.clientId = CLIENT_ID;
const saveCfg = () => LS.set('cfg', cfg);
let tok = LS.get('tok', null);
let data = LS.get('data', null) || {};
for (const k of ['progress', 'marks', 'notes', 'recents']) data[k] = data[k] || {};
const known = new Map();
const memKids = new Map();
let covers = LS.get('covers', {});
const remember = it => { known.set(it.id, Object.assign(known.get(it.id) || {}, it)); };

/* ---------- auth (OAuth 2.0 + PKCE, no library) ---------- */
class AuthError extends Error { constructor(m) { super(m || 'auth'); this.name = 'AuthError'; } }
const redirectUri = () => location.origin + location.pathname;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randStr = (n = 48) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };

async function login(silent) {
  if (!cfg.clientId) { location.hash = '#/'; render(); return; }
  const verifier = randStr(48), state = randStr(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  SS.set('pkce', JSON.stringify({ verifier, state, silent: !!silent, back: location.hash }));
  const p = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state, response_mode: 'query' });
  if (silent) p.set('prompt', 'none');
  location.assign(AUTH + '/authorize?' + p);
}
async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  let saved = null; try { saved = JSON.parse(SS.get('pkce') || 'null'); } catch {}
  SS.del('pkce');
  history.replaceState(null, '', redirectUri() + (saved && saved.back || ''));
  if (q.has('error')) {
    if (!(saved && saved.silent)) toast('تعذّر تسجيل الدخول: ' + (q.get('error_description') || q.get('error')).slice(0, 140));
    return;
  }
  if (!saved || saved.state !== q.get('state')) return;
  await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), code_verifier: saved.verifier, redirect_uri: redirectUri() });
  SS.del('silentTried');
}
async function tokenRequest(params) {
  const r = await fetch(AUTH + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(Object.assign({ client_id: cfg.clientId, scope: SCOPES }, params)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || 'token');
  tok = { access: j.access_token, refresh: j.refresh_token || (tok && tok.refresh), exp: Date.now() + (j.expires_in || 3600) * 1000 };
  LS.set('tok', tok);
  return tok.access;
}
let refreshing = null;
async function getToken() {
  if (tok && tok.access && tok.exp - 60000 > Date.now()) return tok.access;
  if (tok && tok.refresh) {
    try { refreshing = refreshing || tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh }); return await refreshing; }
    catch (e) { console.warn(e); } finally { refreshing = null; }
  }
  // الجلسة انتهت: نحاول دخولاً صامتاً (بدون واجهة) إذا لم يكن هناك صوت يعمل
  if (audio.paused && !SS.get('silentTried') && cfg.clientId) { SS.set('silentTried', '1'); saveProgress(); await login(true); await new Promise(() => {}); }
  throw new AuthError();
}
function signOut() { tok = null; LS.del('tok'); SS.del('silentTried'); audio.pause(); cur = null; LS.del('cur'); render(); }

/* ---------- Microsoft Graph ---------- */
async function g(path, opt = {}) {
  const t = await getToken();
  const r = await fetch(path.startsWith('http') ? path : GRAPH + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + t }, opt.headers || {}) }));
  if (r.status === 401 && !opt._retry) { if (tok) tok.exp = 0; return g(path, Object.assign({}, opt, { _retry: 1 })); }
  if (r.status === 404 && opt.allow404) return null;
  if (!r.ok) throw new Error('Graph ' + r.status);
  return opt.raw ? r : r.json();
}
function norm(it) {
  const th = it.thumbnails && it.thumbnails[0];
  const isAudio = !!it.file && ((it.file.mimeType || '').startsWith('audio/') || AUDIO_EXT.test(it.name) || !!it.audio);
  return {
    id: it.id, name: it.name, folder: !!it.folder, count: it.folder ? it.folder.childCount : 0,
    audio: isAudio, img: !!it.file && (IMG_EXT.test(it.name) || (it.file.mimeType || '').startsWith('image/')),
    dur: it.audio && it.audio.duration ? it.audio.duration / 1000 : 0,
    thumb: th ? (th.medium || th.large || th.small || {}).url : '', thumbL: th ? (th.large || th.medium || {}).url : '',
    parent: it.parentReference ? it.parentReference.id : ''
  };
}
const live = {
  async rootId() {
    if (cfg.rootId && cfg.rootIdPath === cfg.rootPath) return cfg.rootId;
    const p = cfg.rootPath.trim().replace(/^\/+|\/+$/g, '');
    const it = await g(p ? '/me/drive/root:/' + p.split('/').map(encodeURIComponent).join('/') : '/me/drive/root', { allow404: true });
    if (!it) throw new Error('NOFOLDER');
    cfg.rootId = it.id; cfg.rootIdPath = cfg.rootPath; saveCfg();
    remember({ id: it.id, name: it.name, folder: true });
    return it.id;
  },
  async children(id) {
    let url = `/me/drive/items/${encodeURIComponent(id)}/children?$top=500&$expand=thumbnails`; const out = [];
    while (url) { const j = await g(url); out.push(...j.value); url = j['@odata.nextLink']; }
    return out.map(norm);
  },
  async item(id) { return norm(await g(`/me/drive/items/${encodeURIComponent(id)}?$expand=thumbnails`)); },
  async stream(id) { const it = await g(`/me/drive/items/${encodeURIComponent(id)}`); const u = it['@microsoft.graph.downloadUrl']; if (!u) throw new Error('nourl'); return u; },
  async search(q) { const id = await this.rootId(); const j = await g(`/me/drive/items/${encodeURIComponent(id)}/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')?$top=60`); return j.value.map(norm).filter(x => x.folder || x.audio); },
  async load() { const r = await g(`/me/drive/special/approot:/${DATA_FILE}:/content`, { raw: 1, allow404: true }); return r ? r.json() : null; },
  async save(d) { await g(`/me/drive/special/approot:/${DATA_FILE}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); },
  async me() { return g('/me?$select=displayName,userPrincipalName'); }
};

/* ---------- demo source ---------- */
function makeWav(sec, tone) {
  const sr = 8000, n = Math.floor(sr * sec), buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) { const t = i / sr, ph = t % 3; const a = tone && ph < .35 ? Math.sin(Math.PI * ph / .35) * .16 * Math.sin(2 * Math.PI * (ph < .17 ? 523 : 659) * t) : 0; v.setUint8(44 + i, 128 + Math.round(127 * a)); }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
let demoT = null, demoAudio = null;
function demoTree() {
  if (demoT) return demoT;
  const T = { root: { id: 'root', name: 'الكتب الصوتية', folder: true, kids: [] } };
  const add = (p, o) => { o.parent = p; o.kids = o.kids || []; T[o.id] = o; T[p].kids.push(o.id); };
  [['مدن الملح', ['التيه', 'الأخدود', 'تقاسيم الليل والنهار', 'المنبت', 'بادية الظلمات']], ['ثلاثية غرناطة', ['غرناطة', 'مريمة', 'الرحيل']], ['العبقريات', ['عبقرية محمد', 'عبقرية الصديق', 'عبقرية عمر', 'عبقرية خالد']]]
    .forEach(([n, parts], i) => { const f = 's' + i; add('root', { id: f, name: n, folder: true, count: parts.length }); parts.forEach((p, j) => add(f, { id: f + 't' + j, name: `${pad(j + 1)} - ${p}.mp3`, audio: true, dur: 120 })); });
  ['الأيام.mp3', 'كليلة ودمنة.m4b', 'المقدمة.mp3'].forEach((n, i) => add('root', { id: 'b' + i, name: n, audio: true, dur: 120 }));
  return (demoT = T);
}
const clean = o => ({ id: o.id, name: o.name, folder: !!o.folder, count: o.count || 0, audio: !!o.audio, img: false, dur: o.dur || 0, thumb: '', thumbL: '', parent: o.parent || '' });
const demo = {
  async rootId() { return 'root'; },
  async children(id) { const T = demoTree(); return (T[id] ? T[id].kids : []).map(k => clean(T[k])); },
  async item(id) { const T = demoTree(); if (!T[id]) throw new Error('404'); return clean(T[id]); },
  async stream() { return demoAudio || (demoAudio = makeWav(120, true)); },
  async search(q) { const T = demoTree(); return Object.values(T).filter(o => o.id !== 'root' && o.name.includes(q)).map(clean); },
  async load() { return null; }, async save() {}, async me() { return { displayName: 'الوضع التجريبي' }; }
};
const src = () => cfg.demo ? demo : live;
const loggedIn = () => cfg.demo || !!tok;

/* ---------- sync (bookmarks, notes, progress → OneDrive app folder) ---------- */
function mergeInto(a, b) {
  for (const k of ['progress', 'marks', 'notes', 'recents']) {
    a[k] = a[k] || {}; const bk = (b && b[k]) || {};
    for (const id in bk) if (!a[k][id] || (bk[id].u || 0) > (a[k][id].u || 0)) a[k][id] = bk[id];
  }
}
function prune() {
  const r = Object.values(data.recents).sort((x, y) => y.u - x.u);
  r.slice(30).forEach(x => delete data.recents[x.id]);
}
const persist = () => LS.set('data', data);
let syncTimer = null, syncDue = 0, syncing = false, lastPull = 0;
function scheduleSync(ms) {
  persist();
  if (cfg.demo || !tok) return;
  const due = Date.now() + ms;
  if (syncTimer && syncDue <= due) return;
  clearTimeout(syncTimer); syncDue = due; syncTimer = setTimeout(doSync, ms);
}
async function doSync() {
  clearTimeout(syncTimer); syncTimer = null;
  if (cfg.demo || !tok) return;
  if (syncing) { scheduleSync(5000); return; }
  syncing = true;
  try {
    const before = JSON.stringify([data.marks, data.notes]);
    const remote = await live.load();
    if (remote) mergeInto(data, remote);
    prune(); persist(); lastPull = Date.now();
    await live.save(data);
    if (JSON.stringify([data.marks, data.notes]) !== before) { renderPanel(); renderMarkers(); const r = route(); if (r.name === 'marks' || r.name === 'notes') render(); }
  } catch (e) { console.warn('sync', e); if (e.name === 'AuthError') authToast(); }
  finally { syncing = false; }
}
