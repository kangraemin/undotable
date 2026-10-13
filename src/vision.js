// Finds what changed between two teardown photos.
// Pure functions over OpenCV.js Mats; the caller passes `cv` in so the same
// code runs in the browser (CDN build) and in Node tests (npm build).

const WORK = 960; // long side used for matching and diffing

// RGBA ImageData-like {data, width, height} -> cv.Mat (RGBA), scaled so the long side is `long`.
export function toMat(cv, img, long = WORK) {
  const src = cv.matFromImageData(img);
  const s = long / Math.max(img.width, img.height);
  if (s >= 1) return src;
  const dst = new cv.Mat();
  cv.resize(src, dst, new cv.Size(Math.round(img.width * s), Math.round(img.height * s)), 0, 0, cv.INTER_AREA);
  src.delete();
  return dst;
}

// Warp `img` into `ref`'s frame using ORB features + RANSAC homography.
// Returns {mat, valid, inliers, ok}. `valid` marks pixels that came from the photo
// (not the black border a warp leaves behind).
export function align(cv, ref, img) {
  const g1 = new cv.Mat(), g2 = new cv.Mat();
  cv.cvtColor(ref, g1, cv.COLOR_RGBA2GRAY);
  cv.cvtColor(img, g2, cv.COLOR_RGBA2GRAY);
  const orb = new cv.ORB(3000);
  const k1 = new cv.KeyPointVector(), k2 = new cv.KeyPointVector();
  const d1 = new cv.Mat(), d2 = new cv.Mat(), none = new cv.Mat();
  orb.detectAndCompute(g1, none, k1, d1);
  orb.detectAndCompute(g2, none, k2, d2);
  const out = { mat: null, valid: null, inliers: 0, ok: false };
  const good = [];
  if (d1.rows > 10 && d2.rows > 10) {
    const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    const knn = new cv.DMatchVectorVector();
    bf.knnMatch(d2, d1, knn, 2);
    for (let i = 0; i < knn.size(); i++) {
      const m = knn.get(i);
      if (m.size() < 2) continue;
      const a = m.get(0), b = m.get(1);
      if (a.distance < 0.75 * b.distance) good.push(a);
    }
    knn.delete(); bf.delete();
  }
  let H = null;
  if (good.length >= 12) {
    const p2 = [], p1 = [];
    for (const m of good) {
      const q = k2.get(m.queryIdx).pt, t = k1.get(m.trainIdx).pt;
      p2.push(q.x, q.y); p1.push(t.x, t.y);
    }
    const m2 = cv.matFromArray(good.length, 1, cv.CV_32FC2, p2);
    const m1 = cv.matFromArray(good.length, 1, cv.CV_32FC2, p1);
    const mask = new cv.Mat();
    H = cv.findHomography(m2, m1, cv.RANSAC, 4, mask);
    for (let i = 0; i < mask.rows; i++) out.inliers += mask.data[i];
    m1.delete(); m2.delete(); mask.delete();
    if (H.empty() || out.inliers < 15) { H.delete(); H = null; }
  }
  const size = new cv.Size(ref.cols, ref.rows);
  out.mat = new cv.Mat();
  const ones = new cv.Mat(img.rows, img.cols, cv.CV_8UC1, new cv.Scalar(255));
  out.valid = new cv.Mat();
  if (H) {
    cv.warpPerspective(img, out.mat, H, size, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
    cv.warpPerspective(ones, out.valid, H, size, cv.INTER_NEAREST, cv.BORDER_CONSTANT, new cv.Scalar(0));
    out.ok = true;
    H.delete();
  } else {
    cv.resize(img, out.mat, size, 0, 0, cv.INTER_AREA);
    cv.resize(ones, out.valid, size, 0, 0, cv.INTER_NEAREST);
  }
  [g1, g2, k1, k2, d1, d2, none, ones].forEach((m) => m.delete());
  orb.delete();
  return out;
}

// Regions that look different between `before` and `after` (already aligned).
// Returns boxes in `before` pixel coordinates, biggest change first.
export function changes(cv, before, after, valid, opts = {}) {
  const minArea = opts.minArea ?? 0.0001; // share of the image; a screw is ~0.0001 at 960px
  const lab1 = new cv.Mat(), lab2 = new cv.Mat(), t = new cv.Mat();
  cv.cvtColor(before, t, cv.COLOR_RGBA2RGB); cv.cvtColor(t, lab1, cv.COLOR_RGB2Lab);
  cv.cvtColor(after, t, cv.COLOR_RGBA2RGB); cv.cvtColor(t, lab2, cv.COLOR_RGB2Lab);
  const k = new cv.Size(7, 7);
  cv.GaussianBlur(lab1, lab1, k, 0); cv.GaussianBlur(lab2, lab2, k, 0);
  matchLevels(cv, lab1, lab2, valid);
  // Lighting drifts between shots; compare colour more than brightness.
  const diff = new cv.Mat();
  cv.absdiff(lab1, lab2, diff);
  const ch = new cv.MatVector();
  cv.split(diff, ch);
  const L = ch.get(0), A = ch.get(1), B = ch.get(2);
  const score = new cv.Mat();
  cv.addWeighted(A, 1.6, B, 1.6, 0, score);
  cv.addWeighted(score, 1, L, 0.7, 0, score);
  // Ignore the warp border.
  const v = new cv.Mat();
  cv.erode(valid, v, cv.Mat.ones(15, 15, cv.CV_8U));
  const masked = new cv.Mat.zeros(score.rows, score.cols, cv.CV_8UC1);
  score.copyTo(masked, v);
  const bin = new cv.Mat();
  const thr = opts.threshold ?? adaptiveThreshold(cv, masked, v, opts.floor);
  cv.threshold(masked, bin, thr, 255, cv.THRESH_BINARY);
  const kOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  const kClose = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(21, 21));
  cv.morphologyEx(bin, bin, cv.MORPH_OPEN, kOpen);
  cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kClose);
  const labels = new cv.Mat(), stats = new cv.Mat(), cents = new cv.Mat();
  const n = cv.connectedComponentsWithStats(bin, labels, stats, cents, 8, cv.CV_32S);
  const total = before.rows * before.cols;
  let boxes = [];
  for (let i = 1; i < n; i++) {
    const x = stats.intAt(i, 0), y = stats.intAt(i, 1), w = stats.intAt(i, 2), h = stats.intAt(i, 3);
    const area = stats.intAt(i, 4);
    if (area / total < minArea) continue;
    boxes.push({ x, y, w, h, area });
  }
  boxes = mergeClose(boxes, Math.round(Math.max(before.cols, before.rows) * 0.03));
  // How strongly the changed pixels changed (0-255): ranks boxes and drops faint
  // small specks (shadows, reflections) while keeping small, crisp parts like screws.
  for (const b of boxes) {
    const roi = masked.roi(new cv.Rect(b.x, b.y, b.w, b.h));
    const m = bin.roi(new cv.Rect(b.x, b.y, b.w, b.h));
    b.strength = cv.mean(roi, m)[0];
    roi.delete(); m.delete();
  }
  boxes = boxes.filter((b) => b.area / total >= 0.002 || b.strength >= thr * 1.6);
  boxes.sort((a, b) => b.area * b.strength - a.area * a.strength);
  [lab1, lab2, t, diff, ch, score, v, masked, kOpen, kClose, labels, stats, cents].forEach((m) => m.delete());
  // `mask` (255 = changed) lets callers cut the part out of its surroundings; caller deletes it.
  return { boxes: boxes.slice(0, opts.max ?? 6), threshold: thr, mask: bin };
}

// Noise floor of the difference image: most of the frame did not change, so
// the median plus a few spreads is a safe cut; never below `floor`.
function adaptiveThreshold(cv, score, valid, floor = 28) {
  floor ??= 28;
  const hist = new Array(256).fill(0);
  let cnt = 0;
  for (let i = 0; i < score.data.length; i++) {
    if (!valid.data[i]) continue;
    hist[score.data[i]]++; cnt++;
  }
  const pct = (p) => { let s = 0; for (let i = 0; i < 256; i++) { s += hist[i]; if (s >= cnt * p) return i; } return 255; };
  const med = pct(0.5), p90 = pct(0.9);
  return Math.max(floor, Math.min(120, med + 3 * Math.max(4, p90 - med)));
}

function mergeClose(boxes, gap) {
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x - gap <= b.x + b.w && b.x - gap <= a.x + a.w && a.y - gap <= b.y + b.h && b.y - gap <= a.y + a.h) {
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
          boxes[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, area: a.area + b.area };
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return boxes;
}

// Grow a box by `pad` (share of its size), clamped to the image.
export function pad(box, cols, rows, padShare = 0.12) {
  const px = Math.round(box.w * padShare), py = Math.round(box.h * padShare);
  const x = Math.max(0, box.x - px), y = Math.max(0, box.y - py);
  return { x, y, w: Math.min(cols, box.x + box.w + px) - x, h: Math.min(rows, box.y + box.h + py) - y };
}

// Cut the object out of a loose-part photo: GrabCut seeded with "the part is
// somewhere in the middle". Returns a 0/255 mask the size of `img` (caller deletes).
export function foreground(cv, img, inset = 0.08) {
  const rgb = new cv.Mat();
  cv.cvtColor(img, rgb, cv.COLOR_RGBA2RGB);
  const mask = new cv.Mat(), bg = new cv.Mat(), fg = new cv.Mat();
  const r = new cv.Rect(Math.round(img.cols * inset), Math.round(img.rows * inset), Math.round(img.cols * (1 - 2 * inset)), Math.round(img.rows * (1 - 2 * inset)));
  cv.grabCut(rgb, mask, r, bg, fg, 4, cv.GC_INIT_WITH_RECT);
  const out = new cv.Mat(mask.rows, mask.cols, cv.CV_8UC1);
  for (let i = 0; i < mask.data.length; i++) out.data[i] = mask.data[i] === 1 || mask.data[i] === 3 ? 255 : 0;
  [rgb, mask, bg, fg].forEach((m) => m.delete());
  return out;
}

// Bounding box of the mask's largest blob, or null.
export function maskBox(cv, mask) {
  const labels = new cv.Mat(), stats = new cv.Mat(), cents = new cv.Mat();
  const n = cv.connectedComponentsWithStats(mask, labels, stats, cents, 8, cv.CV_32S);
  let best = null;
  for (let i = 1; i < n; i++) {
    const area = stats.intAt(i, 4);
    if (!best || area > best.area) best = { x: stats.intAt(i, 0), y: stats.intAt(i, 1), w: stats.intAt(i, 2), h: stats.intAt(i, 3), area };
  }
  [labels, stats, cents].forEach((m) => m.delete());
  return best;
}

export function dilate(cv, mask, px) {
  const out = new cv.Mat();
  const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(px, px));
  cv.dilate(mask, out, k);
  k.delete();
  return out;
}

// Copy a rectangle of a single-channel mask into a plain {data, width, height}.
// (Reads the parent buffer directly: in OpenCV.js a cloned ROI can keep the parent's stride.)
export function maskRegion(mask, { x, y, w, h }) {
  const data = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) data.set(mask.data.subarray((y + r) * mask.cols + x, (y + r) * mask.cols + x + w), r * w);
  return { data, width: w, height: h };
}

// Two passes: the normal one at 960px, and only if it finds nothing a finer one at
// 1600px with a lower noise floor (the photo was taken because something came off,
// so a tiny screw is more likely than "nothing"). Boxes are in the returned `ref`'s pixels;
// the caller deletes `ref` and `mask`.
export const PASSES = [{ long: WORK }, { long: 1600, minArea: 0.00002, floor: 18 }];
export function detect(cv, a, b) {
  for (let i = 0; i < PASSES.length; i++) {
    const { long, ...opts } = PASSES[i];
    const m1 = toMat(cv, a, long), m2 = toMat(cv, b, long);
    const al = align(cv, m1, m2);
    const r = al.ok ? changes(cv, m1, al.mat, al.valid, opts) : { boxes: [], mask: null };
    m2.delete(); al.mat.delete(); al.valid.delete();
    const last = i === PASSES.length - 1 || !al.ok;
    if (r.boxes.length || last) return { ref: m1, boxes: r.boxes, mask: r.mask, ok: al.ok, inliers: al.inliers, scale: a.width / m1.cols, pass: i };
    m1.delete(); r.mask.delete();
  }
}

// Exposure and white balance change between phone shots. Give each channel of `b`
// the mean and spread of the same channel in `a` (over the overlapping pixels) so only
// real changes stand out.
function matchLevels(cv, a, b, valid) {
  const ca = new cv.MatVector(), cb = new cv.MatVector();
  cv.split(a, ca); cv.split(b, cb);
  const out = new cv.MatVector();
  for (let i = 0; i < 3; i++) {
    const ma = new cv.Mat(), sa = new cv.Mat(), mb = new cv.Mat(), sb = new cv.Mat();
    cv.meanStdDev(ca.get(i), ma, sa, valid);
    cv.meanStdDev(cb.get(i), mb, sb, valid);
    const g = sb.doubleAt(0, 0) > 1 ? Math.min(1.3, Math.max(0.77, sa.doubleAt(0, 0) / sb.doubleAt(0, 0))) : 1;
    const ch = new cv.Mat();
    cb.get(i).convertTo(ch, -1, g, ma.doubleAt(0, 0) - g * mb.doubleAt(0, 0));
    out.push_back(ch);
    [ma, sa, mb, sb, ch].forEach((m) => m.delete());
  }
  cv.merge(out, b);
  [ca, cb, out].forEach((v) => v.delete());
}
