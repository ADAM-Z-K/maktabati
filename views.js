'use strict';
/* ---------- toast ---------- */
let toastT;
function toast(msg, label, fn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${label ? `<button type="button">${esc(label)}</button>` : ''}`;
  if (label) el.querySelector('button').onclick = () => { el.classList.remove('show'); fn(); };
  el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), label ? 5000 : 3000);
}
const authToast = () => toast('انتهت جلسة ون درايف', 'تسجيل الدخول', () => login(false));

/* ---------- router ---------- */
const NAV = { home: ['المكتبة', I.lib], marks: ['العلامات', I.mark], notes: ['الملاحظات', I.note], settings: ['الإعدادات', I.gear] };
document.querySelectorAll('#nav a').forEach(a => { const [t, ic] = NAV[a.dataset.r]; a.innerHTML = `${ic}<span>${t}</span>`; });
function route() {
  const h = location.hash.slice(1) || '/';
  if (h.startsWith('/f/')) return { name: 'folder', id: decodeURIComponent(h.slice(3)) };
  if (h === '/marks') return { name: 'marks' }; if (h === '/notes') return { name: 'notes' }; if (h === '/settings') return { name: 'settings' };
  return { name: 'home' };
}
let seq = 0;
const main = $('#main');
function render() {
  seq++;
  document.body.classList.toggle('setup', !loggedIn());
  if (!loggedIn()) return viewSetup();
  const r = route();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (r.name === 'folder' ? 'home' : r.name)));
  if (r.name !== 'folder') main.scrollTop = 0;
  ({ home: viewHome, folder: () => viewFolder(r.id), marks: () => viewList('marks'), notes: () => viewList('notes'), settings: viewSettings })[r.name]();
}
function viewError(e, retry = true) {
  if (e && e.name === 'AuthError') { authToast(); }
  const msg = e && e.message === 'NOFOLDER' ? 'ما لقيت مجلد المكتبة في ون درايف. تأكد من اسم المجلد في الإعدادات.' : 'تعذّر تحميل المحتوى. تأكد من الاتصال بالإنترنت.';
  return `<div class="card g"><p>${msg}</p><div class="acts">${retry ? '<button class="btn sm g" data-a="reload">إعادة المحاولة</button>' : ''}<a class="btn sm g" href="#/settings">الإعدادات</a></div></div>`;
}

/* cached listing: show cache instantly, refresh in background */
async function listChildren(id, cb) {
  const key = 'c:' + id, cached = cfg.demo ? null : LS.get(key, null);
  if (cached) { cached.forEach(remember); memKids.set(id, cached); cb(cached); }
  try {
    const fresh = (await src().children(id)).sort(nat);
    fresh.forEach(remember); memKids.set(id, fresh);
    if (!cfg.demo) LS.set(key, fresh);
    if (!cached || JSON.stringify(cached) !== JSON.stringify(fresh)) cb(fresh);
    return fresh;
  } catch (e) { if (!cached) throw e; return cached; }
}
async function childrenQuick(id) {
  const c = memKids.get(id) || (cfg.demo ? null : LS.get('c:' + id, null));
  if (c) { c.forEach(remember); return c; }
  const f = (await src().children(id)).sort(nat); f.forEach(remember); memKids.set(id, f); if (!cfg.demo) LS.set('c:' + id, f); return f;
}

/* ---------- helpers for progress ---------- */
const prog = id => data.progress[id];
const isDone = (p, dur) => !!p && (p.dur || dur) > 0 && p.pos >= (p.dur || dur) - 20;
function folderCover(f) { return f.thumb || covers[f.id] || ''; }

/* ---------- views ---------- */
const framed = (() => { try { return window.top !== window; } catch { return true; } })();
function viewSetup() {
  const hard = !!CLIENT_ID;
  main.innerHTML = `<div class="wrap" style="max-width:560px;padding-top:4vh">
    <div><h1 class="t">مكتبتي</h1><div class="sub" style="margin-top:4px">مكتبتك الصوتية من ون درايف، بواجهة واحدة أنيقة.</div></div>
    <div class="card g">
      <h2>ربط ون درايف</h2>
      <p>تسجّل الدخول مرة وحدة، وبعدها يفتح التطبيق على مكتبتك مباشرة.</p>
      ${hard ? '' : `<label class="field">معرّف التطبيق (Client ID)<input class="in mono" id="fClient" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${esc(cfg.clientId)}" autocomplete="off" spellcheck="false"></label>`}
      <label class="field">مجلد الكتب الصوتية في ون درايف<input class="in" id="fRoot" placeholder="مثال: الكتب الصوتية" value="${esc(cfg.rootPath)}"></label>
      ${framed ? '<p style="font-size:13px;color:#FFD27A">هذي معاينة داخل Claude: تسجيل الدخول يشتغل بعد ما ترفع التطبيق على موقعك. جرّب الوضع التجريبي تحت.</p>' : ''}
      <button class="btn w" data-a="login">تسجيل الدخول بحساب مايكروسوفت</button>
      ${hard ? '' : `<p style="font-size:13px">عنوان إعادة التوجيه اللي تسجّله في Azure (نوع Single-page application):</p><div class="code">${esc(redirectUri())}</div>`}
    </div>
    <div class="card g"><h2>تبغى تجرّب أول؟</h2><p>الوضع التجريبي يعرض مكتبة نموذجية بأصوات قصيرة، وتقدر تجرب فيه العلامات والملاحظات.</p><button class="btn g" data-a="demo">جرّب الوضع التجريبي</button></div>
  </div>`;
}

function viewHome() {
  const my = seq;
  main.innerHTML = `<div class="wrap">
    <div class="hdr"><div><h1 class="t">مكتبتي</h1><div class="sub">${cfg.demo ? 'الوضع التجريبي' : 'مرتبطة بـ OneDrive'}</div></div></div>
    <label class="search g">${I.search}<span class="sr">ابحث في المكتبة</span><input id="q" type="search" placeholder="ابحث عن كتاب أو سلسلة" autocomplete="off"></label>
    <div id="homeBody" class="wrap" style="max-width:none"><div class="sk" style="height:116px"></div><div class="sk" style="height:150px"></div><div class="sk" style="height:220px"></div></div>
  </div>`;
  const q = $('#q');
  let items = null;
  const draw = list => { if (my !== seq) return; items = list; if (!q.value.trim()) $('#homeBody').innerHTML = homeBody(list); };
  q.addEventListener('input', debounce(async () => {
    const v = q.value.trim();
    if (v.length < 2) { if (items) $('#homeBody').innerHTML = homeBody(items); return; }
    $('#homeBody').innerHTML = '<div class="sk" style="height:200px"></div>';
    try { const res = (await src().search(v)).sort(nat); res.forEach(remember); if (my === seq && q.value.trim() === v) $('#homeBody').innerHTML = searchBody(res, v); }
    catch (e) { if (my === seq) $('#homeBody').innerHTML = viewError(e); }
  }, 350));
  src().rootId().then(id => listChildren(id, draw)).catch(e => { if (my === seq) $('#homeBody').innerHTML = viewError(e); });
}
function homeBody(items) {
  const folders = items.filter(i => i.folder), books = items.filter(i => i.audio);
  const rec = Object.values(data.recents).filter(r => !r.del).sort((a, b) => b.u - a.u);
  let h = '';
  const c = rec[0];
  if (c) {
    const p = prog(c.id), dur = (p && p.dur) || c.dur || 0, pct = dur ? Math.min(100, (p ? p.pos : 0) / dur * 100) : 0;
    h += `<button class="cont g" data-a="resume" data-id="${esc(c.id)}" data-parent="${esc(c.parent)}">
      ${cover(c.parentName || c.name, c.thumb)}
      <div class="tx"><span>أكمل الاستماع</span><b>${esc(base(c.name))}</b><span>${esc(c.parentName || 'كتاب')}${dur && p ? ' · بقي <span class="mono">' + fmt(dur - p.pos) + '</span>' : ''}</span><div class="bar"><i style="width:${pct}%"></i></div></div>
      <span class="pbtn" aria-hidden="true">${cur && cur.id === c.id && !audio.paused ? I.pause(18) : I.play(18)}</span></button>`;
  }
  const more = rec.slice(1, 8);
  if (more.length) h += `<section class="sec"><h2>استمعت مؤخراً</h2><div class="tiles">${more.map(r => `<button class="tile sm" data-a="resume" data-id="${esc(r.id)}" data-parent="${esc(r.parent)}"><div class="stack single">${cover(r.parentName || r.name, r.thumb)}</div><b>${esc(base(r.name))}</b><small>${esc(r.parentName || 'كتاب')}</small></button>`).join('')}</div></section>`;
  if (folders.length) h += `<section class="sec"><h2>السلاسل</h2><div class="tiles">${folders.map(tile).join('')}</div></section>`;
  if (books.length) h += `<section class="sec"><h2>كتب فردية</h2><div class="list g">${books.map(b => bookRow(b)).join('')}</div></section>`;
  if (!folders.length && !books.length) h += `<div class="card g"><p>المجلد فارغ أو ما فيه ملفات صوتية.</p><a class="btn sm g" href="#/settings">تغيير المجلد</a></div>`;
  return h;
}
function tile(f) {
  return `<a class="tile" href="#/f/${encodeURIComponent(f.id)}"><div class="stack">${cover(f.name, folderCover(f))}</div><b>${esc(f.name)}</b><small>${f.count ? arNum(f.count) + ' عناصر' : 'مجلد'}</small></a>`;
}
function bookRow(b) {
  const p = prog(b.id), dur = (p && p.dur) || b.dur, done = isDone(p, dur), isCur = cur && cur.id === b.id;
  const end = isCur ? (audio.paused ? 'متوقف' : 'يُشغَّل') : done ? 'مكتمل' : p && p.pos > 5 && dur ? arNum(Math.round(p.pos / dur * 100)) + '٪' : 'جديد';
  return `<button class="row ${isCur ? 'cur' : ''}" data-a="play" data-id="${esc(b.id)}" data-parent="${esc(b.parent)}">${cover(b.name, b.thumb, '', false)}<div class="tx"><b>${esc(base(b.name))}</b><span>${dur ? fmtLong(dur) : 'ملف صوتي'}</span></div><span class="end">${end}</span></button>`;
}
function searchBody(res, v) {
  if (!res.length) return `<div class="empty">ما فيه نتائج لـ «${esc(v)}»</div>`;
  return `<section class="sec"><h2>نتائج البحث</h2><div class="list g">${res.map(r => r.folder
    ? `<a class="row" href="#/f/${encodeURIComponent(r.id)}">${cover(r.name, folderCover(r), '', false)}<div class="tx"><b>${esc(r.name)}</b><span>سلسلة / مجلد</span></div></a>`
    : bookRow(r)).join('')}</div></section>`;
}

async function viewFolder(id) {
  const my = seq;
  main.innerHTML = `<div class="wrap"><div class="hdr"><button class="ib g" data-a="up" data-id="${esc(id)}" aria-label="رجوع">${I.back}</button></div><div id="fBody" class="wrap" style="max-width:none"><div class="sk" style="height:150px"></div><div class="sk" style="height:320px"></div></div></div>`;
  try {
    let f = known.get(id);
    if (!f || !f.name) { f = await src().item(id); remember(f); }
    await listChildren(id, kids => { if (my === seq) { $('#fBody').innerHTML = folderBody(known.get(id) || f, kids); } });
  } catch (e) { if (my === seq) $('#fBody').innerHTML = viewError(e); }
}
function folderBody(f, kids) {
  const subs = kids.filter(k => k.folder), tracks = kids.filter(k => k.audio);
  const img = kids.find(k => k.img && /^(cover|folder|front)/i.test(k.name)) || kids.find(k => k.img) || tracks.find(t => t.thumb);
  if (img && (img.thumbL || img.thumb) && covers[f.id] !== (img.thumbL || img.thumb)) { covers[f.id] = img.thumbL || img.thumb; LS.set('covers', covers); }
  const cv = folderCover(f);
  const total = tracks.reduce((s, t) => s + ((prog(t.id) || {}).dur || t.dur || 0), 0);
  const marks = Object.values(data.marks).filter(m => !m.del && m.parent === f.id).length;
  let target = null, label = 'ابدأ الاستماع';
  const started = tracks.filter(t => { const p = prog(t.id); return p && p.pos > 5 && !isDone(p, t.dur); }).sort((a, b) => prog(b.id).u - prog(a.id).u)[0];
  if (started) { target = started; label = 'أكمل: ' + base(started.name); }
  else { target = tracks.find(t => !isDone(prog(t.id), t.dur)) || tracks[0]; if (target && tracks.indexOf(target) > 0) label = 'التالي: ' + base(target.name); }
  let h = `<div class="fhead"><div class="stack">${cover(f.name, cv)}</div><div style="display:flex;flex-direction:column;gap:4px;min-width:0;padding-bottom:4px">
      <span class="sub">${subs.length && !tracks.length ? 'مجلد' : 'سلسلة'}</span><h1>${esc(f.name)}</h1>
      <span class="sub">${[tracks.length ? arNum(tracks.length) + ' ملفات' : '', subs.length ? arNum(subs.length) + ' مجلدات' : '', total ? fmtLong(total) : ''].filter(Boolean).join(' · ')}</span></div></div>`;
  if (target) h += `<div class="acts"><button class="btn w" data-a="play" data-id="${esc(target.id)}" data-parent="${esc(f.id)}">${I.play(16)}<span style="overflow:hidden;text-overflow:ellipsis">${esc(label)}</span></button>${marks ? `<a class="btn g" href="#/marks">${I.markS} ${arNum(marks)} علامات</a>` : ''}</div>`;
  if (subs.length) h += `<section class="sec"><h2>${tracks.length ? 'مجلدات' : 'الأجزاء'}</h2><div class="tiles">${subs.map(tile).join('')}</div></section>`;
  if (tracks.length) h += `<div class="list g">${tracks.map((t, i) => trackRow(t, i, f.id)).join('')}</div>`;
  if (!subs.length && !tracks.length) h += `<div class="empty">ما فيه ملفات صوتية في هذا المجلد.</div>`;
  return h;
}
function trackRow(t, i, parent) {
  const p = prog(t.id), dur = (p && p.dur) || t.dur, done = isDone(p, dur), started = p && p.pos > 5 && !done, isCur = cur && cur.id === t.id;
  const badge = isCur ? `<span class="badge go ${audio.paused ? 'paused' : ''}">${eq}</span>` : done ? `<span class="badge done">${I.check}</span>` : started ? `<span class="badge go">${I.play(13)}</span>` : `<span class="badge">${arNum(i + 1)}</span>`;
  const sub = [dur ? fmtLong(dur) : '', started && dur ? 'بقي <span class="mono">' + fmt(dur - p.pos) + '</span>' : '', done ? 'مكتمل' : ''].filter(Boolean).join(' · ');
  return `<button class="row ${isCur ? 'cur' : ''}" data-a="play" data-id="${esc(t.id)}" data-parent="${esc(parent)}">${badge}<div class="tx"><b>${esc(base(t.name))}</b><span>${sub || 'ملف صوتي'}</span>${started && dur ? `<div class="bar" style="height:4px;margin-top:3px"><i style="width:${p.pos / dur * 100}%"></i></div>` : ''}</div></button>`;
}

function viewList(kind) {
  const isN = kind === 'notes';
  const all = Object.values(data[kind]).filter(x => !x.del).sort((a, b) => (b.c || b.u) - (a.c || a.u));
  main.innerHTML = `<div class="wrap">
    <div class="hdr"><div><h1 class="t">${isN ? 'الملاحظات' : 'العلامات'}</h1><div class="sub">${all.length ? arNum(all.length) + (isN ? ' ملاحظة' : ' علامة') : ''}</div></div>
    ${all.length ? `<button class="btn sm g" data-a="export">${I.dl} تصدير</button>` : ''}</div>
    ${all.length ? `<div class="list g">${all.map(x => itemHTML(kind, x, true)).join('')}</div>`
      : `<div class="card g"><p>${isN ? 'أثناء الاستماع اضغط «ملاحظة» أو حرف N في الكيبورد، وتنحفظ الملاحظة على التوقيت نفسه.' : 'أثناء الاستماع اضغط زر العلامة أو حرف B في الكيبورد، وتقدر ترجع لنفس اللحظة بضغطة.'}</p></div>`}
  </div>`;
}
function itemHTML(kind, x, ctx) {
  const isN = kind === 'notes';
  const txt = isN ? x.text : (x.text || 'علامة بدون عنوان');
  return `<div class="item"><button class="go" data-a="open-at" data-id="${esc(x.item)}" data-parent="${esc(x.parent)}" data-t="${x.t}">
    <span class="tm mono ${isN ? 'n' : ''}">${fmt(x.t)}</span><span class="txt"><b>${esc(txt)}</b>${ctx ? `<span>${esc(base(x.itemName))}${x.parentName ? ' · ' + esc(x.parentName) : ''}</span>` : ''}</span></button>
    <button class="x" data-a="edit" data-k="${kind}" data-id="${esc(x.id)}" aria-label="تعديل">${I.edit}</button>
    <button class="x" data-a="del" data-k="${kind}" data-id="${esc(x.id)}" aria-label="حذف">${I.trash}</button></div>`;
}

function viewSettings() {
  const my = seq;
  const sw = (a, on, label) => `<div class="srow"><span>${label}</span><button class="sw" role="switch" aria-checked="${on}" aria-label="${label}" data-a="${a}"></button></div>`;
  main.innerHTML = `<div class="wrap" style="max-width:640px">
    <h1 class="t">الإعدادات</h1>
    <div class="card g"><h2>الحساب</h2><p id="acct">${cfg.demo ? 'الوضع التجريبي، بدون ون درايف' : '…'}</p>
      <div class="acts">${cfg.demo ? '<button class="btn sm w" data-a="exit-demo">ربط ون درايف</button>' : '<button class="btn sm g" data-a="sync">مزامنة الآن</button><button class="btn sm g" data-a="signout">تسجيل الخروج</button>'}</div></div>
    ${cfg.demo ? '' : `<div class="card g"><h2>مجلد المكتبة</h2><label class="field">المسار داخل ون درايف (فاضي = كل ون درايف)<input class="in" id="sRoot" value="${esc(cfg.rootPath)}" placeholder="مثال: الكتب الصوتية"></label><button class="btn sm g" data-a="save-root" style="align-self:flex-start">حفظ</button></div>`}
    <div class="card g"><h2>الاستماع</h2>
      <div class="srow"><span>مدة التقديم والرجوع</span></div>
      <div class="seg">${[10, 15, 30, 60].map(s => `<button class="${cfg.skip === s ? 'on' : ''}" data-a="skip-opt" data-v="${s}">${arNum(s)} ث</button>`).join('')}</div>
      ${sw('t-pause', cfg.pauseOnNote, 'إيقاف الصوت أثناء كتابة الملاحظة')}
      ${sw('t-lite', cfg.lite, 'تقليل الشفافية (أخف على الأجهزة القديمة)')}</div>
    <div class="card g"><h2>اختصارات الكيبورد</h2><p>المسافة: تشغيل/إيقاف · الأسهم: تقديم ورجوع · B: علامة · N: ملاحظة</p></div>
  </div>`;
  if (!cfg.demo) live.me().then(m => { if (my === seq && $('#acct')) $('#acct').textContent = `${m.displayName || ''} ${m.userPrincipalName ? '· ' + m.userPrincipalName : ''}`; }).catch(() => {});
}
