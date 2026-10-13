// Matching a loose-part photo to the parts recorded during the teardown.
// Works on plain number arrays so it is model-agnostic and easy to test.

export function normalize(v) {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return Array.from(v, (x) => x / s);
}

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Histogram intersection of two colour signatures (0..1).
export function colorSimilarity(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i]);
  return s;
}

// parts: [{id, vecs: [normalized vectors], color?}]; query: [normalized vectors] (several views of
// one photo), queryColor optional.
// Score = best pairwise cosine between any query view and any part view, plus
// `colorWeight` x colour similarity when both sides have a colour signature.
// Returns ranked [{id, score}] and a verdict:
//   'sure'    — the winner is clearly ahead
//   'unsure'  — the runner-up is within `margin` (show both)
//   'none'    — nothing looks similar enough
export function rank(parts, query, { margin = 0.03, floor = 0.5, queryColor = null, colorWeight = 0 } = {}) {
  const scored = parts.map((p) => {
    let best = -1;
    for (const q of query) for (const v of p.vecs) best = Math.max(best, cosine(q, v));
    if (colorWeight && queryColor && p.color) best += colorWeight * colorSimilarity(queryColor, p.color);
    return { id: p.id, score: best };
  });
  scored.sort((a, b) => b.score - a.score);
  let verdict = 'sure';
  if (!scored.length || scored[0].score < floor) verdict = 'none';
  else if (scored.length > 1 && scored[0].score - scored[1].score < margin) verdict = 'unsure';
  return { ranked: scored, verdict };
}

// Zero-shot name suggestion: image vector vs precomputed text vectors.
export function suggestNames(vec, vocab, k = 3) {
  return vocab
    .map((w) => ({ name: w.name, score: cosine(vec, w.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((w) => w.name);
}
