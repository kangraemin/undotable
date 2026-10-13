// Full-pipeline accuracy test on a generated teardown.
// node tests/harness/eval.mjs <photos dir> <out dir> [steps]
// Expects step0..stepN.(png|jpg) (one removal per step) and part1..partN.png (loose part i = removed at step i).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as T from '@huggingface/transformers';
import { loadCv, loadImage, saveMat } from './load.mjs';
import sharp from 'sharp';
const sharpSave = (img, f) => sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.width, height: img.height, channels: 4 } }).jpeg({ quality: 80 }).toFile(f);
import { toMat, detect, pad, foreground, maskBox, dilate, maskRegion } from '../../src/vision.js';
import { crop, center, scaleBox, keepMasked, colorSignature } from '../../src/pixels.js';
import { makeEmbedder } from '../../src/embed.js';
import { rank, suggestNames } from '../../src/match.js';

T.env.cacheDir = fileURLToPath(new URL('../../.cache/models/', import.meta.url));
const [dir, out] = process.argv.slice(2);
const EXT = existsSync(`${dir}/step0.jpg`) ? 'jpg' : 'png';
mkdirSync(out, { recursive: true });
let n = 0;
while (existsSync(`${dir}/step${n + 1}.${EXT}`)) n++;
const cv = await loadCv();
const vocab = JSON.parse(readFileSync(new URL('../../data/vocab.json', import.meta.url))).names;
const emb = { clip: makeEmbedder(T, 'clip'), dino: makeEmbedder(T, 'dino') };

const full = [];
for (let i = 0; i <= n; i++) {
  full.push(await loadImage(`${dir}/step${i}.${EXT}`));
}
const parts = [];
const steps = [];
for (let i = 1; i <= n; i++) {
  const r = detect(cv, full[i - 1], full[i]);
  const s = r.scale;
  steps.push({ step: i, aligned: r.ok, inliers: r.inliers, pass: r.pass, boxes: r.boxes.map((b) => ({ x: Math.round(b.x * s), y: Math.round(b.y * s), w: Math.round(b.w * s), h: Math.round(b.h * s), strength: +b.strength.toFixed(1) })) });
  const vis = r.ref;
  const lw = Math.round(6 * vis.cols / 960);
  r.boxes.forEach((b, k) => cv.rectangle(vis, new cv.Point(b.x, b.y), new cv.Point(b.x + b.w, b.y + b.h), k ? new cv.Scalar(0, 160, 255, 255) : new cv.Scalar(255, 60, 0, 255), k ? lw / 2 : lw));
  await saveMat(cv, vis, `${out}/detect-step${i}.jpg`);
  if (!r.boxes.length) { parts.push({ id: i, box: null }); r.mask?.delete(); vis.delete(); continue; }
  const sb = pad(r.boxes[0], vis.cols, vis.rows);
  const box = scaleBox(sb, s);
  const dm = dilate(cv, r.mask, 9);
  const mask = maskRegion(dm, sb); dm.delete(); r.mask.delete(); vis.delete();
  const c = crop(full[i - 1], box);
  parts.push({ id: i, box, crop: c, masked: keepMasked(c, mask) });
}
async function queryViews(path) {
  const q = await loadImage(path);
  const m = toMat(cv, q, 480);
  const fg = foreground(cv, m);
  const b = maskBox(cv, fg);
  let cut = null;
  if (b && b.area > 0.01 * m.rows * m.cols) {
    const bb = pad(b, m.cols, m.rows, 0.1);
    const mk = maskRegion(fg, bb);
    const sc = q.width / m.cols;
    cut = keepMasked(crop(q, scaleBox(bb, sc)), mk);
  }
  m.delete(); fg.delete();
  return { full: q, center: center(q, 0.6), cut };
}
const results = { photos: dir, steps, models: {} };
const queries = {};
for (let i = 1; i <= n; i++) if (existsSync(`${dir}/part${i}.${EXT}`)) queries[i] = await queryViews(`${dir}/part${i}.${EXT}`);
const ONLY = process.env.ONLY; // e.g. dino/masked/cut — the configuration the app ships
const PART = { plain: (p) => [p.crop, center(p.crop, 0.8)], masked: (p) => [p.masked, p.crop] };
const QUERY = { plain: (q) => [q.full, q.center], cut: (q) => (q.cut ? [q.cut, q.full] : [q.full, q.center]) };
const CW = (process.env.CW || '0,0.5,1').split(',').map(Number);
for (const [name, e] of Object.entries(emb)) {
  const memo = new Map();
  const ev = async (img) => { if (!memo.has(img)) memo.set(img, await e(img)); return memo.get(img); };
  for (const [pk, pf] of Object.entries(PART)) for (const [qk, qf] of Object.entries(QUERY)) {
    if (ONLY && !ONLY.startsWith(`${name}/${pk}/${qk}`)) continue;
    const lib = [];
    for (const p of parts) if (p.crop) lib.push({ id: p.id, vecs: await Promise.all(pf(p).map(ev)), color: colorSignature(p.masked) });
    for (const cw of CW) {
      const rows = [];
      for (const [i, q] of Object.entries(queries)) {
        const r = rank(lib, await Promise.all(qf(q).map(ev)), { queryColor: colorSignature(q.cut || q.center), colorWeight: cw });
        rows.push({ part: +i, top: r.ranked[0].id, correct: r.ranked[0].id === +i, verdict: r.verdict, top2: r.ranked.slice(0, 2).some((x) => x.id === +i),
          scores: r.ranked.slice(0, 3).map((x) => `${x.id}:${x.score.toFixed(3)}`).join(' ') });
      }
      results.models[`${name}/${pk}/${qk}/cw${cw}`] = { top1: rows.filter((r) => r.correct).length, top2: rows.filter((r) => r.top2).length, total: rows.length, rows };
    }
  }
}
results.names = [];
for (const p of parts) if (p.crop) results.names.push({ part: p.id, names: suggestNames(await emb.clip(p.crop), vocab) });
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
for (const [m, r] of Object.entries(results.models)) console.log(m, `${r.top1}/${r.total} top2 ${r.top2}`, r.rows.map((x) => `${x.part}->${x.top}${x.verdict[0]}`).join(' '));
console.log('names', JSON.stringify(results.names));
// cut-outs for visual check
for (const p of parts) if (p.masked) await sharpSave(p.masked, `${out}/part${p.id}-cut.jpg`);
for (const [i, q] of Object.entries(queries)) if (q.cut) await sharpSave(q.cut, `${out}/query${i}-cut.jpg`);
for (const s of steps) console.log('step', s.step, s.aligned, s.inliers, s.boxes.map((b) => `${b.x},${b.y},${b.w}x${b.h}@${b.strength}`).join(' | '));
