// Image vectors from in-browser models (transformers.js).
// `T` is the transformers.js module (CDN in the browser, npm in Node tests).
import { normalize } from './match.js';

export const MODELS = {
  clip: 'Xenova/clip-vit-base-patch32',
  dino: 'onnx-community/dinov2-small',
};

export function makeEmbedder(T, which, { onProgress } = {}) {
  let ready;
  const load = () => {
    if (ready) return ready;
    const opts = { dtype: 'q8', progress_callback: onProgress };
    ready = which === 'clip'
      ? Promise.all([
          T.AutoProcessor.from_pretrained(MODELS.clip, opts),
          T.CLIPVisionModelWithProjection.from_pretrained(MODELS.clip, opts),
        ]).then(([proc, model]) => async (img) => {
          const { image_embeds } = await model(await proc(img));
          return normalize(image_embeds.data);
        })
      : Promise.all([
          T.AutoProcessor.from_pretrained(MODELS.dino, opts),
          T.AutoModel.from_pretrained(MODELS.dino, opts),
        ]).then(([proc, model]) => async (img) => {
          const { last_hidden_state: h } = await model(await proc(img));
          // CLS token: one vector summarising the whole crop.
          return normalize(h.data.slice(0, h.dims[2]));
        });
    return ready;
  };
  // rgba: {data, width, height}
  return async (rgba) => {
    const f = await load();
    const img = new T.RawImage(rgba.data, rgba.width, rgba.height, 4).rgb();
    return f(img);
  };
}
