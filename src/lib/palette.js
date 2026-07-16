// Scene color palette: quantize an image (the scene's first generated frame)
// into its dominant colors, so later frames can be prompted to match the
// established grading. Pure client-side canvas sampling — no API calls.
export function extractPalette(dataURL, count = 5) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const S = 48;
        const c = document.createElement('canvas');
        c.width = S;
        c.height = S;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, S, S);
        const d = g.getImageData(0, 0, S, S).data;
        // 3-bits-per-channel buckets, averaged back to true colors.
        const buckets = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const key = ((d[i] & 0xe0) << 16) | ((d[i + 1] & 0xe0) << 8) | (d[i + 2] & 0xe0);
          const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          e.n++;
          e.r += d[i];
          e.g += d[i + 1];
          e.b += d[i + 2];
          buckets.set(key, e);
        }
        const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
        const colors = [...buckets.values()]
          .sort((a, b) => b.n - a.n)
          .slice(0, count)
          .map((e) => `#${hex(e.r / e.n)}${hex(e.g / e.n)}${hex(e.b / e.n)}`);
        resolve(colors);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = dataURL;
  });
}
