// UndoTable page: Record, Put it back, Parts, and the "Where does this go?" sheet.
import * as store from './store.js';
import * as engine from './engine.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view'), busy = $('#busy'), sheet = $('#sheet');
const shoot = $('#shoot'), seek = $('#seek');

let T = null;            // current teardown
const urls = {};         // photoId -> object URL
const ui = { view: 'home', sel: 0, backPos: 0, drawing: false };
let samples = null;      // sample loose-part photos when the sample is loaded

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

engine.onProgress((msg) => { busy.hidden = !msg; busy.textContent = msg; });

async function photoUrl(id) {
  if (!urls[id]) urls[id] = URL.createObjectURL(await store.getPhoto(id));
  return urls[id];
}
const save = () => store.saveTeardown(T);
const removalSteps = () => T ? T.steps.map((s, i) => i).filter((i) => T.steps[i].parts.length) : [];
const allParts = () => T ? T.steps.flatMap((s, i) => s.parts.map((p) => ({ ...p, step: i }))) : [];
const totals = () => {
  const ps = allParts();
  return { all: ps.reduce((a, p) => a + p.count, 0), back: ps.filter((p) => p.back).reduce((a, p) => a + p.count, 0) };
};

// ---------- actions ----------

async function startNew(name) {
  await store.clearAll();
  Object.keys(urls).forEach((k) => { URL.revokeObjectURL(urls[k]); delete urls[k]; });
  T = { name: name || 'My teardown', createdAt: Date.now(), steps: [], sample: false };
  samples = null;
  await save();
}

async function addPhoto(file) {
  const { blob, width, height } = await engine.prepare(file);
  const photoId = uid();
  await store.putPhoto(photoId, blob);
  T.steps.push({ photoId, width, height, parts: [], status: null });
  await save();
  const n = T.steps.length;
  if (n < 2) { ui.sel = 0; return render(); }
  const k = n - 2, prev = T.steps[k];
  ui.sel = k;
  render();
  try {
    const res = await engine.compare(await store.getPhoto(prev.photoId), blob);
    prev.status = res.status;
    for (const { mask, ...box } of res.boxes) await addPart(k, box, false, mask);
  } catch (e) {
    console.error(e);
    prev.status = 'error';
  }
  await save();
  render();
}

async function addPart(k, box, manual, mask = null) {
  const step = T.steps[k];
  const d = await engine.describe(await store.getPhoto(step.photoId), box, mask);
  step.parts.push({ id: uid(), box, name: d.names[0] || 'part', names: d.names, count: 1, thumb: d.thumb, vecs: d.vecs, color: d.color, back: false, manual, note: d.error });
  render();
}

async function loadSample() {
  const m = await (await fetch('samples/fan/manifest.json')).json();
  await startNew(m.name);
  T.sample = true;
  samples = m.parts;
  await save();
  go('record');
  for (const [i, f] of m.steps.entries()) {
    busy.hidden = false; busy.textContent = `Sample: adding photo ${i + 1} of ${m.steps.length}…`;
    await addPhoto(await (await fetch(`samples/fan/${f}`)).blob());
    // Sample names: the person who recorded it typed these after the suggestions.
    const k = T.steps.length - 2;
    if (k >= 0 && m.names?.[k]) T.steps[k].parts.forEach((p, j) => { if (m.names[k][j]) Object.assign(p, m.names[k][j]); });
  }
  busy.hidden = true;
  await save();
  render();
}

async function runLookup(file) {
  // A loose part can't be one that is already back in, unless everything is.
  const all = allParts(), left = all.filter((p) => !p.back);
  const parts = left.length ? left : all;
  if (!parts.length) return;
  openSheet(`<p class="muted">Looking for a match…</p>`);
  try {
    const r = await engine.lookup(file, parts);
    const q = URL.createObjectURL(file);
    showMatch(r, parts, q);
  } catch (e) {
    console.error(e);
    openSheet(`<h2>AI unavailable</h2><p>The matching model could not load. Check your connection and try again.</p><button class="btn" data-close>Close</button>`);
  }
}

// ---------- rendering ----------

function go(v) { ui.view = v; ui.drawing = false; render(); view.focus({ preventScroll: true }); }

async function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.go === ui.view ? 'page' : 'false'));
  if (!T && ui.view !== 'home') ui.view = 'home';
  const html = await ({ home: homeView, record: recordView, back: backView, parts: partsView }[ui.view])();
  view.innerHTML = html;
}

function homeView() {
  const resume = T && T.steps.length
    ? `<button class="btn ghost" data-go="${removalSteps().length ? 'back' : 'record'}">Continue “${esc(T.name)}” (${T.steps.length} photo${T.steps.length > 1 ? 's' : ''})</button>` : '';
  return `
  <section class="hero">
    <h1>Undo for the stuff<br>you take apart.</h1>
    <p class="lead">Snap a photo after each part you remove. When it's time to rebuild, UndoTable circles where every piece came from and walks you back in reverse.</p>
    <form class="start" data-act="start">
      <label for="tname">What are you taking apart?</label>
      <div class="row"><input id="tname" name="name" placeholder="Desk fan" autocomplete="off"><button class="btn primary">Start a teardown</button></div>
    </form>
    <div class="row"><button class="btn" data-act="sample">Try the sample (desk fan, 5 steps)</button>${resume}</div>
    <p class="fine">Photos stay on this device. The comparer and the AI models run inside this page; nothing is uploaded. The first comparison downloads about 110 MB of models once.</p>
  </section>
  <ol class="how">
    <li><b>Snap</b> the whole thing from above.</li>
    <li><b>Remove</b> a part, move it out of the frame, snap again. Repeat.</li>
    <li><b>Put it back</b>: steps in reverse, every part circled on your own photo.</li>
    <li><b>Mystery screw?</b> Photograph it. The app finds where it came from.</li>
  </ol>`;
}

async function stage(k, { focus = null, numbered = true, draw = false } = {}) {
  const s = T.steps[k];
  const boxes = s.parts.map((p, j) => {
    // Tiny parts (screws) get a marker at least 4% of the photo wide, centred on the part.
    const min = 0.04 * s.width, w = Math.max(p.box.w, min), h = Math.max(p.box.h, min);
    const x = p.box.x + (p.box.w - w) / 2, y = p.box.y + (p.box.h - h) / 2;
    const st = `left:${(100 * x) / s.width}%;top:${(100 * y) / s.height}%;width:${(100 * w) / s.width}%;height:${(100 * h) / s.height}%`;
    const cls = ['box', p.back ? 'done' : '', focus && focus !== p.id ? 'dim' : '', focus === p.id ? 'hot' : ''].join(' ');
    return `<div class="${cls}" style="${st}">${numbered ? `<span>${j + 1}</span>` : ''}</div>`;
  }).join('');
  return `<div class="stage ${draw ? 'drawing' : ''}" data-step="${k}" style="aspect-ratio:${s.width}/${s.height}">
    <img src="${await photoUrl(s.photoId)}" alt="Photo ${k + 1} of ${esc(T.name)}" draggable="false">${boxes}<div class="ghostbox" hidden></div></div>`;
}

async function recordView() {
  const n = T.steps.length;
  if (!n) return `<section class="empty"><h2>${esc(T.name)}</h2><p>Start with a photo of the whole thing, taken from above.</p>
    <button class="btn primary big" data-act="shoot">Take the first photo</button></section>`;
  const k = Math.min(ui.sel, n - 1), s = T.steps[k];
  const strip = (await Promise.all(T.steps.map(async (st, i) => `<button class="thumb ${i === k ? 'on' : ''}" data-sel="${i}" aria-label="Photo ${i + 1}">
      <img src="${await photoUrl(st.photoId)}" alt=""><b>${i + 1}</b>${st.parts.length ? `<i>${st.parts.reduce((a, p) => a + p.count, 0)}</i>` : ''}</button>`))).join('');
  const last = k === n - 1;
  const msg = {
    misaligned: `These two photos don't line up. Retake from about the same spot, or draw the box yourself.`,
    nochange: `No change found between photo ${k + 1} and ${k + 2}. Draw it, or retake.`,
    error: `Something went wrong comparing these photos. Draw the box yourself.`,
  }[s.status];
  const head = last
    ? `<h2>Photo ${k + 1}${n === 1 ? ': the whole thing' : ': latest'}</h2><p class="muted">Remove the next part, move it out of the frame, then add the next photo.</p>`
    : `<h2>Step ${k + 1}: what came off</h2><p class="muted">Boxes mark what changed between photo ${k + 1} and photo ${k + 2}. Keep, rename, or delete them.</p>`;
  const rows = s.parts.map((p, j) => `<li class="part" data-part="${p.id}">
      <span class="num">${j + 1}</span><img src="${p.thumb}" alt="">
      <div class="fields"><input aria-label="Part name" data-name value="${esc(p.name)}" list="names-${p.id}">
        <datalist id="names-${p.id}">${(p.names || []).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <label class="count">× <input type="number" min="1" max="99" data-count value="${p.count}" aria-label="How many"></label>
        ${p.note ? `<small class="warn">${esc(p.note)}</small>` : ''}</div>
      <button class="icon" data-del aria-label="Delete ${esc(p.name)}">✕</button></li>`).join('');
  return `
  <div class="record">
    <div class="filmstrip">${strip}</div>
    ${head}
    ${msg ? `<p class="alert">${msg}</p>` : ''}
    ${await stage(k, { draw: ui.drawing })}
    ${last ? '' : `<ul class="parts">${rows || '<li class="muted">No parts on this step yet.</li>'}</ul>
      <button class="btn ghost" data-act="draw" aria-pressed="${ui.drawing}">${ui.drawing ? 'Drag on the photo to draw a box…' : 'Draw a box by hand'}</button>`}
    <div class="dock">
      <button class="btn primary big" data-act="shoot">Add photo ${n + 1}</button>
      ${removalSteps().length ? `<button class="btn big" data-go="back">Put it back →</button>` : ''}
    </div>
  </div>`;
}

async function backView() {
  const rs = removalSteps();
  if (!rs.length) return `<section class="empty"><h2>Nothing to put back yet</h2><p>Record at least two photos so UndoTable can see what came off.</p><button class="btn" data-go="record">Go to Record</button></section>`;
  const t = totals();
  if (t.back === t.all) {
    return `<section class="done-all"><h2>All ${t.all} parts accounted for.</h2><p>${esc(T.name)} is back together.</p>
      ${await stage(0, { numbered: false })}<div class="row"><button class="btn" data-act="reset-ticks">Walk it again</button><button class="btn ghost" data-go="home">Home</button></div></section>`;
  }
  ui.backPos = Math.max(0, Math.min(ui.backPos, rs.length - 1));
  const k = rs[rs.length - 1 - ui.backPos];
  const s = T.steps[k];
  const rows = s.parts.map((p, j) => `<li class="part tick ${p.back ? 'is-back' : ''}" data-part="${p.id}">
      <span class="num">${j + 1}</span><img src="${p.thumb}" alt="">
      <span class="pname">${p.count > 1 ? `${p.count} × ` : ''}${esc(p.name)}</span>
      <button class="btn small ${p.back ? 'teal' : ''}" data-back aria-pressed="${p.back}">${p.back ? 'Back in ✓' : 'Mark back in'}</button></li>`).join('');
  const sampleRow = samples ? `<div class="samples"><p class="muted">Sample loose parts (AI-generated photos). Tap one to look it up:</p>
      <div class="row">${samples.map((f, i) => `<button class="sample" data-sample="${esc(f)}" aria-label="Sample loose part ${i + 1}"><img src="samples/fan/${esc(f)}" alt=""></button>`).join('')}</div></div>` : '';
  return `
  <div class="back">
    <div class="progress"><div style="width:${(100 * t.back) / t.all}%"></div></div>
    <p class="count-line"><b>${t.back} of ${t.all}</b> parts back · Step ${k + 1} of ${rs.length} (in reverse)</p>
    <h2>Put back: ${s.parts.map((p) => `${p.count > 1 ? `${p.count} × ` : ''}${esc(p.name)}`).join(', ')}</h2>
    ${await stage(k)}
    <ul class="parts">${rows}</ul>
    <div class="dock">
      <button class="btn" data-act="prev" ${ui.backPos === 0 ? 'disabled' : ''}>← Earlier step</button>
      <button class="btn primary" data-act="seek">Where does this go?</button>
      <button class="btn" data-act="next" ${ui.backPos === rs.length - 1 ? 'disabled' : ''}>Next step →</button>
    </div>
    ${sampleRow}
  </div>`;
}

async function partsView() {
  const ps = allParts();
  if (!ps.length) return `<section class="empty"><h2>The tray is empty</h2><p>Parts show up here as you record.</p><button class="btn" data-go="record">Go to Record</button></section>`;
  return `<h2>Parts tray</h2><p class="muted">${ps.length} kinds, ${totals().all} pieces. Tap one to see where it goes.</p>
  <div class="tray">${ps.map((p) => `<button class="tcard ${p.back ? 'is-back' : ''}" data-jump="${p.id}">
    <img src="${p.thumb}" alt=""><b>${p.count > 1 ? `${p.count} × ` : ''}${esc(p.name)}</b><small>Step ${p.step + 1}${p.back ? ' · back in' : ''}</small></button>`).join('')}</div>`;
}

function openSheet(html) {
  sheet.innerHTML = `<div class="sheet-in">${html}</div>`;
  if (!sheet.open) sheet.showModal();
}

async function showMatch(r, parts, queryUrl) {
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  // One card per step: two screws from the same step are one answer, not two.
  const seen = new Set(), top = [];
  for (const x of r.ranked) {
    const p = byId[x.id];
    if (seen.has(p.step)) continue;
    seen.add(p.step); top.push(p);
    if (top.length === (r.verdict === 'sure' ? 1 : 2)) break;
  }
  const q = `<img class="q" src="${queryUrl}" alt="Your photo">`;
  if (!top.length) {
    return openSheet(`${q}<h2>No parts recorded yet</h2><button class="btn" data-close>Close</button>`);
  }
  const cards = await Promise.all(top.map(async (p) => `<div class="match">
      ${await stage(p.step, { focus: p.id, numbered: false })}
      <p><b>${p.count > 1 ? `${p.count} × ` : ''}${esc(p.name)}</b> · Step ${p.step + 1}</p>
      <button class="btn primary" data-jump="${p.id}">Go to step ${p.step + 1}</button></div>`));
  const head = { sure: `It goes here: step ${top[0].step + 1}`, unsure: 'Not sure — it’s one of these', none: 'No close match — best guesses' }[r.verdict];
  const hint = r.verdict === 'none' ? `<p class="muted">Small or plain parts are hard to tell apart. Try a closer photo on a plain surface, or check these steps.</p>` : '';
  openSheet(`${q}<h2>${head}</h2>${hint}
    <div class="matches">${cards.join('')}</div><button class="btn ghost" data-close>Close</button>`);
}

// ---------- events ----------

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button, [data-jump]');
  if (!b) return;
  if (b.dataset.go) return go(b.dataset.go);
  if ('close' in b.dataset) return sheet.close();
  if (b.dataset.sel) { ui.sel = +b.dataset.sel; ui.drawing = false; return render(); }
  if (b.dataset.jump) {
    sheet.open && sheet.close();
    const rs = removalSteps();
    const p = allParts().find((x) => x.id === b.dataset.jump);
    ui.backPos = rs.length - 1 - rs.indexOf(p.step);
    return go('back');
  }
  if (b.dataset.sample) {
    const blob = await (await fetch(`samples/fan/${b.dataset.sample}`)).blob();
    return runLookup(blob);
  }
  const li = b.closest('[data-part]');
  const part = li && T.steps.flatMap((s) => s.parts).find((p) => p.id === li.dataset.part);
  if ('del' in b.dataset && part) {
    const s = T.steps.find((st) => st.parts.includes(part));
    s.parts.splice(s.parts.indexOf(part), 1);
    await save(); return render();
  }
  if ('back' in b.dataset && part) { part.back = !part.back; await save(); return render(); }
  switch (b.dataset.act) {
    case 'sample': return loadSample();
    case 'shoot': return shoot.click();
    case 'seek': return seek.click();
    case 'draw': ui.drawing = !ui.drawing; return render();
    case 'prev': ui.backPos--; return render();
    case 'next': ui.backPos++; return render();
    case 'reset-ticks': allParts(); T.steps.forEach((s) => s.parts.forEach((p) => { p.back = false; })); ui.backPos = 0; await save(); return render();
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.dataset.act !== 'start') return;
  e.preventDefault();
  if (T && T.steps.length && !confirm(`Start over? “${T.name}” and its photos will be deleted from this device.`)) return;
  await startNew(new FormData(e.target).get('name')?.trim());
  go('record');
});

document.addEventListener('change', async (e) => {
  const li = e.target.closest('[data-part]');
  const part = li && T.steps.flatMap((s) => s.parts).find((p) => p.id === li.dataset.part);
  if (part && 'name' in e.target.dataset) { part.name = e.target.value.trim() || 'part'; await save(); }
  if (part && 'count' in e.target.dataset) { part.count = Math.max(1, Math.min(99, +e.target.value || 1)); await save(); }
});

shoot.addEventListener('change', async () => {
  const f = shoot.files[0];
  shoot.value = '';
  if (f) await addPhoto(f);
});
seek.addEventListener('change', async () => {
  const f = seek.files[0];
  seek.value = '';
  if (f) await runLookup(f);
});

// Drawing a box by hand on the photo.
let drag = null;
view.addEventListener('pointerdown', (e) => {
  const st = e.target.closest('.stage.drawing');
  if (!st) return;
  e.preventDefault();
  const r = st.getBoundingClientRect();
  drag = { st, r, x0: e.clientX - r.left, y0: e.clientY - r.top, g: $('.ghostbox', st) };
  st.setPointerCapture(e.pointerId);
});
view.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { r, x0, y0, g } = drag;
  const x1 = Math.max(0, Math.min(r.width, e.clientX - r.left)), y1 = Math.max(0, Math.min(r.height, e.clientY - r.top));
  Object.assign(drag, { x1, y1 });
  g.hidden = false;
  Object.assign(g.style, { left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
});
view.addEventListener('pointerup', async () => {
  if (!drag) return;
  const { st, r, x0, y0, x1 = x0, y1 = y0 } = drag;
  drag = null;
  if (Math.abs(x1 - x0) < 12 || Math.abs(y1 - y0) < 12) return;
  const k = +st.dataset.step, s = T.steps[k], f = s.width / r.width;
  ui.drawing = false;
  await addPart(k, { x: Math.min(x0, x1) * f, y: Math.min(y0, y1) * f, w: Math.abs(x1 - x0) * f, h: Math.abs(y1 - y0) * f }, true);
  if (s.status !== 'ok') s.status = 'ok';
  await save();
  render();
});

T = (await store.loadTeardown()) || null;
if (T?.sample) samples = (await (await fetch('samples/fan/manifest.json')).json()).parts;
render();
