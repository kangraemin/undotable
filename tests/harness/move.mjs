// Make a "hand-held" copy of a photo set: every step photo is shifted, rotated, zoomed and
// slightly re-lit, the way a second phone shot of the same table would be.
// node tests/harness/move.mjs tests/photos/remote tests/photos/remote-moved
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { loadCv, loadImage, saveMat } from './load.mjs';
const cv = await loadCv();
const [src, dst] = process.argv.slice(2);
mkdirSync(dst, { recursive: true });
let seed = 11;
const rnd = (a, b) => a + (b - a) * ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; existsSync(`${src}/step${i}.jpg`); i++) {
  const m = cv.matFromImageData(await loadImage(`${src}/step${i}.jpg`));
  const out = new cv.Mat();
  if (i === 0) m.copyTo(out);
  else {
    const c = new cv.Point(m.cols / 2 + rnd(-40, 40), m.rows / 2 + rnd(-40, 40));
    const M = cv.getRotationMatrix2D(c, rnd(-4, 4), rnd(0.94, 1.06));
    M.doublePtr(0, 2)[0] += rnd(-0.04, 0.04) * m.cols;
    M.doublePtr(1, 2)[0] += rnd(-0.04, 0.04) * m.rows;
    cv.warpAffine(m, out, M, new cv.Size(m.cols, m.rows), cv.INTER_LINEAR, cv.BORDER_REFLECT);
    M.delete();
    out.convertTo(out, -1, rnd(0.92, 1.08), rnd(-10, 10)); // exposure drift
  }
  await saveMat(cv, out, `${dst}/step${i}.jpg`);
  m.delete(); out.delete();
}
for (let i = 1; existsSync(`${src}/part${i}.jpg`); i++) copyFileSync(`${src}/part${i}.jpg`, `${dst}/part${i}.jpg`);
console.log('done');
