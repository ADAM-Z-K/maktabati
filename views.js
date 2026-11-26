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
const NAV = { home: ['المكتبة', I.lib], tags: ['التصنيفات', I.tag], marks: ['العلامات', I.mark], notes: ['الملاحظات', I.note], settings: ['الإعدادات', I.gear] };
document.querySelectorAll('#nav a').forEach(a => { const [t, ic] = NAV[a.dataset.r]; a.innerHTML = `${ic}<span>${t}</span>`; });
function route() {
  const h = location.hash.slice(1) || '/';
  if (h.startsWith('/f/')) return { name: 'folder', id: decodeURIComponent(h.slice(3)) };
  if (h.startsWith('/t/')) return { name: 'tag', id: decodeURIComponent(h.slice(3)) };
  if (h === '/tags') return { name: 'tags' };
  if (h === '/marks') return { name: 'marks' }; if (h === '/notes') return { name: 'notes' }; if (h === '/settings') return { name: 'settings' };
  return { name: 'home' };
}
let seq = 0, ANIM = true, flt = 'all', qv = '';
const main = $('#main');
function render() {
  seq++; ANIM = true; qv = ''; flt = 'all';
  document.body.classList.toggle('setup', !loggedIn());
  if (!loggedIn()) return viewSetup();
  const r = route();
  const navKey = r.name === 'folder' ? 'home' : r.name === 'tag' ? 'tags' : r.name;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === navKey));
  main.scrollTop = 0;
  ({ home: viewHome, folder: () => viewFolder(r.id), tags: viewTags, tag: () => viewTag(r.id), marks: () => viewList('marks'), notes: () => viewList('notes'), settings: viewSettings })[r.name]();
}
function viewError(e, retry = true) {
  if (e && e.name === 'AuthError') { authToast(); }
  const msg = e && e.message === 'NOFOLDER' ? 'ما لقيت مجلد المكتبة في ون درايف. تأكد من اسم المجلد في الإعدادات.' : 'تعذّر تحميل المحتوى. تأكد من الاتصال بالإنترنت.';
  return `<div class="card g"><p>${msg}</p><div class="acts">${retry ? '<button class="btn sm g" data-a="reload">إعادة المحاولة</button>' : ''}<a class="btn sm g" href="#/settings">الإعدادات</a></div></div>`;
}
const rise = i => ANIM ? ` rise" style="--i:${Math.min(i, 12)}` : '';
function paint(el, html) { if (!el) return; el.innerHTML = html; ART.scan(el); }

/* cached listing: show cache instantly, refresh in background */
async function listChildren(id, cb) {
  const key = 'c:' + id, cached = cfg.demo ? null : LS.get(key, null);
  if (cached) { cached.forEach(remember); memKids.set(id, cached); cb(cached); }
  try {
    const fresh = (await src().children(id)).sort(nat);
    fresh.forEach(remember); memKids.set(id, fresh);
    if (!cfg.demo) LS.set(key, fresh);
    if (!cached || JSON.stringify(cached) !== JSON.stringify(fresh)) { ANIM = !cached; cb(fresh); }
    return fresh;
  } catch (e) { if (!cached) throw e; return cached; }
}
async function childrenQuick(id) {
  const c = memKids.get(id) || (cfg.demo ? null : LS.get('c:' + id, null));
  if (c) { c.forEach(remember); return c; }
  const f = (await src().children(id)).sort(nat); f.forEach(remember); memKids.set(id, f); if (!cfg.demo) LS.set('c:' + id, f); return f;
}
const rootKey = () => cfg.demo ? 'root' : cfg.rootId;

/* ---------- listening status ---------- */
const prog = id => data.progress[id];
const isDone = (p, dur) => !!p && (p.dur || dur) > 0 && p.pos >= (p.dur || dur) - 20;
function trackStatus(id, dur) { const p = prog(id); if (isDone(p, dur)) return 'done'; if (p && p.pos > 5) return 'prog'; return 'new'; }
function seriesStatus(id) {
  const kids = memKids.get(id) || (cfg.demo ? null : LS.get('c:' + id, null));
  if (kids) {
    const a = kids.filter(k => k.audio);
    if (a.length) { const st = a.map(t => trackStatus(t.id, t.dur)); if (st.every(s => s === 'done')) return 'done'; if (st.some(s => s !== 'new')) return 'prog'; return 'new'; }
  }
  return Object.values(data.progress).some(p => p.par === id && p.pos > 5) || Object.values(data.recents).some(r => r.parent === id) ? 'prog' : 'new';
}
const statusOf = it => it.folder ? seriesStatus(it.id) : trackStatus(it.id, it.dur);
const ST = { all: 'الكل', new: 'لم أبدأ', prog: 'قيد الاستماع', done: 'مكتمل' };
const fold = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const matchQ = (it, q) => !q || fold(it.name).includes(fold(q));
function folderCover(f) { return f.thumb || covers[f.id] || ''; }

/* ---------- tags ---------- */
const TAG_COLORS = ['#7CC4FF', '#FFB86B', '#7CF5C9', '#F9A8D4', '#C9B8FF', '#FFD27A', '#FF8A8A', '#9BE15D'];
const tagList = () => Object.values(data.tags).filter(t => !t.del).sort((a, b) => (a.c || 0) - (b.c || 0));
const tagsOf = id => { const x = data.tagged[id]; return x && !x.del ? (x.tags || []).filter(t => data.tags[t] && !data.tags[t].del) : []; };
const tagItems = tid => Object.values(data.tagged).filter(x => !x.del && (x.tags || []).includes(tid)).sort(nat);
const tagDots = id => { const t = tagsOf(id); return t.length ? `<span class="tdots">${t.map(k => `<i style="background:${data.tags[k].color}" title="${esc(data.tags[k].name)}"></i>`).join('')}</span>` : ''; };

/* ---------- filter bar (search + status chips) ---------- */
function fbar(ph, counts) {
  return `<div class="fbar"><label class="search g">${I.search}<span class="sr">بحث</span><input id="q" type="search" placeholder="${ph}" autocomplete="off" value="${esc(qv)}"><button class="qx" data-a="q-clear" aria-label="مسح البحث" ${qv ? '' : 'hidden'}>${I.x}</button></label>
    <div class="chipsrow" role="group" aria-label="تصفية حسب حالة الاستماع">${Object.keys(ST).map(k => `<button class="fchip ${flt === k ? 'on' : ''}" data-a="flt" data-v="${k}" aria-pressed="${flt === k}">${ST[k]}<span>${counts[k] || 0}</span></button>`).join('')}</div></div>`;
}
function countBy(items) { const c = { all: items.length, new: 0, prog: 0, done: 0 }; items.forEach(i => c[statusOf(i)]++); return c; }
const passes = it => (flt === 'all' || statusOf(it) === flt) && matchQ(it, qv);
let rerender = null;
function bindFbar() {
  const q = $('#q'); if (!q) return;
  const x = main.querySelector('.qx');
  q.addEventListener('input', debounce(() => { qv = q.value.trim(); x.hidden = !qv; ANIM = false; rerender && rerender(); }, 120));
}

/* ---------- views ---------- */
const framed = (() => { try { return window.top !== window; } catch { return true; } })();
function viewSetup() {
  const hard = !!CLIENT_ID;
  main.innerHTML = `<div class="wrap view" style="max-width:560px;padding-top:4vh">
    <div class="hero">${bookWave(40)}<h1 class="t">مكتبتي</h1><div class="sub">مكتبتك الصوتية من ون درايف، بواجهة واحدة أنيقة.</div></div>
    <div class="card g">
      <h2>ربط ون درايف</h2>
      <p>تسجّل الدخول مرة وحدة، وبعدها يفتح التطبيق على مكتبتك مباشرة.</p>
      ${hard ? '' : `<label class="field">معرّف التطبيق (Client ID)<input class="in mono" id="fClient" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${esc(cfg.clientId)}" autocomplete="off" spellcheck="false"></label>`}
      <label class="field">مجلد الكتب الصوتية في ون درايف<input class="in" id="fRoot" placeholder="مثال: الكتب الصوتية" value="${esc(cfg.rootPath)}"></label>
      ${framed ? '<p style="font-size:13px;color:#FFD27A">هذي معاينة داخل Claude: تسجيل الدخول يشتغل بعد ما ترفع التطبيق على موقعك. جرّب الوضع التجريبي تحت.</p>' : ''}
      <button class="btn w" data-a="login">تسجيل الدخول بحساب مايكروسوفت</button>
      ${hard ? '' : `<p style="font-size:13px">عنوان إعادة التوجيه اللي تسجّله في Azure (نوع Single-page application):</p><div class="code">${esc(redirectUri())}</div>`}
    </div>
    <div class="card g"><h2>تبغى تجرّب أول؟</h2><p>الوضع التجريبي يعرض مكتبة نموذجية بأصوات قصيرة، وتقدر تجرب فيه كل المزايا.</p><button class="btn g" data-a="demo">جرّب الوضع التجريبي</button></div>
  </div>`;
}

/* المكتبة */
function viewHome() {
  const my = seq;
  main.innerHTML = `<div class="wrap view">
    <div class="hdr"><div><h1 class="t">مكتبتي</h1><div class="sub">${cfg.demo ? 'الوضع التجريبي' : 'مرتبطة بـ OneDrive'}</div></div></div>
    <div id="fb"></div>
    <div id="homeBody" class="wrap"><div class="sk" style="height:116px"></div><div class="sk" style="height:150px"></div><div class="sk" style="height:220px"></div></div>
  </div>`;
  let items = null, deep = null, deepQ = '';
  const runDeep = debounce(async v => {
    try { const res = (await src().search(v)).sort(nat); res.forEach(remember); if (my === seq && qv === v) { deep = res; deepQ = v; draw(); } }
    catch (e) { console.warn(e); }
  }, 450);
  const draw = () => {
    if (my !== seq || !items) return;
    if (!$('#q')) { $('#fb').innerHTML = fbar('ابحث عن كتاب أو سلسلة', countBy(items)); bindFbar(); }
    else main.querySelectorAll('.fchip').forEach(b => { const k = b.dataset.v; b.querySelector('span').textContent = countBy(items)[k] || 0; });
    if (qv.length >= 2 && deepQ !== qv) runDeep(qv);
    paint($('#homeBody'), homeBody(items, qv.length >= 2 && deepQ === qv ? deep : null));
  };
  rerender = draw;
  src().rootId().then(id => listChildren(id, list => { items = list; draw(); })).catch(e => { if (my === seq) $('#homeBody').innerHTML = viewError(e); });
}
function homeBody(items, deep) {
  const folders = items.filter(i => i.folder && passes(i)), books = items.filter(i => i.audio && passes(i));
  const plain = flt === 'all' && !qv;
  let h = '', n = 0;
  if (plain) {
    const rec = Object.values(data.recents).filter(r => !r.del).sort((a, b) => b.u - a.u);
    const c = rec[0];
    if (c) {
      const p = prog(c.id), dur = (p && p.dur) || c.dur || 0, pct = dur ? Math.min(100, (p ? p.pos : 0) / dur * 100) : 0;
      const playing = cur && cur.id === c.id && !audio.paused;
      h += `<button class="cont g${rise(n++)}" data-a="resume" data-id="${esc(c.id)}" data-parent="${esc(c.parent)}">
        ${cover(c.parentName || c.name, c.thumb, '', true, { id: c.id, name: c.name })}
        <div class="tx"><span>${playing ? `<span class="live">${bookWave(14)}</span> يُشغَّل الآن` : 'أكمل الاستماع'}</span><b>${esc(base(c.name))}</b><span>${esc(c.parentName || 'كتاب')}${dur && p ? ' · بقي <span class="mono">' + fmt(dur - p.pos) + '</span>' : ''}</span><div class="bar"><i style="width:${pct}%"></i></div></div>
        <span class="pbtn" aria-hidden="true">${playing ? I.pause(18) : I.play(18)}</span></button>`;
    }
    const more = rec.slice(1, 8);
    if (more.length) h += `<section class="sec"><h2>استمعت مؤخراً</h2><div class="tiles">${more.map((r, i) => `<button class="tile sm${rise(i + 1)}" data-a="book" data-id="${esc(r.id)}" data-parent="${esc(r.parent)}"><div class="stack single">${cover(r.parentName || r.name, r.thumb, '', true, { id: r.id, name: r.name })}</div><b>${esc(base(r.name))}</b><small>${esc(r.parentName || 'كتاب')}</small></button>`).join('')}</div></section>`;
  }
  if (folders.length) h += `<section class="sec"><h2>السلاسل <small>${folders.length}</small></h2><div class="tiles">${folders.map((f, i) => tile(f, i)).join('')}</div></section>`;
  if (books.length) h += `<section class="sec"><h2>كتب فردية <small>${books.length}</small></h2><div class="list g">${books.map((b, i) => bookRow(b, i)).join('')}</div></section>`;
  if (deep) {
    const ids = new Set(items.map(i => i.id));
    const extra = deep.filter(d => !ids.has(d.id) && (flt === 'all' || statusOf(d) === flt));
    if (extra.length) h += `<section class="sec"><h2>من داخل السلاسل</h2><div class="list g">${extra.map((r, i) => r.folder ? seriesRow(r, i) : bookRow(r, i)).join('')}</div></section>`;
  }
  if (!folders.length && !books.length && !(deep && deep.length)) {
    h += plain ? `<div class="card g"><p>المجلد فارغ أو ما فيه ملفات صوتية.</p><a class="btn sm g" href="#/settings">تغيير المجلد</a></div>`
      : `<div class="empty">${qv ? `ما فيه نتائج لـ «${esc(qv)}»` : 'ما فيه كتب بهذي الحالة.'}</div>`;
  }
  return h;
}
function tile(f, i) {
  const st = seriesStatus(f.id);
  return `<a class="tile${rise(i)}" href="#/f/${encodeURIComponent(f.id)}"><div class="stack">${cover(f.name, folderCover(f), '', true, Object.assign({}, f, { folder: true }))}${st !== 'new' ? `<span class="stb ${st}">${st === 'done' ? I.check : ''}</span>` : ''}</div><b>${esc(f.name)}${tagDots(f.id)}</b><small>${f.count ? arNum(f.count) + ' عناصر' : 'مجلد'}</small></a>`;
}
function bookRow(b, i = 0) {
  const p = prog(b.id), dur = (p && p.dur) || b.dur, st = trackStatus(b.id, dur), isCur = cur && cur.id === b.id;
  const end = isCur ? `<span class="live">${bookWave(14)}</span>` : st === 'done' ? `<span class="pill done">مكتمل</span>` : st === 'prog' && dur ? `<span class="pill">${Math.round(p.pos / dur * 100)}٪</span>` : `<span class="pill new">جديد</span>`;
  return `<button class="row ${isCur ? 'cur' : ''}${rise(i)}" data-a="book" data-id="${esc(b.id)}" data-parent="${esc(b.parent)}">${cover(b.name, b.thumb, '', false, b)}<div class="tx"><b>${esc(base(b.name))}${tagDots(b.id)}</b><span>${dur ? fmtLong(dur) : 'ملف صوتي'}</span>${st === 'prog' && dur ? `<div class="bar thin"><i style="width:${p.pos / dur * 100}%"></i></div>` : ''}</div><span class="end">${end}</span></button>`;
}
function seriesRow(f, i = 0) {
  const st = seriesStatus(f.id);
  return `<button class="row${rise(i)}" data-a="book" data-id="${esc(f.id)}" data-folder="1">${cover(f.name, folderCover(f), '', false, Object.assign({}, f, { folder: true }))}<div class="tx"><b>${esc(f.name)}${tagDots(f.id)}</b><span>سلسلة${f.count ? ' · ' + f.count + ' عناصر' : ''}</span></div><span class="end"><span class="pill ${st === 'done' ? 'done' : st === 'new' ? 'new' : ''}">${ST[st]}</span></span></button>`;
}

/* داخل سلسلة */
async function viewFolder(id) {
  const my = seq;
  main.innerHTML = `<div class="wrap view"><div class="hdr"><button class="ib g" data-a="up" data-id="${esc(id)}" aria-label="رجوع">${I.back}</button></div><div id="fBody" class="wrap"><div class="sk" style="height:150px"></div><div class="sk" style="height:320px"></div></div></div>`;
  try {
    let f = known.get(id);
    if (!f || !f.name) { f = await src().item(id); remember(f); }
    let kids = null;
    rerender = () => { if (my === seq && kids) drawFolder(known.get(id) || f, kids); };
    await listChildren(id, k => { kids = k; rerender(); });
  } catch (e) { if (my === seq) $('#fBody').innerHTML = viewError(e); }
}
function drawFolder(f, kids) {
  const body = $('#fBody'); if (!body) return;
  if (!body.querySelector('.fhead')) { paint(body, folderHead(f, kids) + `<div id="fb"></div><div id="fList" class="wrap"></div>`); }
  else { const h = body.querySelector('#fHeadBox'); if (h) { h.outerHTML = folderHead(f, kids); ART.scan(body); } }
  const tracks = kids.filter(k => k.audio);
  if (tracks.length > 1 && !$('#q')) { $('#fb').innerHTML = fbar('ابحث داخل السلسلة', countBy(tracks)); bindFbar(); }
  else if ($('#q')) { const c = countBy(tracks); main.querySelectorAll('.fchip').forEach(b => { b.querySelector('span').textContent = c[b.dataset.v] || 0; }); }
  paint($('#fList'), folderList(f, kids));
}
function folderHead(f, kids) {
  const subs = kids.filter(k => k.folder), tracks = kids.filter(k => k.audio);
  const img = kids.find(k => k.img && /^(cover|folder|front)/i.test(k.name)) || kids.find(k => k.img) || tracks.find(t => t.thumb);
  if (img && (img.thumbL || img.thumb) && covers[f.id] !== (img.thumbL || img.thumb)) { covers[f.id] = img.thumbL || img.thumb; LS.set('covers', covers); }
  const total = tracks.reduce((s, t) => s + ((prog(t.id) || {}).dur || t.dur || 0), 0);
  const { target, label } = seriesTarget(tracks);
  const nNotes = entriesFor(f.id, true).length;
  return `<div id="fHeadBox" class="wrap"><div class="fhead"><div class="stack">${cover(f.name, folderCover(f), '', true, Object.assign({}, f, { folder: true }))}</div><div style="display:flex;flex-direction:column;gap:4px;min-width:0;padding-bottom:4px">
      <span class="sub">${subs.length && !tracks.length ? 'مجلد' : 'سلسلة'}</span><h1>${esc(f.name)}</h1>
      <span class="sub">${[tracks.length ? arNum(tracks.length) + ' ملفات' : '', subs.length ? arNum(subs.length) + ' مجلدات' : '', total ? fmtLong(total) : ''].filter(Boolean).join(' · ')}</span>
      ${tagsOf(f.id).length ? `<span class="tagline">${tagsOf(f.id).map(t => `<a class="tchipS" href="#/t/${encodeURIComponent(t)}" style="--c:${data.tags[t].color}">${esc(data.tags[t].name)}</a>`).join('')}</span>` : ''}</div></div>
    ${tracks.length ? `<div class="acts">${target ? `<button class="btn w" data-a="play-at" data-id="${esc(target.id)}" data-parent="${esc(f.id)}">${I.play(16)}<span class="ell">${esc(label)}</span></button>` : ''}
      <button class="btn g" data-a="tag-sheet" data-id="${esc(f.id)}" data-folder="1">${I.tagS} تصنيف</button>
      ${nNotes ? `<button class="btn g" data-a="export-book" data-id="${esc(f.id)}" data-folder="1">${I.doc} تصدير الملاحظات</button>` : ''}</div>` : ''}</div>`;
}
function seriesTarget(tracks) {
  const started = tracks.filter(t => trackStatus(t.id, t.dur) === 'prog').sort((a, b) => prog(b.id).u - prog(a.id).u)[0];
  if (started) return { target: started, label: 'أكمل: ' + base(started.name) };
  const t = tracks.find(t => trackStatus(t.id, t.dur) !== 'done') || tracks[0];
  return { target: t, label: t && tracks.indexOf(t) > 0 ? 'التالي: ' + base(t.name) : 'ابدأ الاستماع' };
}
function folderList(f, kids) {
  const subs = kids.filter(k => k.folder && passes(k)), all = kids.filter(k => k.audio), tracks = all.filter(passes);
  let h = '';
  if (subs.length) h += `<section class="sec"><h2>${all.length ? 'مجلدات' : 'الأجزاء'}</h2><div class="tiles">${subs.map((s, i) => tile(s, i)).join('')}</div></section>`;
  if (tracks.length) h += `<div class="list g">${tracks.map((t, i) => trackRow(t, all.indexOf(t), f.id, i)).join('')}</div>`;
  if (!subs.length && !tracks.length) h += `<div class="empty">${all.length || kids.some(k => k.folder) ? (qv ? `ما فيه نتائج لـ «${esc(qv)}»` : 'ما فيه أجزاء بهذي الحالة.') : 'ما فيه ملفات صوتية في هذا المجلد.'}</div>`;
  return h;
}
function trackRow(t, idx, parent, i = 0) {
  const p = prog(t.id), dur = (p && p.dur) || t.dur, st = trackStatus(t.id, dur), isCur = cur && cur.id === t.id;
  const badge = isCur ? `<span class="badge go ${audio.paused ? 'paused' : ''}">${eq}</span>` : st === 'done' ? `<span class="badge done">${I.check}</span>` : st === 'prog' ? `<span class="badge go">${I.play(13)}</span>` : `<span class="badge">${arNum(idx + 1)}</span>`;
  const sub = [dur ? fmtLong(dur) : '', st === 'prog' && dur ? 'بقي <span class="mono">' + fmt(dur - p.pos) + '</span>' : '', st === 'done' ? 'مكتمل' : ''].filter(Boolean).join(' · ');
  return `<button class="row ${isCur ? 'cur' : ''}${rise(i)}" data-a="book" data-id="${esc(t.id)}" data-parent="${esc(parent)}">${badge}${cover(t.name, '', 'sm', false, t)}<div class="tx"><b>${esc(base(t.name))}</b><span>${sub || 'ملف صوتي'}</span>${st === 'prog' && dur ? `<div class="bar thin"><i style="width:${p.pos / dur * 100}%"></i></div>` : ''}</div></button>`;
}

/* التصنيفات */
function viewTags() {
  const tags = tagList();
  rerender = null;
  main.innerHTML = `<div class="wrap view">
    <div class="hdr"><div><h1 class="t">التصنيفات</h1><div class="sub">${tags.length ? tags.length + ' تصنيف' : ''}</div></div><button class="btn sm g" data-a="tag-new">${I.plus} تصنيف جديد</button></div>
    ${tags.length ? `<div class="tgrid">${tags.map((t, i) => {
      const its = tagItems(t.id);
      return `<a class="tcard g${rise(i)}" href="#/t/${encodeURIComponent(t.id)}" style="--c:${t.color}">
        <div class="tcovers">${its.slice(0, 3).map(x => cover(x.name, x.thumb, '', false, { id: x.id, name: x.name, folder: x.kind === 'series' })).join('') || `<div class="cover tempty">${I.tag}</div>`}</div>
        <div class="tmeta"><b><i class="dot"></i>${esc(t.name)}</b><span>${its.length ? its.length + ' كتاب' : 'فاضي'}</span></div></a>`;
    }).join('')}</div>`
      : `<div class="card g emptycard"><div class="float">${bookWave(44)}</div><p>أنشئ تصنيفات مثل «روايات» أو «تاريخ» أو «أسمعها بالسيارة»، وبعدها صنّف كتبك من المكتبة بالضغط على أي كتاب.</p><button class="btn w" data-a="tag-new">${I.plus} أول تصنيف</button></div>`}
  </div>`;
  ART.scan(main);
}
function viewTag(id) {
  const my = seq, t = data.tags[id];
  if (!t || t.del) { main.innerHTML = `<div class="wrap view"><div class="empty">التصنيف غير موجود.</div><a class="btn g" href="#/tags">التصنيفات</a></div>`; return; }
  main.innerHTML = `<div class="wrap view" style="--c:${t.color}">
    <div class="hdr"><a class="ib g" href="#/tags" aria-label="رجوع">${I.back}</a></div>
    <div class="thead"><span class="tbadge">${I.tag}</span><div><h1 class="t">${esc(t.name)}</h1><div class="sub" id="tCount"></div></div></div>
    <div class="acts" id="tActs"></div>
    <div id="fb"></div><div id="tList" class="wrap"></div></div>`;
  const draw = () => {
    if (my !== seq) return;
    const all = tagItems(id).map(x => Object.assign({ folder: x.kind === 'series', audio: x.kind !== 'series' }, known.get(x.id) || {}, { id: x.id, name: x.name, parent: x.parent, thumb: x.thumb || '' , dur: x.dur || 0 }));
    $('#tCount').textContent = all.length ? all.length + ' كتاب' : 'ما فيه كتب بعد';
    $('#tActs').innerHTML = all.length ? `<button class="btn w" data-a="tag-play" data-id="${esc(id)}">${I.play(16)} تشغيل الكل</button><button class="btn g" data-a="tag-edit" data-id="${esc(id)}">${I.edit} تعديل</button>` : `<button class="btn g" data-a="tag-edit" data-id="${esc(id)}">${I.edit} تعديل</button>`;
    if (all.length > 1 && !$('#q')) { $('#fb').innerHTML = fbar('ابحث في التصنيف', countBy(all)); bindFbar(); }
    const list = all.filter(passes);
    paint($('#tList'), list.length ? `<div class="list g">${list.map((x, i) => (x.folder ? seriesRow(x, i) : bookRow(x, i)).replace('data-a="book"', `data-a="book" data-ctx="${esc(id)}"`)).join('')}</div>`
      : all.length ? `<div class="empty">ما فيه نتائج.</div>` : `<div class="card g"><p>افتح المكتبة واضغط على أي كتاب، ثم اختر «تصنيف» وحدد «${esc(t.name)}».</p><a class="btn sm g" href="#/">المكتبة</a></div>`);
  };
  rerender = draw; draw();
}

/* العلامات والملاحظات */
function viewList(kind) {
  const isN = kind === 'notes';
  rerender = null;
  const all = Object.values(data[kind]).filter(x => !x.del).sort((a, b) => (b.c || b.u) - (a.c || a.u));
  main.innerHTML = `<div class="wrap view">
    <div class="hdr"><div><h1 class="t">${isN ? 'الملاحظات' : 'العلامات'}</h1><div class="sub">${all.length ? arNum(all.length) + (isN ? ' ملاحظة' : ' علامة') : ''}</div></div>
    ${all.length ? `<button class="btn sm g" data-a="export">${I.dl} تصدير الكل</button>` : ''}</div>
    ${all.length ? `<div class="list g">${all.map((x, i) => itemHTML(kind, x, true, i)).join('')}</div>`
      : `<div class="card g emptycard"><div class="float">${bookWave(44)}</div><p>${isN ? 'أثناء الاستماع اضغط «ملاحظة» أو حرف N في الكيبورد، وتنحفظ الملاحظة على التوقيت نفسه.' : 'أثناء الاستماع اضغط زر العلامة أو حرف B في الكيبورد، وتقدر ترجع لنفس اللحظة بضغطة.'}</p></div>`}
  </div>`;
}
function itemHTML(kind, x, ctx, i = 0) {
  const isN = kind === 'notes';
  const txt = isN ? x.text : (x.text || 'علامة بدون عنوان');
  return `<div class="item${ctx ? rise(i) : ''}"><button class="go" data-a="open-at" data-id="${esc(x.item)}" data-parent="${esc(x.parent)}" data-t="${x.t}">
    <span class="tm mono ${isN ? 'n' : ''}">${fmt(x.t)}</span><span class="txt"><b>${esc(txt)}</b>${ctx ? `<span>${esc(base(x.itemName))}${x.parentName ? ' · ' + esc(x.parentName) : ''}</span>` : ''}</span></button>
    <button class="x" data-a="edit" data-k="${kind}" data-id="${esc(x.id)}" aria-label="تعديل">${I.edit}</button>
    <button class="x" data-a="del" data-k="${kind}" data-id="${esc(x.id)}" aria-label="حذف">${I.trash}</button></div>`;
}

/* الإعدادات */
function viewSettings() {
  const my = seq;
  rerender = null;
  const sw = (a, on, label) => `<div class="srow"><span>${label}</span><button class="sw" role="switch" aria-checked="${on}" aria-label="${label}" data-a="${a}"></button></div>`;
  const tags = tagList();
  main.innerHTML = `<div class="wrap view" style="max-width:640px">
    <h1 class="t">الإعدادات</h1>
    <div class="card g"><h2>التصنيفات</h2>
      <div class="tedit">${tags.map(t => `<div class="trow" data-id="${esc(t.id)}">
        <button class="swatch" data-a="tag-color" data-id="${esc(t.id)}" style="background:${t.color}" aria-label="تغيير اللون"></button>
        <input class="in tname" data-id="${esc(t.id)}" value="${esc(t.name)}" aria-label="اسم التصنيف">
        <span class="sub">${tagItems(t.id).length}</span>
        <button class="x" data-a="tag-del" data-id="${esc(t.id)}" aria-label="حذف التصنيف">${I.trash}</button></div>`).join('') || '<p>ما فيه تصنيفات بعد.</p>'}</div>
      <div class="addrow"><input class="in" id="newTag" placeholder="اسم تصنيف جديد" maxlength="40"><button class="btn sm w" data-a="tag-add">إضافة</button></div></div>
    <div class="card g"><h2>الحساب</h2><p id="acct">${cfg.demo ? 'الوضع التجريبي، بدون ون درايف' : '…'}</p>
      <div class="acts">${cfg.demo ? '<button class="btn sm w" data-a="exit-demo">ربط ون درايف</button>' : '<button class="btn sm g" data-a="sync">مزامنة الآن</button><button class="btn sm g" data-a="signout">تسجيل الخروج</button>'}</div></div>
    ${cfg.demo ? '' : `<div class="card g"><h2>مجلد المكتبة</h2><label class="field">المسار داخل ون درايف (فاضي = كل ون درايف)<input class="in" id="sRoot" value="${esc(cfg.rootPath)}" placeholder="مثال: الكتب الصوتية"></label><button class="btn sm g" data-a="save-root" style="align-self:flex-start">حفظ</button></div>`}
    <div class="card g"><h2>الاستماع</h2>
      <div class="srow"><span>مدة التقديم والرجوع</span></div>
      <div class="seg">${[10, 15, 30, 60].map(s => `<button class="${cfg.skip === s ? 'on' : ''}" data-a="skip-opt" data-v="${s}">${arNum(s)} ث</button>`).join('')}</div>
      ${sw('t-pause', cfg.pauseOnNote, 'إيقاف الصوت أثناء كتابة الملاحظة')}
      ${sw('t-lite', cfg.lite, 'تقليل الشفافية والحركة (أخف على الأجهزة القديمة)')}</div>
    <div class="card g"><h2>اختصارات الكيبورد</h2><p>المسافة: تشغيل/إيقاف · الأسهم: تقديم ورجوع · B: علامة · N: ملاحظة · /: بحث</p></div>
  </div>`;
  main.querySelectorAll('.tname').forEach(inp => {
    const save = () => { const t = data.tags[inp.dataset.id], v = inp.value.trim(); if (t && v && v !== t.name) { t.name = v; t.u = Date.now(); scheduleSync(3000); toast('تم تغيير الاسم'); } else if (t) inp.value = t.name; };
    inp.addEventListener('change', save); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
  const nt = $('#newTag'); if (nt) nt.addEventListener('keydown', e => { if (e.key === 'Enter') A['tag-add'](); });
  if (!cfg.demo) live.me().then(m => { if (my === seq && $('#acct')) $('#acct').textContent = `${m.displayName || ''} ${m.userPrincipalName ? '· ' + m.userPrincipalName : ''}`; }).catch(() => {});
}
