export function fileToResizedDataURL(file, maxDim = 640, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read the image file.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export function dataURLToImageBlock(dataURL) {
  const [head, data] = dataURL.split(',');
  const mediaType = head.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

// Split a data URL into a Gemini inline_data part.
export function dataURLToInline(dataURL) {
  const [head, data] = dataURL.split(',');
  const mimeType = head.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  return { mime_type: mimeType, data };
}

// Downscale + re-encode a data URL, capping total pixels (default ~2 megapixels).
export function resizeDataURL(dataURL, maxPixels = 2_000_000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const pixels = img.width * img.height;
      const scale = pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not process the generated image.'));
    img.src = dataURL;
  });
}

// The picture with the marker strokes burned in (JPEG), for an edit model
// that must see what the user circled. The stored image stays clean.
export function mergeMarkup(imageDataURL, markupDataURL, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const base = new Image();
    base.onload = () => {
      const c = document.createElement('canvas');
      c.width = base.naturalWidth;
      c.height = base.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(base, 0, 0);
      const over = new Image();
      over.onload = () => {
        ctx.drawImage(over, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      over.onerror = () => resolve(imageDataURL);
      over.src = markupDataURL;
    };
    base.onerror = () => reject(new Error('The image could not be read.'));
    base.src = imageDataURL;
  });
}
