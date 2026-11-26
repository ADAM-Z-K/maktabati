'use strict';
/* ---------- صور الأغلفة: صورة ون درايف المصغّرة، وإلا الصورة المضمّنة داخل الملف الصوتي نفسه ---------- */
const ART = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise(res => {
    try { const r = indexedDB.open('maktabati-art', 1); r.onupgradeneeded = () => r.result.createObjectStore('a'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
    catch { res(null); }
  }));
  async function idb(mode, fn) {
    const d = await db(); if (!d) return null;
    return new Promise(res => { try { const tx = d.transaction('a', mode); const rq = fn(tx.objectStore('a')); tx.oncomplete = () => res(rq ? rq.result : null); tx.onerror = () => res(null); } catch { res(null); } });
  }
  const get = k => idb('readonly', s => s.get(k));
  const put = (k, v) => idb('readwrite', s => s.put(v, k));

  const urls = new Map(), pending = new Map();
  let active = 0; const waiters = [];
  const slot = () => active < 3 ? (active++, Promise.resolve()) : new Promise(r => waiters.push(r));
  const free = () => { const w = waiters.shift(); if (w) w(); else active--; };

  /* يقرأ جزءاً صغيراً من الملف فقط، ولا يحمّل الملف كاملاً أبداً */
  async function range(url, a, b) {
    const ctl = new AbortController();
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal: ctl.signal });
    if (r.status !== 206) { ctl.abort(); throw new Error('no-range'); }
    return new Uint8Array(await r.arrayBuffer());
  }
  const ss = (b, o) => (b[o] & 127) << 21 | (b[o + 1] & 127) << 14 | (b[o + 2] & 127) << 7 | (b[o + 3] & 127);
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  async function id3Art(url) {
    let buf = await range(url, 0, 262143);
    if (!(buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)) return null;
    const ver = buf[3], flags = buf[5], size = ss(buf, 6) + 10;
    if (size > buf.length) { if (size > 6e6) return null; buf = await range(url, 0, size - 1); }
    let o = 10;
    if (flags & 0x40) o += ver === 4 ? ss(buf, 10) : u32(buf, 10) + 4;
    const end = Math.min(size, buf.length), hl = ver === 2 ? 6 : 10;
    while (o + hl < end) {
      const id = ver === 2 ? String.fromCharCode(buf[o], buf[o + 1], buf[o + 2]) : String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
      const fs = ver === 2 ? (buf[o + 3] << 16 | buf[o + 4] << 8 | buf[o + 5]) : ver === 4 ? ss(buf, o + 4) : u32(buf, o + 4);
      if (!/^[A-Z0-9]{3,4}$/.test(id) || fs <= 0 || o + hl + fs > end) break;
      if (id === 'APIC' || id === 'PIC') {
        const d = buf.subarray(o + hl, o + hl + fs), enc = d[0];
        let p = 1, mime;
        if (id === 'PIC') { mime = 'image/' + String.fromCharCode(d[1], d[2], d[3]).toLowerCase().replace('jpg', 'jpeg'); p = 4; }
        else { let q = p; while (q < d.length && d[q] !== 0) q++; mime = String.fromCharCode(...d.subarray(p, q)) || 'image/jpeg'; p = q + 1; }
        p++;
        if (enc === 1 || enc === 2) { while (p + 1 < d.length && !(d[p] === 0 && d[p + 1] === 0)) p += 2; p += 2; }
        else { while (p < d.length && d[p] !== 0) p++; p++; }
        if (!mime.includes('/')) mime = 'image/' + mime.toLowerCase();
        return new Blob([d.subarray(p)], { type: mime });
      }
      o += hl + fs;
    }
    return null;
  }

  async function mp4Art(url) {
    const head = await range(url, 0, 65535);
    const typ = (b, o) => String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    if (typ(head, 0) !== 'ftyp') return null;
    let o = 0, moov = null;
    for (let i = 0; i < 24; i++) {
      const hb = o + 16 <= head.length ? head.subarray(o, o + 16) : await range(url, o, o + 15);
      if (hb.length < 8) break;
      let sz = u32(hb, 0); const t = typ(hb, 0);
      if (sz === 1) sz = u32(hb, 8) * 4294967296 + u32(hb, 12);
      if (sz < 8) break;
      if (t === 'moov') { moov = [o, sz]; break; }
      o += sz;
    }
    if (!moov || moov[1] > 12e6) return null;
    const m = moov[0] + moov[1] <= head.length ? head.subarray(moov[0], moov[0] + moov[1]) : await range(url, moov[0], moov[0] + moov[1] - 1);
    const find = (s, e, path) => {
      let p = s;
      while (p + 8 <= e) {
        let sz = u32(m, p), hs = 8; const t = typ(m, p);
        if (sz === 1) { sz = u32(m, p + 8) * 4294967296 + u32(m, p + 12); hs = 16; }
        if (sz === 0) sz = e - p;
        if (sz < 8 || p + sz > e) return null;
        if (t === path[0]) {
          const cs = p + hs + (t === 'meta' ? 4 : 0);
          if (path.length === 1) return [cs, p + sz];
          const r = find(cs, p + sz, path.slice(1)); if (r) return r;
        }
        p += sz;
      }
      return null;
    };
    const hit = find(0, m.length, ['moov', 'udta', 'meta', 'ilst', 'covr', 'data']) || find(0, m.length, ['moov', 'meta', 'ilst', 'covr', 'data']);
    if (!hit) return null;
    const kind = u32(m, hit[0]);
    return new Blob([m.subarray(hit[0] + 8, hit[1])], { type: kind === 14 ? 'image/png' : 'image/jpeg' });
  }

  async function shrink(blob) {
    try {
      const bm = await createImageBitmap(blob);
      const s = Math.min(1, 420 / Math.max(bm.width, bm.height));
      const c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      return await new Promise(r => c.toBlob(b => r(b || blob), 'image/jpeg', .86));
    } catch { return blob; }
  }

  async function fromFile(it) {
    if (cfg.demo) return demoArt(it);
    const url = await src().stream(it.id);
    if (/\.(m4a|m4b|mp4|m4p)$/i.test(it.name)) return mp4Art(url);
    if (/\.mp3$/i.test(it.name)) return id3Art(url);
    return (await id3Art(url).catch(() => null)) || null;
  }

  function demoArt(it) {
    if (hash(it.name) % 5 === 0) return Promise.resolve(null);
    const c = document.createElement('canvas'); c.width = c.height = 360;
    const x = c.getContext('2d'), h = hash(it.name) % 360;
    const g = x.createLinearGradient(0, 0, 360, 360);
    g.addColorStop(0, `hsl(${h} 70% 62%)`); g.addColorStop(1, `hsl(${(h + 40) % 360} 65% 26%)`);
    x.fillStyle = g; x.fillRect(0, 0, 360, 360);
    x.fillStyle = 'rgba(255,255,255,.14)'; x.beginPath(); x.arc(280, 90, 120, 0, 7); x.fill();
    x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 250, 360, 110);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.direction = 'rtl'; x.font = 'bold 34px "IBM Plex Sans Arabic", sans-serif';
    x.fillText(base(it.name).replace(/^\d+\s*-\s*/, ''), 180, 318);
    return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', .85));
  }

  async function load(it) {
    const key = (it.folder ? 'f:' : '') + it.id;
    if (it.thumbL || it.thumb) return it.thumbL || it.thumb;
    if (it.folder) {
      const kids = await childrenQuick(it.id);
      const img = kids.find(k => k.img && /^(cover|folder|front)/i.test(k.name)) || kids.find(k => k.img);
      if (img && (img.thumbL || img.thumb)) return img.thumbL || img.thumb;
      const first = kids.filter(k => k.audio).sort(nat)[0];
      return first ? forItem(first) : '';
    }
    const c = await get(key);
    if (c instanceof Blob) return URL.createObjectURL(c);
    if (c && c.none && Date.now() - c.t < 7 * 864e5) return '';
    await slot();
    let blob = null;
    try { blob = await fromFile(it); if (blob) blob = await shrink(blob); }
    catch (e) { if (e && e.name === 'AuthError') throw e; console.warn('art', it.name, e && e.message); }
    finally { free(); }
    if (blob) { put(key, blob); return URL.createObjectURL(blob); }
    if (!cfg.demo) put(key, { none: 1, t: Date.now() });
    return '';
  }
  function forItem(it) {
    if (!it || !it.id) return Promise.resolve('');
    const key = (it.folder ? 'f:' : '') + it.id;
    if (urls.has(key)) return Promise.resolve(urls.get(key));
    if (pending.has(key)) return pending.get(key);
    const p = load(it).then(u => { urls.set(key, u || ''); pending.delete(key); return u || ''; }).catch(() => { pending.delete(key); return ''; });
    pending.set(key, p);
    return p;
  }
  const peek = it => it ? (it.thumbL || it.thumb || urls.get((it.folder ? 'f:' : '') + it.id) || '') : '';

  /* تعبئة الأغلفة الظاهرة على الشاشة فقط */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(ents => {
    for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); fill(e.target._art || e.target); }
  }, { rootMargin: '200px' }) : null;
  function fill(el) {
    const id = el.dataset.art, folder = el.dataset.af === '1';
    const it = Object.assign({}, known.get(id) || { id, name: el.dataset.an || '' }, folder ? { folder: true } : {});
    forItem(it).then(u => apply(el, u));
  }
  function apply(el, u) {
    if (!u || !el.isConnected) return;
    const s = safeUrl(u); if (!s) return;
    el.style.backgroundImage = `url("${s}"), ${grad(el.dataset.an || '')}`;
    el.textContent = ''; el.classList.add('has-art');
  }
  function scan(root) {
    (root || document).querySelectorAll('[data-art]:not(.has-art):not([data-q])').forEach(el => {
      el.dataset.q = '1';
      const tgt = el.classList.contains('sm') ? (el.closest('.row') || el) : el; tgt._art = el;
      if (io) io.observe(tgt); else fill(el);
    });
  }
  return { forItem, peek, scan };
})();
