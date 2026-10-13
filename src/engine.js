// Browser side of the pipeline: loads OpenCV.js and Transformers.js on demand,
// turns photos into pixels and runs compare / describe / lookup.
import { toMat, detect, pad, foreground, maskBox, dilate, maskRegion } from './vision.js';
import { crop, center, scaleBox, keepMasked, colorSignature } from './pixels.js';
import { makeEmbedder } from './embed.js';
import { rank, suggestNames } from './match.js';

const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js';
const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
const STORE_LONG = 1600;
// Chosen by measurement on the generated test sets; see tests/photos/RESULTS.md.
export const MATCH_MODEL = 'dino';
const COLOR_WEIGHT = 0.1;

let cvP, tP, vocabP;
const embedders = {};
let progress = () => {};
export function onProgress(fn) { progress = fn; }

function loadCv() {
  if (!cvP) cvP = new Promise((res, rej) => {
    progress('Loading the photo comparer…');
    const s = document.createElement('script');
    s.src = CV_URL; s.async = true;
    s.onerror = () => rej(new Error('Could not load OpenCV.js'));
    s.onload = async () => {
      let cv = window.cv;
      if (cv instanceof Promise) cv = await cv;
      // The Emscripten module is thenable; hand it back wrapped so awaiting it doesn't loop.
      const done = () => { delete cv.then; res({ cv }); };
      if (cv.Mat) done(); else cv.onRuntimeInitialized = done;
    };
    document.head.appendChild(s);
  }).then((w) => w.cv);
  return cvP;
}

function loadT() {
  if (!tP) tP = import(TF_URL);
  return tP;
}

function vocab() {
  if (!vocabP) vocabP = fetch(new URL('../data/vocab.json', import.meta.url)).then((r) => r.json()).then((j) => j.names);
  return vocabP;
}

async function embedder(which) {
  if (!embedders[which]) {
    const T = await loadT();
    const seen = {};
    embedders[which] = makeEmbedder(T, which, {
      onProgress: (p) => {
        if (p.status === 'progress' && p.total > 1e6) {
          seen[p.file] = [p.loaded, p.total];
          const [l, t] = Object.values(seen).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          progress(`Downloading the ${which === 'clip' ? 'naming' : 'matching'} model (first time only) ${Math.round((100 * l) / t)}%`);
        }
      },
    });
  }
  return embedders[which];
}

// Downsize a camera photo for storage. Returns {blob, width, height}.
export async function prepare(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, STORE_LONG / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { blob: await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 }), width: w, height: h };
}

export async function pixels(blob) {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, bmp.width, bmp.height);
}

// What changed from `prev` to `next` → boxes on `prev` (in its stored pixels).
export async function compare(prevBlob, nextBlob) {
  const cv = await loadCv();
  progress('Lining up the photos…');
  const a = await pixels(prevBlob), b = await pixels(nextBlob);
  const d = detect(cv, a, b);
  const dm = d.mask ? dilate(cv, d.mask, 9) : null;
  const boxes = d.boxes.map((bx) => {
    const sb = pad(bx, d.ref.cols, d.ref.rows, 0.08);
    return { ...scaleBox(sb, d.scale), mask: maskRegion(dm, sb) };
  });
  [d.ref, d.mask, dm].forEach((m) => m?.delete());
  const al = { ok: d.ok, inliers: d.inliers };
  progress('');
  return { status: !al.ok ? 'misaligned' : boxes.length ? 'ok' : 'nochange', boxes, inliers: al.inliers };
}

function thumb(img) {
  const c = document.createElement('canvas');
  const s = Math.min(1, 240 / Math.max(img.width, img.height));
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  const t = document.createElement('canvas');
  t.width = img.width; t.height = img.height;
  t.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  c.getContext('2d').drawImage(t, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

// Crop a part from its photo: thumbnail, matching vectors, colour and suggested names.
// `mask` (from compare) marks the changed pixels inside the box; hand-drawn boxes have none.
export async function describe(photoBlob, box, mask = null) {
  const img = crop(await pixels(photoBlob), box);
  const cut = mask ? keepMasked(img, mask) : img;
  const out = { thumb: thumb(img), vecs: [], names: [], color: colorSignature(cut) };
  try {
    const m = await embedder(MATCH_MODEL);
    out.vecs = mask ? [await m(cut), await m(img)] : [await m(img), await m(center(img, 0.8))];
    const c = await embedder('clip');
    progress('Naming the part…');
    out.names = suggestNames(await c(img), await vocab());
  } catch (e) {
    console.warn('AI unavailable', e);
    out.error = 'AI unavailable — name it yourself; lookup will retry later.';
  }
  progress('');
  return out;
}

// Loose-part photo → ranked parts + verdict.
export async function lookup(file, parts) {
  const img = await pixels(file);
  const m = await embedder(MATCH_MODEL);
  progress('Looking for a match…');
  const cut = await cutOut(img);
  const q = cut ? [await m(cut), await m(img)] : [await m(img), await m(center(img, 0.6))];
  const queryColor = colorSignature(cut || center(img, 0.6));
  progress('');
  return rank(parts.filter((p) => p.vecs?.length), q, { queryColor, colorWeight: COLOR_WEIGHT });
}

// The loose part without the table around it (GrabCut), or null if the cut failed.
async function cutOut(img) {
  const cv = await loadCv();
  const m = toMat(cv, img, 480);
  const fg = foreground(cv, m);
  const b = maskBox(cv, fg);
  let out = null;
  if (b && b.area > 0.01 * m.rows * m.cols) {
    const bb = pad(b, m.cols, m.rows, 0.1);
    const mk = maskRegion(fg, bb);
    out = keepMasked(crop(img, scaleBox(bb, img.width / m.cols)), mk);
  }
  m.delete(); fg.delete();
  return out;
}


