import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crop, center, scaleBox } from '../../src/pixels.js';

const img = (w, h) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4] = i; // red channel = pixel index
  return { data, width: w, height: h };
};

test('crop copies the right rows and columns', () => {
  const c = crop(img(10, 10), { x: 2, y: 3, w: 4, h: 2 });
  assert.equal(c.width, 4); assert.equal(c.height, 2);
  assert.equal(c.data[0], 32);           // (2,3)
  assert.equal(c.data[4 * 4], 42);       // (2,4)
});

test('crop clamps boxes that run off the image', () => {
  const c = crop(img(10, 10), { x: 8, y: 8, w: 10, h: 10 });
  assert.equal(c.width, 2); assert.equal(c.height, 2);
});

test('center keeps the middle share', () => {
  const c = center(img(10, 10), 0.6);
  assert.equal(c.width, 6); assert.equal(c.data[0], 22);
});

test('scaleBox maps a box back to the original photo', () => {
  assert.deepEqual(scaleBox({ x: 1, y: 2, w: 3, h: 4 }, 2), { x: 2, y: 4, w: 6, h: 8 });
});
