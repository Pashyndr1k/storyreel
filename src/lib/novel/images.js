// Panel images: the prompt for ONE comic panel (style, the panel's own
// composition, reference photos of the people and place, no lettering), and
// the image service the app is set to (Gemini, ComfyUI or Krea).
import { generateImage } from '../gemini.js';
import { generateComfyImage, saveToLocalOutputs } from '../comfy.js';
import { generateKreaImage } from '../krea.js';
import { shotCastRefs } from '../castRefs.js';
import { shotLocationRefs } from '../sceneLocations.js';
import { DEFAULT_NOVEL_STYLE, NO_LETTERING_RULE } from './rules.js';
import { panelRatio } from './plan.js';

// panels come in ratios the project aspect helper does not know
const ratioWords = (r) => {
  const [w, h] = String(r).split(':').map(Number);
  return w === h ? 'square' : w > h ? 'landscape' : 'portrait (vertical)';
};

const FULL_FRAME =
  'The scene fills the ENTIRE image edge to edge: no black bars, borders, frames, margins or blank areas at any edge.';

export const imageServiceOf = (settings) => (settings.imageService === 'comfy' ? 'comfy' : settings.imageService === 'krea' ? 'krea' : 'gemini');
export const imageKeyError = (settings) => {
  const svc = imageServiceOf(settings);
  if (svc === 'krea') return (settings.kreaKey || '').trim() ? null : 'NO_KREA_KEY';
  if (svc === 'gemini') return settings.geminiKey ? null : 'NO_GEMINI_KEY';
  return null;
};

// → { prompt, images, ratio }
export function panelImageRequest({ project, scene, shot, screen, index, imageStyle, imageStylePlus, settings }) {
  const panel = screen.panels[index];
  const ratio = panelRatio(screen.layout, index);
  // the panel names its people: their photos are the references
  const pseudo = { action: `${(panel.characters || []).join(', ')}. ${panel.prompt}`, dialogue: (panel.bubbles || []).map((b) => `${b.speaker}: ${b.text}`).join('\n'), notes: '' };
  let budget = imageServiceOf(settings) === 'comfy' ? 2 : Number.POSITIVE_INFINITY;
  const take = (arr) => {
    const out = arr.slice(0, Math.max(0, budget));
    budget -= out.length;
    return out;
  };
  const cast = take(shotCastRefs(project, pseudo));
  const locGroups = shotLocationRefs(project, scene, shot.id);
  const locs = take(locGroups.flatMap((g) => g.photos));
  const images = [...cast.map((c) => c.photo), ...locs];

  const style = (imageStyle || '').trim();
  let text = style
    ? imageStylePlus
      ? `Visual style (STRICT, apply literally; every "Avoid" item is prohibited): ${style}\n\n`
      : `Visual style: ${style}\n\n`
    : `Visual style: ${DEFAULT_NOVEL_STYLE}\n\n`;
  text += `Comic panel${panel.framing ? ` — ${panel.framing}` : ''}.\n${panel.prompt.trim()}`;
  if ((panel.bubbles || []).some((b) => b.text.trim()))
    text += '\n\nKeep the UPPER THIRD of the image calm and uncluttered (sky, wall, ceiling or soft background) — speech balloons will be lettered there later. Faces and key action sit below it.';
  if (images.length) {
    text += `\n\n${images.length} reference image(s) are attached.`;
    if (cast.length)
      text += ` Character reference photos — ${cast.map((c, k) => `image ${k + 1} is ${c.name}`).join(', ')}. Draw each person recognisably from their own photo (face, hair, build), translated into the panel's drawing style, and keep them distinct.`;
    if (locs.length)
      text += ` Images ${cast.length + 1}–${cast.length + locs.length} show the place: use its architecture, materials, colours and light, composed from this panel's own camera — do not copy the photo's viewpoint.`;
  }
  text += `\n\nRender as a ${ratioWords(ratio)} image in the ${ratio} aspect ratio. ${FULL_FRAME}\n\n${NO_LETTERING_RULE}`;
  return { prompt: text, images, ratio };
}

export async function runPanelImage(settings, { prompt, images, ratio }, name) {
  const svc = imageServiceOf(settings);
  if (svc === 'krea') {
    const url = await generateKreaImage(settings, { prompt, images, aspectRatio: ratio, name });
    saveToLocalOutputs(settings, `${name}.png`, url);
    return url;
  }
  if (svc === 'comfy') {
    const res = await generateComfyImage(settings, { prompt, images, aspectRatio: ratio, name });
    saveToLocalOutputs(settings, res.filename, res.dataURL);
    return res.dataURL;
  }
  return generateImage(settings, { prompt, images, aspectRatio: ratio, imageSize: '2K' });
}
