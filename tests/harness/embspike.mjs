import { pipeline, RawImage, env } from '@huggingface/transformers';
env.cacheDir = new URL('../../.cache/models/', import.meta.url).pathname;
const id = process.argv[2];
const t0 = Date.now();
const fe = await pipeline('image-feature-extraction', id, { dtype: 'q8' });
console.log('loaded', id, Date.now() - t0, 'ms');
const img = await RawImage.read(process.argv[3]);
const out = await fe(img);
console.log(out.dims, Date.now() - t0, 'ms');
