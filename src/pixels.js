// Small helpers over RGBA pixel buffers ({data, width, height}).

export function crop(img, { x, y, w, h }) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.min(img.width - x, Math.round(w)); h = Math.min(img.height - y, Math.round(h));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) {
    const s = ((y + r) * img.width + x) * 4;
    out.set(img.data.subarray(s, s + w * 4), r * w * 4);
  }
  return { data: out, width: w, height: h };
}

// Central part of an image, `share` of each side.
export function center(img, share = 0.7) {
  const w = img.width * share, h = img.height * share;
  return crop(img, { x: (img.width - w) / 2, y: (img.height - h) / 2, w, h });
}

// Scale a box found on a resized copy back to the original photo.
export function scaleBox(b, s) {
  return { x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s };
}

// Grey out everything outside the mask. `mask` is {data, width, height} (0/255) covering
// the same area as `img`, possibly at a smaller size.
export function keepMasked(img, mask, grey = 127) {
  const out = new Uint8ClampedArray(img.data);
  const sx = mask.width / img.width, sy = mask.height / img.height;
  for (let y = 0; y < img.height; y++) {
    const my = Math.min(mask.height - 1, Math.floor(y * sy));
    for (let x = 0; x < img.width; x++) {
      if (mask.data[my * mask.width + Math.min(mask.width - 1, Math.floor(x * sx))]) continue;
      const i = (y * img.width + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = grey;
      out[i + 3] = 0; // marks "not the part" for colorSignature
    }
  }
  return { data: out, width: img.width, height: img.height };
}

// Colour signature of the visible (alpha > 0) pixels: 12 hue bins x 2 saturation
// bins for coloured pixels + 4 brightness bins for greys. Sums to 1.
export function colorSignature(img) {
  const bins = new Float64Array(12 * 2 + 4);
  let n = 0;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    const sat = mx ? c / mx : 0;
    if (sat < 0.22 || mx < 0.12) {
      bins[24 + Math.min(3, Math.floor(mx * 4))]++;
    } else {
      let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
      h = (h * 60 + 360) % 360;
      bins[Math.floor(h / 30) * 2 + (sat > 0.55 ? 1 : 0)]++;
    }
    n++;
  }
  return Array.from(bins, (x) => (n ? x / n : 0));
}
