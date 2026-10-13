// Change detection on synthetic photos: a textured "mat" with one part removed,
// the second photo taken from a slightly different spot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCv } from '../harness/load.mjs';
import { align, changes, maskRegion } from '../../src/vision.js';

function scene(cv, withPart) {
  const m = new cv.Mat(480, 640, cv.CV_8UC4, new cv.Scalar(70, 120, 80, 255));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(rnd() * 620), y = Math.floor(rnd() * 460), c = 60 + Math.floor(rnd() * 190);
    cv.rectangle(m, new cv.Point(x, y), new cv.Point(x + 4 + Math.floor(rnd() * 14), y + 4 + Math.floor(rnd() * 14)), new cv.Scalar(c, 255 - c, (c * 3) % 255, 255), -1);
  }
  if (withPart) cv.circle(m, new cv.Point(420, 160), 34, new cv.Scalar(230, 140, 20, 255), -1);
  return m;
}

function shifted(cv, m) {
  const out = new cv.Mat();
  const M = cv.getRotationMatrix2D(new cv.Point(320, 240), 2.5, 1.03);
  M.doublePtr(0, 2)[0] += 9; M.doublePtr(1, 2)[0] -= 6;
  cv.warpAffine(m, out, M, new cv.Size(640, 480), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  M.delete();
  return out;
}

test('finds the removed part after lining up a moved photo', async () => {
  const cv = await loadCv();
  const before = scene(cv, true);
  const after = shifted(cv, scene(cv, false));
  const al = align(cv, before, after);
  assert.ok(al.ok, 'photos line up');
  const { boxes } = changes(cv, before, al.mat, al.valid);
  assert.ok(boxes.length >= 1, 'found a change');
  const b = boxes[0], cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  assert.ok(Math.abs(cx - 420) < 25 && Math.abs(cy - 160) < 25, `box centred on the part (${cx}, ${cy})`);
  assert.ok(b.w < 140 && b.h < 140, 'box is tight');
});

test('without lining up first, the moved photo looks different almost everywhere', async () => {
  const cv = await loadCv();
  const before = scene(cv, true);
  const after = shifted(cv, scene(cv, false));
  const valid = new cv.Mat(480, 640, cv.CV_8UC1, new cv.Scalar(255));
  const { boxes } = changes(cv, before, after, valid);
  const area = boxes.reduce((a, b) => a + b.w * b.h, 0);
  assert.ok(area > 0.3 * 640 * 480, `raw diff flags a large area (${area})`);
});

test('two identical photos show no change', async () => {
  const cv = await loadCv();
  const a = scene(cv, true), b = scene(cv, true);
  const al = align(cv, a, b);
  assert.equal(changes(cv, a, al.mat, al.valid).boxes.length, 0);
});

test('a brighter, higher-contrast second shot still shows only the removed part', async () => {
  const cv = await loadCv();
  const before = scene(cv, true);
  const after = shifted(cv, scene(cv, false));
  after.convertTo(after, -1, 1.08, 14);
  const al = align(cv, before, after);
  const { boxes } = changes(cv, before, al.mat, al.valid);
  assert.equal(boxes.length, 1, `one box (${boxes.length})`);
  const b = boxes[0];
  assert.ok(Math.abs(b.x + b.w / 2 - 420) < 25 && Math.abs(b.y + b.h / 2 - 160) < 25, 'on the part');
});

test('maskRegion copies a rectangle row by row', async () => {
  const cv = await loadCv();
  const m = cv.Mat.zeros(40, 50, cv.CV_8UC1);
  for (let y = 10; y < 20; y++) for (let x = 5; x < 15; x++) m.ucharPtr(y, x)[0] = 255;
  const r = maskRegion(m, { x: 5, y: 10, w: 20, h: 10 });
  m.delete();
  assert.equal(r.data.length, 200);
  for (let y = 0; y < 10; y++) {
    assert.equal(r.data[y * 20 + 9], 255, `row ${y} left half`);
    assert.equal(r.data[y * 20 + 10], 0, `row ${y} right half`);
  }
});
