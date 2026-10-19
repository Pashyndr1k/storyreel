// Drawing a comic screen to a canvas (the exported PNG) from the same
// geometry the SVG preview uses, and exporting the whole feed: in the desktop
// app the PNGs go to <projects folder>/<project>/comic/, in a browser they
// download as one ZIP.
import {
  SCREEN_W, SCREEN_H, STROKE, COMIC_FONT_FAMILY, DIALOGUE_SIZE, CAPTION_SIZE, CAPTION_LINE,
  screenPanels, placeBubbles, bubblePath, bubbleLineY, captionLines,
} from './layout.js';
import { visiblePanels, feedOf } from './model.js';
import { buildZip, sanitizeFolder, DEFAULT_PROJECTS_DIR } from '../projectFiles.js';

export const CAPTION_BG = '#fff6dc';
export const PAPER = '#ffffff';
export const INK = '#111111';
export const EMPTY_PANEL = '#e7e4dc';

const loadImg = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });

// the comic font is a system font: make sure it is ready before measuring
export async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`${DIALOGUE_SIZE}px ${COMIC_FONT_FAMILY}`), document.fonts.load(`${CAPTION_SIZE}px ${COMIC_FONT_FAMILY}`)]);
  } catch {
    /* the fallback font is measured and drawn alike */
  }
}

export async function renderScreen(screen, images) {
  await fontsReady();
  const c = document.createElement('canvas');
  c.width = SCREEN_W;
  c.height = SCREEN_H;
  const g = c.getContext('2d');
  g.fillStyle = PAPER;
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const boxes = screenPanels(screen.layout);
  const panels = visiblePanels(screen);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const p = panels[i];
    const im = await loadImg(images?.[p.id]);
    g.save();
    g.beginPath();
    g.rect(b.x, b.y, b.w, b.h);
    g.clip();
    if (im) {
      // cover: fill the box, crop the overflow evenly
      const s = Math.max(b.w / im.width, b.h / im.height);
      const w = im.width * s;
      const h = im.height * s;
      g.drawImage(im, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
    } else {
      g.fillStyle = EMPTY_PANEL;
      g.fillRect(b.x, b.y, b.w, b.h);
    }
    // balloons belong to the panel: clipped to it
    for (const bb of placeBubbles(b, p.bubbles)) {
      const path = new Path2D(bubblePath(bb));
      g.fillStyle = PAPER;
      g.fill(path);
      g.lineWidth = STROKE - 1;
      g.strokeStyle = INK;
      g.lineJoin = 'round';
      g.stroke(path);
      g.fillStyle = INK;
      g.font = `${DIALOGUE_SIZE}px ${COMIC_FONT_FAMILY}`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      bb.lines.forEach((line, k) => g.fillText(line, bb.x + bb.w / 2, bubbleLineY(bb, k)));
    }
    g.restore();
    // the caption line under the panel
    const cap = b.cap;
    g.fillStyle = CAPTION_BG;
    g.fillRect(cap.x, cap.y, cap.w, cap.h);
    const { lines } = captionLines(p.caption, cap.w);
    g.fillStyle = INK;
    g.font = `${CAPTION_SIZE}px ${COMIC_FONT_FAMILY}`;
    g.textAlign = 'left';
    const top = cap.y + (cap.h - lines.length * CAPTION_LINE) / 2 + CAPTION_SIZE * 0.85;
    lines.forEach((line, k) => g.fillText(line, cap.x + 16, top + k * CAPTION_LINE));
    // one border around image + caption
    g.lineWidth = STROKE;
    g.strokeStyle = INK;
    g.strokeRect(b.x, b.y, b.w, b.h + cap.h);
    g.beginPath();
    g.moveTo(cap.x, cap.y);
    g.lineTo(cap.x + cap.w, cap.y);
    g.lineWidth = STROKE - 2;
    g.stroke();
  }
  return c;
}

const canvasBytes = (c) =>
  new Promise((resolve, reject) =>
    c.toBlob((blob) => (blob ? blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab))) : reject(new Error('PNG encoding failed'))), 'image/png')
  );
const bytesToBase64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export const screenFileName = (item, n) => `${String(n).padStart(3, '0')}_scene${item.sceneIndex + 1}_shot${item.shotIndex + 1}.png`;

// → { count, dir } (desktop) or { count, zip: true } (browser)
export async function exportComicFeed(project, settings, images, onProgress) {
  const feed = feedOf(project);
  if (!feed.length) throw new Error('No screens to export.');
  const lf = typeof window !== 'undefined' ? window.localFiles : null;
  let dir = null;
  if (lf?.saveOutput) {
    const root = (settings.projectsDir || DEFAULT_PROJECTS_DIR).replace(/[\\/]+$/, '');
    const folder = sanitizeFolder(project.title, project.id);
    dir = `${root}\\${folder}`;
    if (lf.resolveProjectDir) {
      const res = await lf.resolveProjectDir(root, project.id, folder);
      if (res?.ok && res.dir) dir = res.dir;
    }
    dir = `${dir}\\comic`;
  }
  const entries = [];
  for (let i = 0; i < feed.length; i++) {
    onProgress?.(i, feed.length);
    const bytes = await canvasBytes(await renderScreen(feed[i].screen, images));
    const name = screenFileName(feed[i], i + 1);
    if (dir) {
      const res = await lf.saveOutput(dir, name, bytesToBase64(bytes));
      if (res && res.ok === false) throw new Error(res.error || `Could not write ${name}.`);
    } else entries.push({ name, bytes });
  }
  onProgress?.(feed.length, feed.length);
  if (dir) return { count: feed.length, dir };
  const zip = buildZip(entries);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  a.download = `${sanitizeFolder(project.title, project.id)}_comic.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  return { count: feed.length, zip: true };
}
