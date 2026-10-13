// What a person would see for each loose-part lookup, from eval.mjs results.
// node tests/harness/summary.mjs tests/photos/results/{fan,kb,remote}
import { readFileSync } from 'node:fs';
const KEY = process.env.ONLY_KEY || 'dino/masked/cut/cw0.1';
const tally = { 'sure, right': 0, 'sure, wrong': 0, 'two shown, right one in': 0, 'two shown, right one missing': 0 };
for (const dir of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(`${dir}/results.json`)).models[KEY];
  for (const x of r.rows) {
    const k = x.verdict === 'sure' ? (x.correct ? 'sure, right' : 'sure, wrong') : x.top2 ? 'two shown, right one in' : 'two shown, right one missing';
    tally[k]++;
    console.log(`${dir.split('/').pop()} part${x.part}: ${x.verdict.padEnd(6)} ${k.padEnd(28)} ${x.scores}`);
  }
}
console.log(JSON.stringify(tally));
