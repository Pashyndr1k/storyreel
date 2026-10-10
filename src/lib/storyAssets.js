// Story assets: the objects characters interact with across shots (a key, a
// contract, a locket, a phone). They get cards at Stage 2 like characters —
// a unique English name, a description that fits the story's world, and a
// reference image (uploaded or generated). Each card mirrors to a library
// asset entry (useLibrarySync), and every shot whose text names the asset is
// attached to it automatically, so the image prompts receive the reference.
import { mentions } from './spatial/layout.js';

export const MAX_STORY_ASSETS = 24;
export const MAX_ASSET_PHOTOS = 3;

export const storyAssetsOf = (project) => (Array.isArray(project?.storyline?.assets) ? project.storyline.assets : []);
// the library entry a story asset mirrors to (created once it has a photo)
export const storyAssetLibId = (project, asset) => asset.libId || `liba_${project.id}_${asset.id}`;

const shotText = (s) => `${s.action || ''}\n${s.dialogue || ''}\n${s.notes || ''}`;
export const assetMentionedIn = (text, asset) => !!(asset?.name || '').trim() && mentions(text, asset.name);

// Attach every story asset to the shots whose text names it (never detaching
// what the user attached by hand). Returns the patch and what was added.
export function syncShotAssets(project) {
  const assets = storyAssetsOf(project).filter((a) => (a.name || '').trim());
  if (!assets.length) return { patch: {}, attached: [] };
  const shotAssets = { ...(project.shotAssets || {}) };
  const attached = [];
  let changed = false;
  for (const scene of project.outline || []) {
    for (const shot of project.sceneDetails?.[scene.id]?.shots || []) {
      const text = shotText(shot);
      const cur = shotAssets[shot.id] || [];
      const add = assets.filter((a) => assetMentionedIn(text, a)).map((a) => storyAssetLibId(project, a)).filter((id) => !cur.includes(id));
      if (add.length) {
        shotAssets[shot.id] = [...cur, ...add];
        attached.push({ shotId: shot.id, sceneId: scene.id, assetIds: add });
        changed = true;
      }
    }
  }
  // a card gets its libId the first time a shot is attached to it
  const needLib = assets.filter((a) => !a.libId && attached.some((x) => x.assetIds.includes(storyAssetLibId(project, a))));
  const patch = changed ? { shotAssets } : {};
  if (needLib.length) patch.storyline = { ...project.storyline, assets: storyAssetsOf(project).map((a) => (needLib.includes(a) ? { ...a, libId: storyAssetLibId(project, a) } : a)) };
  return { patch, attached };
}

// Shots that name each asset (for the cards' "used in N shots" and the agent)
export function assetUsage(project) {
  const out = {};
  for (const a of storyAssetsOf(project)) out[a.id] = [];
  for (const scene of project.outline || []) {
    for (const shot of project.sceneDetails?.[scene.id]?.shots || []) {
      const text = shotText(shot);
      for (const a of storyAssetsOf(project)) if (assetMentionedIn(text, a)) out[a.id].push(shot.id);
    }
  }
  return out;
}

// Names must be unique across characters, groups, locations and assets, in
// Latin letters, and not a bare generic word a model would read as any object.
export function assetNameIssue(project, asset) {
  const name = (asset.name || '').trim();
  if (!name) return 'empty';
  if (!/^[A-Za-z0-9][A-Za-z0-9 '’.\-]*$/.test(name)) return 'latin';
  const low = name.toLowerCase();
  const others = [
    ...(project.storyline?.characters || []).map((c) => c.name),
    ...(project.storyline?.groups || []).map((g) => g.name),
    ...(project.outline || []).flatMap((s) => (s.locations || []).map((l) => l.name)),
    ...storyAssetsOf(project).filter((a) => a.id !== asset.id).map((a) => a.name),
  ].map((n) => (n || '').trim().toLowerCase()).filter(Boolean);
  if (others.includes(low)) return 'duplicate';
  if (!/\s/.test(name) && name.length < 6) return 'generic';
  return null;
}

// The block the script and prompt writers get: the assets by their exact
// names and their descriptions in the story's world.
export function assetBlock(project) {
  const assets = storyAssetsOf(project).filter((a) => (a.name || '').trim());
  if (!assets.length) return '';
  return `\n\nKEY ASSETS — objects the characters handle across shots. Use these EXACT English names whenever the object appears (never a synonym, never translated), and describe each as given, since its reference image is rendered from that description:\n${assets.map((a) => `- ${a.name.trim()}: ${(a.description || '').trim() || '(no description yet)'}`).join('\n')}`;
}

// The text model proposes the assets of the story: recurring objects the
// characters act with, named uniquely for the generation models.
export function findAssetsPrompt(project, lang) {
  const world = `${(project.genres || []).join(', ')}${project.scriptType === 'series' ? ' (vertical short drama)' : ''}`;
  const scenes = (project.outline || []).map((s, i) => `${i + 1}. ${s.title}: ${s.summary}`).join('\n');
  const shots = (project.outline || [])
    .flatMap((s) => (project.sceneDetails?.[s.id]?.shots || []).map((sh) => `[${s.title}] ${sh.action}${sh.dialogue ? ` / ${sh.dialogue}` : ''}`))
    .join('\n')
    .slice(0, 12000);
  const existing = storyAssetsOf(project).map((a) => a.name).filter(Boolean);
  const names = [...(project.storyline?.characters || []).map((c) => c.name), ...(project.storyline?.groups || []).map((g) => g.name)].filter(Boolean);
  return {
    system: `You are a props master and production designer for AI-generated film. You read a story and list the KEY ASSETS: physical objects the characters interact with, that recur across shots or carry the plot (the contract, the ring, the knife, the phone with the photo, the locket, the car). Not scenery, not wardrobe in general, not one-off background items.

Respond with VALID JSON ONLY.

RULES
- 3 to 12 assets. Each must matter: it is handled in more than one moment, or the plot turns on it.
- "name": a UNIQUE English label of 2–3 words that a text-to-image model cannot confuse with anything else in the story or with a generic object — a specific noun plus a distinguishing word (material, owner, mark, model): "Halvard Signet Ring", "Red Leather Contract", "Cracked Nokia Phone". Never a bare generic word ("key", "letter"), never a character's name alone, never a name already used in the cast or the assets given below.
- "description": 1–3 sentences of the object's exact look in THIS story's world and period — material, colour, size, wear, distinguishing marks — written for an image model (${world || 'the story’s genre'}): the same object is a brass skeleton key in a medieval fantasy and a keycard with a cracked chip in science fiction. No story events, no emotions.
- "type": prop | wardrobe | logo | ui | other.
- "mentions": the words the script currently uses for it (any language), so the app can match them.
- Write "description" in English; "mentions" as they appear.`,
    maxTokens: 3000,
    user: `Title: ${project.title}
Genres: ${world}

Synopsis:
"""
${project.storyline?.synopsis || project.approvedPlot || project.logline || ''}
"""

Cast names (do not reuse): ${names.join(', ') || '—'}
Assets already listed (do not repeat, do not rename): ${existing.join(', ') || '—'}
${scenes ? `\nScenes:\n${scenes}` : ''}${shots ? `\n\nShots:\n${shots}` : ''}

JSON schema:
{"assets":[{"name":"Halvard Signet Ring","description":"…","type":"prop","mentions":["the ring","перстень"]}]}`,
  };
}

// The reference image of an asset, rendered from its description in the
// story's world and the project's image style.
export function assetImagePrompt(project, asset, imageStyle = '') {
  const world = `${(project.genres || []).join(', ')}`;
  const synopsis = (project.storyline?.synopsis || '').slice(0, 600).replace(/[.\s]+$/, '');
  return `Reference image of a single object for a film: "${asset.name}". ${asset.description || ''}
The story's world: ${world || 'contemporary drama'}${synopsis ? ` — ${synopsis}` : ''}. The object must look like it belongs to that world and period.
One object only, centred, filling most of the frame, on a plain neutral background, even studio lighting, sharp detail on material, colour, wear and distinguishing marks, no people, no hands, no text, no watermark. This image becomes the object's visual reference for every shot.${imageStyle ? `\n\nVisual style: ${imageStyle}` : ''}`;
}
