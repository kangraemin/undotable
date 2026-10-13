// Why align first: the same change detection with and without lining the photos up.
// node tests/harness/noalign.mjs tests/photos/remote
import { existsSync } from 'node:fs';
import { loadCv, loadImage, saveMat } from './load.mjs';
import { toMat, align, changes } from '../../src/vision.js';
const cv = await loadCv();
const [dir, out] = process.argv.slice(2);
for (let i = 1; existsSync(`${dir}/step${i}.jpg`); i++) {
  const a = toMat(cv, await loadImage(`${dir}/step${i - 1}.jpg`)), b = toMat(cv, await loadImage(`${dir}/step${i}.jpg`));
  const ones = new cv.Mat(a.rows, a.cols, cv.CV_8UC1, new cv.Scalar(255));
  const raw = changes(cv, a, b, ones);
  const al = align(cv, a, b);
  const fit = changes(cv, a, al.mat, al.valid);
  const share = (r) => (100 * cv.countNonZero(r.mask) / (a.rows * a.cols)).toFixed(1);
  console.log(`step ${i}: without aligning ${raw.boxes.length} boxes, ${share(raw)}% of frame flagged | aligned ${fit.boxes.length} boxes, ${share(fit)}% flagged`);
  if (out) {
    const vis = a.clone();
    raw.boxes.forEach((x) => cv.rectangle(vis, new cv.Point(x.x, x.y), new cv.Point(x.x + x.w, x.y + x.h), new cv.Scalar(255, 0, 255, 255), 5));
    await saveMat(cv, vis, `${out}/noalign-step${i}.jpg`);
    vis.delete();
  }
  [a, b, ones, raw.mask, al.mat, al.valid, fit.mask].forEach((m) => m.delete());
}
