// Precompute CLIP text vectors for the part-name suggestions, so the browser
// only needs the image half of the model. Output: data/vocab.json
import { AutoTokenizer, CLIPTextModelWithProjection, env } from '@huggingface/transformers';
import { writeFileSync } from 'node:fs';
env.cacheDir = new URL('../.cache/models/', import.meta.url).pathname;
const MODEL = 'Xenova/clip-vit-base-patch32';
const NAMES = [
  'screw', 'bolt', 'nut', 'washer', 'spring', 'clip', 'bracket', 'hinge', 'knob', 'button',
  'keycap', 'spacebar', 'switch', 'stabilizer', 'cover', 'lid', 'panel', 'back plate', 'grille', 'clip ring',
  'fan blade', 'spinner cap', 'gear', 'wheel', 'belt', 'shaft', 'bearing', 'battery', 'battery cover', 'cable',
  'connector', 'circuit board', 'chip', 'motor', 'speaker', 'lens', 'glass', 'filter', 'rubber foot', 'gasket',
  'handle', 'trigger', 'cap', 'ring', 'tube', 'pin', 'magnet', 'pad', 'bezel', 'frame',
];
const tok = await AutoTokenizer.from_pretrained(MODEL);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });
const out = [];
for (const name of NAMES) {
  const inputs = tok([`a photo of a ${name}`, `a close-up photo of a ${name}, a small part of a device`], { padding: true, truncation: true });
  const { text_embeds } = await model(inputs);
  const d = text_embeds.dims[1], a = text_embeds.data;
  const v = Array.from({ length: d }, (_, i) => a[i] + a[d + i]);
  const n = Math.hypot(...v);
  out.push({ name, vec: v.map((x) => +(x / n).toFixed(5)) });
}
writeFileSync(new URL('../data/vocab.json', import.meta.url), JSON.stringify({ model: MODEL, names: out }));
console.log('wrote', out.length);
