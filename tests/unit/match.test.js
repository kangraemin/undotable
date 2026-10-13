import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, cosine, rank, suggestNames } from '../../src/match.js';

const v = (...xs) => normalize(xs);

test('normalize makes unit vectors', () => {
  assert.ok(Math.abs(cosine(v(3, 4), v(3, 4)) - 1) < 1e-9);
});

test('rank picks the closest part and is sure when it is clearly ahead', () => {
  const parts = [{ id: 'knob', vecs: [v(1, 0, 0)] }, { id: 'screw', vecs: [v(0, 1, 0)] }];
  const r = rank(parts, [v(0.9, 0.1, 0)]);
  assert.equal(r.ranked[0].id, 'knob');
  assert.equal(r.verdict, 'sure');
});

test('rank uses the best view of the query and of the part', () => {
  const parts = [{ id: 'a', vecs: [v(1, 0, 0), v(0, 0, 1)] }, { id: 'b', vecs: [v(0, 1, 0)] }];
  const r = rank(parts, [v(0, 0.2, 1), v(0.3, 0.3, 0.3)]);
  assert.equal(r.ranked[0].id, 'a');
});

test('rank is unsure when the top two are within the margin', () => {
  const parts = [{ id: 'left screw', vecs: [v(1, 0.01, 0)] }, { id: 'right screw', vecs: [v(1, 0, 0.01)] }];
  assert.equal(rank(parts, [v(1, 0, 0)]).verdict, 'unsure');
});

test('rank says none when nothing is similar enough', () => {
  const parts = [{ id: 'a', vecs: [v(1, 0, 0)] }];
  assert.equal(rank(parts, [v(0, 1, 0)]).verdict, 'none');
  assert.equal(rank([], [v(0, 1, 0)]).verdict, 'none');
});

test('suggestNames returns the closest words first', () => {
  const vocab = [{ name: 'screw', vec: v(1, 0) }, { name: 'knob', vec: v(0, 1) }, { name: 'nut', vec: v(0.7, 0.7) }];
  assert.deepEqual(suggestNames(v(1, 0.1), vocab, 2), ['screw', 'nut']);
});
