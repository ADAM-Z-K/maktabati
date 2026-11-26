'use strict';
/* ---------- player ---------- */
const audio = new Audio();
audio.preload = 'metadata';
const SILENT = makeWav(0.2, false);
let loadGen = 0, cur = null, queue = [], pendingSeek = null, wantPlay = false, unlocked = false, dragT = null, tab = 'marks', sleep = { mode: 0, at: 0 }, lastSave = 0, lastPos = 0, retrying = false;

function unlock() {
  if (unlocked) return; unlocked = true;
  try { if (!audio.src) audio.src = SILENT; const g0 = loadGen; audio.muted = true; const p = audio.play(); if (p) p.then(() => { if (loadGen === g0) audio.pause(); audio.muted = false; }).catch(() => { audio.muted = false; }); else audio.muted = false; } catch { audio.muted = false; }
}
function parentNameOf(pid, rootId) { if (!pid || pid === rootId) return ''; const p = known.get(pid); return p ? p.name : ''; }

async function openTrack(id, parent, at, autoplay = true) {
  if (autoplay) unlock();
  try {
    const rootId = await src().rootId();
    let item = known.get(id), q;
    if (parent) {
      const kids = await childrenQuick(parent);
      const auds = kids.filter(k => k.audio);
      item = auds.find(k => k.id === id) || item;
      q = parent === rootId ? [item] : auds;
      if (!known.get(parent) || !known.get(parent).name) { try { remember(await src().item(parent)); } catch {} }
    }
    if (!item || !item.name) { item = await src().item(id); remember(item); }
    await playItem(item, q || [item], at, autoplay, parentNameOf(parent || item.parent, rootId));
  } catch (e) { console.warn(e); if (e.name === 'AuthError') authToast(); else toast('تعذّر فتح الملف'); }
}
async function playItem(item, q, at, autoplay = true, pName) {
  saveProgress();
  cur = Object.assign({}, item, { parentName: pName != null ? pName : (cur && cur.parent === item.parent ? cur.parentName : '') });
  if (!cur.parentName) { const rid = cfg.rootId || (cfg.demo ? 'root' : ''); cur.parentName = parentNameOf(item.parent, rid); }
  queue = q && q.length ? q : [item];
  LS.set('cur', { id: cur.id, parent: cur.parent || '' });
  setHue(cur.parentName || cur.name);
  wantPlay = autoplay;
  renderPlayer();
  if (autoplay) touchRecent();
  let url;
  try { url = await src().stream(item.id); } catch (e) { if (e.name === 'AuthError') authToast(); else toast('تعذّر تشغيل الملف'); return; }
  if (!cur || cur.id !== item.id) return;
  const p = prog(item.id);
  pendingSeek = at != null ? at : (p && !isDone(p) ? p.pos : 0);
  loadGen++; audio.muted = false; audio.src = url; audio.playbackRate = cfg.speed;
  if (autoplay) audio.play().catch(() => { wantPlay = false; renderPP(); });
  mediaMeta(); refreshLists();
}
function touchRecent() {
  if (!cur) return;
  data.recents[cur.id] = { id: cur.id, name: cur.name, parent: cur.parent || '', parentName: cur.parentName || '', thumb: cur.thumbL || cur.thumb || covers[cur.parent] || '', dur: audio.duration || cur.dur || 0, u: Date.now() };
  scheduleSync(60000);
}
function saveProgress() {
  if (!cur || pendingSeek != null || !isFinite(audio.duration) || !audio.duration || audio.src === SILENT) return;
  const t = dragT != null ? dragT : audio.currentTime;
  if (Math.abs(t - lastPos) < 1 && prog(cur.id)) return;
  lastPos = t;
  data.progress[cur.id] = { pos: t, dur: audio.duration, u: Date.now() };
  if (data.recents[cur.id]) { data.recents[cur.id].u = Date.now(); data.recents[cur.id].dur = audio.duration; }
  scheduleSync(60000);
}
function play() { if (!cur) return; wantPlay = true; audio.muted = false; if (audio.src === SILENT || !audio.src) return openTrack(cur.id, cur.parent, undefined, true); audio.play().catch(() => {}); touchRecent(); }
function pause() { wantPlay = false; audio.pause(); }
function toggle() { audio.paused ? play() : pause(); }
function skip(s) { if (!isFinite(audio.duration)) return; audio.currentTime = Math.max(0, Math.min(audio.duration - .5, audio.currentTime + s)); renderTime(); }
function qIndex() { return cur ? queue.findIndex(q => q.id === cur.id) : -1; }
function next() { const i = qIndex(); if (i >= 0 && i < queue.length - 1) playItem(queue[i + 1], queue, 0, true, cur.parentName); else toast('هذا آخر جزء'); }
function prev() { const i = qIndex(); if (audio.currentTime > 5 || i <= 0) { audio.currentTime = 0; return; } playItem(queue[i - 1], queue, 0, true, cur.parentName); }
function setSpeed() { const i = SPEEDS.indexOf(cfg.speed); cfg.speed = SPEEDS[(i + 1) % SPEEDS.length]; audio.playbackRate = cfg.speed; saveCfg(); renderChips(); }
function setHue(n) { document.documentElement.style.setProperty('--h', hash(n) % 360); }

audio.addEventListener('loadedmetadata', () => {
  if (audio.src === SILENT) return;
  if (pendingSeek != null) { try { audio.currentTime = Math.min(pendingSeek, Math.max(0, audio.duration - 1)); } catch {} pendingSeek = null; }
  audio.playbackRate = cfg.speed;
  if (cur && data.recents[cur.id]) data.recents[cur.id].dur = audio.duration;
  renderTime(); renderMarkers();
});
audio.addEventListener('play', () => { audio.playbackRate = cfg.speed; renderPP(); if (audio.src !== SILENT) refreshLists(); });
audio.addEventListener('playing', () => { retrying = false; });
audio.addEventListener('pause', () => { if (audio.src === SILENT) return; saveProgress(); scheduleSync(2000); renderPP(); refreshLists(); });
audio.addEventListener('timeupdate', () => {
  if (audio.src === SILENT) return;
  renderTime();
  const now = Date.now();
  if (now - lastSave > 5000) { lastSave = now; saveProgress(); positionState(); }
});
audio.addEventListener('ended', () => {
  if (!cur) return;
  data.progress[cur.id] = { pos: audio.duration, dur: audio.duration, u: Date.now() }; scheduleSync(3000);
  if (sleep.mode === 'end') { sleep = { mode: 0, at: 0 }; renderChips(); wantPlay = false; renderPP(); return; }
  const i = qIndex();
  if (i >= 0 && i < queue.length - 1) playItem(queue[i + 1], queue, 0, true, cur.parentName); else { wantPlay = false; renderPP(); refreshLists(); }
});
audio.addEventListener('error', async () => {
  // روابط ون درايف المؤقتة تنتهي بعد مدة؛ نجيب رابط جديد ونكمل من نفس المكان
  if (!cur || retrying || !audio.src || audio.src === SILENT) return;
  retrying = true;
  const pos = lastPos || (prog(cur.id) || {}).pos || 0, id = cur.id;
  try { const url = await src().stream(id); if (!cur || cur.id !== id) return; pendingSeek = pos; audio.src = url; if (wantPlay) audio.play().catch(() => {}); }
  catch (e) { if (e.name === 'AuthError') authToast(); else toast('انقطع التشغيل، تأكد من الاتصال'); }
  setTimeout(() => { retrying = false; }, 8000);
});

/* sleep timer */
setInterval(() => {
  if (typeof sleep.mode === 'number' && sleep.mode > 0) {
    const left = sleep.at - Date.now();
    if (left <= 0) { sleep = { mode: 0, at: 0 }; fadeOut(); }
    const el = $('#slT'); if (el && sleep.mode) el.textContent = fmt((sleep.at - Date.now()) / 1000); else renderChips();
  }
}, 1000);
function fadeOut() {
  let v = 1; const st = setInterval(() => { v -= .1; try { audio.volume = Math.max(0, v); } catch {} if (v <= 0) { clearInterval(st); pause(); try { audio.volume = 1; } catch {} } }, 500);
}

/* media session (lock screen / headphones) */
function mediaMeta() {
  if (!('mediaSession' in navigator) || !cur) return;
  try {
    const art = safeUrl(cur.thumbL || cur.thumb || covers[cur.parent]);
    navigator.mediaSession.metadata = new MediaMetadata({ title: base(cur.name), artist: cur.parentName || 'مكتبتي', album: cur.parentName || '', artwork: art ? [{ src: art, sizes: '512x512' }] : [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
  } catch {}
}
function positionState() { try { if ('mediaSession' in navigator && isFinite(audio.duration)) navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch {} }
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession, set = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
  set('play', play); set('pause', pause);
  set('seekbackward', d => skip(-((d && d.seekOffset) || cfg.skip))); set('seekforward', d => skip((d && d.seekOffset) || cfg.skip));
  set('previoustrack', prev); set('nexttrack', next);
  set('seekto', d => { if (d && d.seekTime != null) { audio.currentTime = d.seekTime; renderTime(); } });
}

/* player rendering */
const pl = $('#pl'), mini = $('#mini');
function renderPlayer() {
  if (!cur) {
    pl.innerHTML = `<div class="pempty">${I.lib}<span>اختر كتاباً من المكتبة<br>وبيظهر هنا.</span></div>`;
    mini.classList.remove('show'); return;
  }
  const i = qIndex(), n = queue.length;
  const sk = cfg.skip;
  pl.innerHTML = `
    <div class="hdr"><button class="ib g close-pl" data-a="close-player" aria-label="إغلاق المشغّل">${I.down}</button>
      <span class="sub" style="text-align:center;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cur.parentName || 'كتاب فردي')}</span>
      <button class="ib g" data-a="queue" aria-label="قائمة الأجزاء" ${n > 1 ? '' : 'style="visibility:hidden"'}>${I.list}</button></div>
    ${cover(cur.parentName || cur.name, cur.thumbL || cur.thumb || covers[cur.parent], 'pcover')}
    <div class="ptitle"><div style="min-width:0"><h2>${esc(base(cur.name))}</h2><span class="sub">${n > 1 ? `${arNum(i + 1)} من ${arNum(n)}` : esc(cur.parentName || '')}</span></div>
      <button class="ib g" data-a="mark" aria-label="إضافة علامة مرجعية (B)">${I.markPlus}</button></div>
    <div><div class="seek" id="seek" role="slider" tabindex="0" aria-label="موضع التشغيل" aria-valuemin="0"><div class="tr"></div><div class="fl" id="sFl"></div><div id="sMk"></div><div class="th" id="sTh"></div></div>
      <div class="times"><span id="tCur">0:00</span><span id="tRem">-0:00</span></div></div>
    <div class="ctrls">
      <button class="ctrl" data-a="rw" aria-label="رجوع ${sk} ثانية">${I.rw}<span class="n">${sk}</span></button>
      <button class="ctrl" data-a="prev" aria-label="الجزء السابق">${I.prev}</button>
      <button class="pp g" data-a="pp" id="pp" aria-label="تشغيل"></button>
      <button class="ctrl" data-a="next" aria-label="الجزء التالي">${I.next}</button>
      <button class="ctrl" data-a="fw" aria-label="تقديم ${sk} ثانية">${I.fw}<span class="n">${sk}</span></button>
    </div>
    <div class="chips" id="chips"></div>
    <div class="panel"><div class="seg" role="tablist"><button role="tab" data-a="tab" data-v="marks" id="tbM"></button><button role="tab" data-a="tab" data-v="notes" id="tbN"></button></div><div id="pList"></div></div>`;
  bindSeek();
  mini.innerHTML = `<button class="open" data-a="open-player" aria-label="فتح المشغّل">${cover(cur.parentName || cur.name, cur.thumb || covers[cur.parent], '', false)}<span class="tx"><b>${esc(base(cur.name))}</b><span class="mono" id="mT" style="text-align:right">0:00</span></span></button><button class="ib" data-a="pp" id="mPP" aria-label="تشغيل"></button><div class="mbar"><i id="mB"></i></div>`;
  mini.classList.add('show');
  renderPP(); renderChips(); renderTime(); renderMarkers(); renderPanel();
}
function renderPP() {
  const playing = !audio.paused && audio.src !== SILENT;
  const pp = $('#pp'), m = $('#mPP');
  if (pp) { pp.innerHTML = playing ? I.pause(30) : I.play(30); pp.setAttribute('aria-label', playing ? 'إيقاف مؤقت' : 'تشغيل'); }
  if (m) { m.innerHTML = playing ? I.pause(22) : I.play(22); m.setAttribute('aria-label', playing ? 'إيقاف مؤقت' : 'تشغيل'); }
  document.querySelectorAll('.badge.go').forEach(b => b.classList.toggle('paused', !playing));
}
function renderTime(tOverride) {
  if (!cur) return;
  const d = isFinite(audio.duration) && audio.src !== SILENT ? audio.duration : ((prog(cur.id) || {}).dur || cur.dur || 0);
  const t = tOverride != null ? tOverride : dragT != null ? dragT : (audio.src && audio.src !== SILENT ? audio.currentTime : ((prog(cur.id) || {}).pos || 0));
  const pct = d ? Math.min(100, t / d * 100) : 0;
  const fl = $('#sFl'); if (fl) { fl.style.width = pct + '%'; $('#sTh').style.left = pct + '%'; $('#tCur').textContent = fmt(t); $('#tRem').textContent = '-' + fmt(d - t); const s = $('#seek'); s.setAttribute('aria-valuemax', Math.round(d)); s.setAttribute('aria-valuenow', Math.round(t)); s.setAttribute('aria-valuetext', fmt(t)); }
  const mb = $('#mB'); if (mb) { mb.style.width = pct + '%'; $('#mT').textContent = `${fmt(t)} / ${fmt(d)}`; }
}
function renderChips() {
  const c = $('#chips'); if (!c) return;
  const sl = sleep.mode === 'end' ? 'نهاية الجزء' : sleep.mode ? fmt((sleep.at - Date.now()) / 1000) : 'مؤقت النوم';
  c.innerHTML = `<button class="chip g mono" data-a="speed" aria-label="سرعة التشغيل">${cfg.speed}×</button>
    <button class="chip g ${sleep.mode ? 'on' : ''}" data-a="sleep">${I.moon}<span id="slT" class="${sleep.mode && sleep.mode !== 'end' ? 'mono' : ''}">${sl}</span></button>
    <button class="chip g" data-a="note" aria-label="إضافة ملاحظة على التوقيت الحالي (N)">${I.plus} ملاحظة</button>`;
}
function curItems(kind) { return cur ? Object.values(data[kind]).filter(x => !x.del && x.item === cur.id).sort((a, b) => a.t - b.t) : []; }
function renderMarkers() {
  const box = $('#sMk'); if (!box || !cur) return;
  const d = isFinite(audio.duration) && audio.src !== SILENT ? audio.duration : ((prog(cur.id) || {}).dur || cur.dur || 0);
  if (!d) { box.innerHTML = ''; return; }
  box.innerHTML = curItems('marks').map(m => `<i class="mk" style="left:${Math.min(100, m.t / d * 100)}%"></i>`).join('') + curItems('notes').map(m => `<i class="mk n" style="left:${Math.min(100, m.t / d * 100)}%"></i>`).join('');
}
function renderPanel() {
  const l = $('#pList'); if (!l) return;
  const M = curItems('marks'), N = curItems('notes');
  $('#tbM').textContent = 'العلامات' + (M.length ? ` (${M.length})` : ''); $('#tbN').textContent = 'الملاحظات' + (N.length ? ` (${N.length})` : '');
  $('#tbM').classList.toggle('on', tab === 'marks'); $('#tbN').classList.toggle('on', tab === 'notes');
  $('#tbM').setAttribute('aria-selected', tab === 'marks'); $('#tbN').setAttribute('aria-selected', tab === 'notes');
  const arr = tab === 'marks' ? M : N;
  l.innerHTML = arr.length ? arr.map(x => itemHTML(tab, x, false)).join('') : `<div class="empty">${tab === 'marks' ? 'ما فيه علامات لهذا الجزء بعد.' : 'ما فيه ملاحظات لهذا الجزء بعد.'}</div>`;
}
function bindSeek() {
  const s = $('#seek'); let drag = false;
  const at = e => { const r = s.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (audio.duration || 0); };
  s.addEventListener('pointerdown', e => { if (!isFinite(audio.duration)) return; drag = true; s.setPointerCapture(e.pointerId); dragT = at(e); renderTime(); });
  s.addEventListener('pointermove', e => { if (drag) { dragT = at(e); renderTime(); } });
  const end = e => { if (!drag) return; drag = false; const t = at(e); dragT = null; audio.currentTime = t; renderTime(); };
  s.addEventListener('pointerup', end); s.addEventListener('pointercancel', () => { drag = false; dragT = null; renderTime(); });
  s.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { skip(5); e.preventDefault(); e.stopPropagation(); } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { skip(-5); e.preventDefault(); e.stopPropagation(); } });
}
function refreshLists() {
  const r = route(), st = main.scrollTop;
  if (r.name === 'folder') { const kids = memKids.get(r.id); if (kids && $('#fBody')) $('#fBody').innerHTML = folderBody(known.get(r.id) || { id: r.id, name: '' }, kids); }
  else if (r.name === 'home') { const kids = memKids.get(cfg.demo ? 'root' : cfg.rootId); if (kids && $('#homeBody') && !($('#q') && $('#q').value.trim())) $('#homeBody').innerHTML = homeBody(kids); }
  main.scrollTop = st;
}
function openPlayer() { $('#player').classList.add('open'); }
function closePlayer() { $('#player').classList.remove('open'); }

/* ---------- bookmarks & notes ---------- */
function newEntry(kind, t, text) {
  const id = uid();
  data[kind][id] = { id, item: cur.id, itemName: cur.name, parent: cur.parent || '', parentName: cur.parentName || '', t, text: text || '', c: Date.now(), u: Date.now() };
  return id;
}
function addMark() {
  if (!cur) return;
  const t = audio.currentTime || 0, id = newEntry('marks', t);
  scheduleSync(3000); tab = 'marks'; renderPanel(); renderMarkers();
  toast('أُضيفت علامة عند ' + fmt(t), 'تسمية', () => openEntrySheet('marks', id));
}
function delEntry(kind, id) {
  const x = data[kind][id]; if (!x) return;
  x.del = true; x.u = Date.now(); scheduleSync(3000); afterEntryChange();
  toast(kind === 'notes' ? 'حُذفت الملاحظة' : 'حُذفت العلامة', 'تراجع', () => { x.del = false; x.u = Date.now(); scheduleSync(3000); afterEntryChange(); });
}
function afterEntryChange() { renderPanel(); renderMarkers(); const r = route(); if (r.name === 'marks' || r.name === 'notes') render(); }

/* ---------- sheet ---------- */
const sheet = $('#sheet'); let sheetState = null;
function openSheet(html) { sheet.innerHTML = `<div class="sheet g">${html}</div>`; sheet.classList.add('open'); }
function closeSheet() {
  sheet.classList.remove('open'); sheet.innerHTML = '';
  if (sheetState && sheetState.resume) play();
  sheetState = null;
}
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
function openEntrySheet(kind, id) {
  const isN = kind === 'notes', ex = id ? data[kind][id] : null;
  if (!ex && !cur) return;
  sheetState = { kind, id, t: ex ? ex.t : (audio.currentTime || 0), resume: false };
  if (isN && !ex && cfg.pauseOnNote && !audio.paused) { audio.pause(); sheetState.resume = true; }
  const ctx = ex ? base(ex.itemName) + (ex.parentName ? ' · ' + ex.parentName : '') : base(cur.name) + (cur.parentName ? ' · ' + cur.parentName : '');
  openSheet(`<div class="grab" aria-hidden="true"></div>
    <div class="hdr"><h2 style="margin:0;font-size:20px;font-weight:700">${isN ? (ex ? 'تعديل الملاحظة' : 'ملاحظة جديدة') : 'عنوان العلامة'}</h2><button class="ib g" data-a="sheet-close" aria-label="إغلاق" style="width:40px;height:40px">${I.x}</button></div>
    <div style="display:flex;flex-direction:column;gap:6px"><span class="sub">${esc(ctx)}</span>
      <div style="display:flex;align-items:center;gap:8px"><button class="btn sm g mono" data-a="shift" data-v="-5" aria-label="قبل 5 ثوانٍ">−5s</button>
      <div class="tchip ${isN ? '' : 'm'}">${I.clock}<span class="mono" id="shT">${fmt(sheetState.t)}</span></div>
      <button class="btn sm g mono" data-a="shift" data-v="5" aria-label="بعد 5 ثوانٍ">+5s</button></div></div>
    ${isN ? `<label class="field">الملاحظة<textarea class="in" id="shTx" placeholder="اكتب ما خطر لك عند هذه اللحظة…">${esc(ex ? ex.text : '')}</textarea></label>`
      : `<label class="field">العنوان (اختياري)<input class="in" id="shTx" placeholder="مثال: بداية الفصل الثاني" value="${esc(ex ? ex.text : '')}"></label>`}
    <div class="acts"><button class="btn w" style="flex:1" data-a="sheet-save">حفظ</button><button class="btn g" data-a="sheet-close">إلغاء</button></div>`);
  setTimeout(() => { const t = $('#shTx'); if (t) t.focus(); }, 60);
}
function saveSheet() {
  const s = sheetState; if (!s) return;
  const txt = ($('#shTx').value || '').trim();
  if (s.kind === 'notes' && !txt) { toast('اكتب الملاحظة أولاً'); return; }
  if (s.id && data[s.kind][s.id]) Object.assign(data[s.kind][s.id], { t: s.t, text: txt, u: Date.now() });
  else { newEntry(s.kind, s.t, txt); tab = s.kind; }
  scheduleSync(3000); closeSheet(); afterEntryChange();
}
function openQueueSheet() {
  openSheet(`<div class="grab" aria-hidden="true"></div><div class="hdr"><h2 style="margin:0;font-size:20px;font-weight:700">${esc(cur.parentName || 'الأجزاء')}</h2><button class="ib g" data-a="sheet-close" aria-label="إغلاق" style="width:40px;height:40px">${I.x}</button></div>
    <div>${queue.map((t, i) => `<button class="opt ${t.id === cur.id ? 'on' : ''}" data-a="q-play" data-i="${i}"><span>${arNum(i + 1)}. ${esc(base(t.name))}</span>${isDone(prog(t.id), t.dur) ? I.check : ''}</button>`).join('')}</div>`);
}
function openSleepSheet() {
  const opts = [[0, 'إيقاف المؤقت'], [15, '15 دقيقة'], [30, '30 دقيقة'], [45, '45 دقيقة'], [60, 'ساعة'], ['end', 'نهاية الجزء الحالي']];
  openSheet(`<div class="grab" aria-hidden="true"></div><div class="hdr"><h2 style="margin:0;font-size:20px;font-weight:700">مؤقت النوم</h2><button class="ib g" data-a="sheet-close" aria-label="إغلاق" style="width:40px;height:40px">${I.x}</button></div>
    <div>${opts.map(([v, l]) => `<button class="opt ${sleep.mode === v ? 'on' : ''}" data-a="sleep-set" data-v="${v}">${l}</button>`).join('')}</div>`);
}

/* ---------- export ---------- */
function exportAll() {
  const groups = {};
  for (const kind of ['notes', 'marks']) for (const x of Object.values(data[kind]).filter(x => !x.del)) {
    const k = (x.parentName ? x.parentName + ' — ' : '') + base(x.itemName);
    (groups[k] = groups[k] || []).push({ kind, x });
  }
  let md = '# ملاحظاتي وعلاماتي\n';
  for (const k of Object.keys(groups).sort()) {
    md += `\n## ${k}\n`;
    for (const { kind, x } of groups[k].sort((a, b) => a.x.t - b.x.t)) md += `- [${fmt(x.t)}] ${kind === 'marks' ? '🔖 ' + (x.text || 'علامة') : x.text.replace(/\n/g, ' ')}\n`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
  a.download = 'ملاحظاتي.md'; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- actions (event delegation) ---------- */
const A = {
  login() {
    const c = $('#fClient'), r = $('#fRoot');
    if (c) { const v = c.value.trim(); if (!/^[0-9a-f-]{36}$/i.test(v)) { toast('معرّف التطبيق غير صحيح'); c.focus(); return; } cfg.clientId = v; }
    if (r) { cfg.rootPath = r.value.trim(); cfg.rootId = ''; }
    cfg.demo = false; saveCfg(); login(false);
  },
  demo() { cfg.demo = true; saveCfg(); location.hash = '#/'; render(); },
  'exit-demo'() { cfg.demo = false; saveCfg(); audio.pause(); cur = null; LS.del('cur'); renderPlayer(); render(); },
  reload() { render(); },
  resume(d) { if (cur && cur.id === d.id) { toggle(); return; } openTrack(d.id, d.parent); },
  play(d) { if (cur && cur.id === d.id) { toggle(); return; } openTrack(d.id, d.parent); },
  'open-at'(d) { const t = +d.t, r = route().name; if (cur && cur.id === d.id && audio.src && audio.src !== SILENT) { audio.currentTime = t; play(); renderTime(); } else openTrack(d.id, d.parent, t); if ((r === 'marks' || r === 'notes') && matchMedia('(max-width:899px)').matches) openPlayer(); },
  up(d) { const f = known.get(d.id), rid = cfg.demo ? 'root' : cfg.rootId; location.hash = f && f.parent && f.parent !== rid ? '#/f/' + encodeURIComponent(f.parent) : '#/'; },
  pp() { toggle(); }, rw() { skip(-cfg.skip); }, fw() { skip(cfg.skip); }, prev, next,
  speed: setSpeed, sleep: openSleepSheet, queue: openQueueSheet,
  'sleep-set'(d) { const v = d.v === 'end' ? 'end' : +d.v; sleep = v ? { mode: v, at: v === 'end' ? 0 : Date.now() + v * 60000 } : { mode: 0, at: 0 }; closeSheet(); renderChips(); if (v) toast(v === 'end' ? 'بيتوقف الصوت في نهاية الجزء' : `بيتوقف الصوت بعد ${arNum(v)} دقيقة`); },
  'q-play'(d) { const t = queue[+d.i]; closeSheet(); if (t && t.id !== cur.id) playItem(t, queue, undefined, true, cur.parentName); },
  mark: addMark, note() { openEntrySheet('notes'); },
  tab(d) { tab = d.v; renderPanel(); },
  edit(d) { openEntrySheet(d.k, d.id); }, del(d) { delEntry(d.k, d.id); },
  shift(d) { if (!sheetState) return; sheetState.t = Math.max(0, sheetState.t + (+d.v)); $('#shT').textContent = fmt(sheetState.t); },
  'sheet-save': saveSheet, 'sheet-close': closeSheet,
  'open-player': openPlayer, 'close-player': closePlayer,
  export: exportAll,
  sync() { toast('جاري المزامنة…'); doSync().then(() => toast('تمت المزامنة')); },
  signout() { signOut(); },
  'save-root'() { cfg.rootPath = $('#sRoot').value.trim(); cfg.rootId = ''; saveCfg(); toast('تم حفظ المجلد'); location.hash = '#/'; },
  'skip-opt'(d) { cfg.skip = +d.v; saveCfg(); render(); renderPlayer(); },
  't-pause'() { cfg.pauseOnNote = !cfg.pauseOnNote; saveCfg(); render(); },
  't-lite'() { cfg.lite = !cfg.lite; saveCfg(); applyCfg(); render(); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  e.preventDefault(); fn(el.dataset);
});
document.addEventListener('keydown', e => {
  if (sheet.classList.contains('open')) { if (e.key === 'Escape') closeSheet(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveSheet(); return; }
  if (e.target.closest('input,textarea') || e.metaKey || e.ctrlKey || e.altKey || !loggedIn()) return;
  if (e.key === 'Escape') { closePlayer(); return; }
  if (e.code === 'Space') { if (e.target.closest('button,a,[role=slider]')) return; e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); skip(cfg.skip); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); skip(-cfg.skip); }
  else if (e.code === 'KeyB') { e.preventDefault(); addMark(); }
  else if (e.code === 'KeyN') { e.preventDefault(); if (cur) openEntrySheet('notes'); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveProgress(); persist(); if (tok && !cfg.demo) doSync(); }
  else if (tok && !cfg.demo && Date.now() - lastPull > 60000) doSync();
});
window.addEventListener('pagehide', () => { saveProgress(); persist(); });
window.addEventListener('hashchange', () => { closePlayer(); render(); });

/* ---------- boot ---------- */
function applyCfg() { document.body.classList.toggle('lite', !!cfg.lite); }
async function boot() {
  applyCfg();
  try { await handleRedirect(); } catch (e) { toast('تعذّر إكمال تسجيل الدخول'); console.warn(e); }
  if (!cfg.demo && tok) { try { await getToken(); } catch (e) { tok = null; LS.del('tok'); toast('انتهت الجلسة، سجّل الدخول من جديد'); } }
  render(); renderPlayer();
  if (loggedIn()) {
    if (!cfg.demo) doSync();
    const last = LS.get('cur', null);
    if (last && last.id) openTrack(last.id, last.parent, undefined, false);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {} }
}
boot();
