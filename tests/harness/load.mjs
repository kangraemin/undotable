// Node helpers: load OpenCV.js and images the same way the browser sees them.
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
let cvP;
export function loadCv() {
  // The Emscripten module is thenable; resolving a promise with it loops forever,
  // so wait for the runtime and hand it back wrapped.
  if (!cvP) cvP = new Promise((res) => {
    const cv = require('@techstark/opencv-js');
    const done = () => { delete cv.then; res({ cv }); };
    if (cv.Mat) done(); else cv.onRuntimeInitialized = done;
  }).then((w) => w.cv);
  return cvP;
}
export async function loadImage(path) {
  const { data, info } = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}
export async function saveMat(cv, mat, path) {
  const rgba = new cv.Mat();
  if (mat.channels() === 1) cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA); else mat.copyTo(rgba);
  await sharp(Buffer.from(rgba.data), { raw: { width: rgba.cols, height: rgba.rows, channels: 4 } }).jpeg({ quality: 80 }).toFile(path);
  rgba.delete();
}
