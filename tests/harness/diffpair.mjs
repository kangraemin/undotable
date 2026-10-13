// node diffpair.mjs before.png after.png out.jpg  -> draws detected change boxes on `before`
import { loadCv, loadImage, saveMat } from './load.mjs';
import { toMat, align, changes } from '../../src/vision.js';
const [a, b, out] = process.argv.slice(2);
const cv = await loadCv();
const m1 = toMat(cv, await loadImage(a)), m2 = toMat(cv, await loadImage(b));
const al = align(cv, m1, m2);
const r = changes(cv, m1, al.mat, al.valid);
console.log(JSON.stringify({ aligned: al.ok, inliers: al.inliers, thr: r.threshold, boxes: r.boxes }));
if (out) {
  const vis = m1.clone();
  r.boxes.forEach((bx, i) => cv.rectangle(vis, new cv.Point(bx.x, bx.y), new cv.Point(bx.x + bx.w, bx.y + bx.h), i ? new cv.Scalar(255, 200, 0, 255) : new cv.Scalar(255, 0, 80, 255), 4));
  await saveMat(cv, vis, out);
}
