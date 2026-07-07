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
