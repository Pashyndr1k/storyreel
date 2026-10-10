// Agent tools for story assets and environment references: list the cards,
// create / edit / delete them, render a reference image from the description,
// have the model find the assets of the script, and attach assets to the
// shots that name them. The review (api.js) returns the cards' images as
// "REFERENCE — asset" and the locations' as "REFERENCE — location" so the
// agent can compare the rendered object / place with its card.
import { storyAssetsOf, storyAssetLibId, assetUsage, assetNameIssue, findAssetsPrompt, assetImagePrompt, syncShotAssets, MAX_STORY_ASSETS, MAX_ASSET_PHOTOS } from '../storyAssets.js';
import { generateJSON, textKeyError } from '../claude.js';
import { generateImage } from '../gemini.js';
import { resizeDataURL } from '../images.js';
import { uid } from '../storage.js';
import { resolveStyleText } from '../styles.js';

export function assetsView(project) {
  const usage = assetUsage(project);
  return storyAssetsOf(project).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type || 'prop',
    description: a.description || '',
    referenceImages: (a.photos || []).length,
    nameIssue: assetNameIssue(project, a),
    usedInShots: usage[a.id] || [],
  }));
}

export function assetTools(ctx) {
  const { app, projectOf, patchProject, sceneOf, fail, settle, countAttempt, schema, PROJECT } = ctx;
  const setAssets = (projectId, fn) => patchProject(projectId, (p) => ({ storyline: { ...(p.storyline || { synopsis: '', characters: [], groups: [] }), assets: fn(storyAssetsOf(p)) } }));
  const assetOf = (p, id) => storyAssetsOf(p).find((a) => a.id === id || (a.name || '').toLowerCase() === String(id || '').toLowerCase()) || fail('NOT_FOUND', `No asset "${id}". Assets: ${storyAssetsOf(p).map((a) => a.name).join(', ') || 'none'}.`);
  return [
    {
      name: 'storyreel_assets',
      description: 'The story\'s asset cards (Stage 2 → Assets): the objects characters interact with across shots — unique English name, type, description in the story\'s world, number of reference images, name problems, and the shots whose text names each asset. Also the scenes\' locations (environment references) with their photo counts.',
      inputSchema: schema({ ...PROJECT }, ['projectId']),
      run: async ({ projectId }) => {
        const p = projectOf(projectId);
        return {
          assets: assetsView(p),
          environments: (p.outline || []).map((s) => ({ sceneId: s.id, scene: s.title, locations: (s.locations || []).map((l) => ({ id: l.id, name: l.name, referencePhotos: (l.photos || []).length })) })),
          note: 'Assets reach the image prompts by their exact English names (the scripts are made to use them verbatim) and by their reference image once they have one; storyreel_sync_assets attaches them to the shots that name them.',
        };
      },
    },
    {
      name: 'storyreel_set_asset',
      description: 'Create (no assetId), edit (assetId or name) or delete (delete: true) an asset card. The name must be a unique English label of 2–3 words no model can confuse (e.g. "Halvard Signet Ring", not "key"); the description is the object\'s exact look in the story\'s world, written for an image model. Free — no attempt.',
      inputSchema: schema({ ...PROJECT, assetId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, type: { type: 'string', enum: ['prop', 'wardrobe', 'logo', 'ui', 'other'] }, delete: { type: 'boolean' } }, ['projectId']),
      run: async ({ projectId, assetId, name, description, type, delete: del }) => {
        const p = projectOf(projectId);
        if (assetId && del) {
          const a = assetOf(p, assetId);
          setAssets(projectId, (list) => list.filter((x) => x.id !== a.id));
          await settle();
          return { deleted: a.id };
        }
        if (!assetId) {
          if (!(name || '').trim()) fail('BAD_INPUT', 'A new asset needs a name.');
          if (storyAssetsOf(p).length >= MAX_STORY_ASSETS) fail('BAD_INPUT', `At most ${MAX_STORY_ASSETS} assets.`);
          const a = { id: uid(), name: name.trim(), description: (description || '').trim(), type: type || 'prop', photos: [] };
          const issue = assetNameIssue({ ...p, storyline: { ...p.storyline, assets: [...storyAssetsOf(p), a] } }, a);
          if (issue && issue !== 'generic') fail('BAD_INPUT', `Name problem: ${issue} (unique, Latin letters, specific).`);
          setAssets(projectId, (list) => [...list, a]);
          await settle();
          return { assetId: a.id, nameIssue: issue };
        }
        const a = assetOf(p, assetId);
        const patch = {};
        if (typeof name === 'string') patch.name = name.trim();
        if (typeof description === 'string') patch.description = description.trim();
        if (type) patch.type = type;
        setAssets(projectId, (list) => list.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
        await settle();
        return { updated: Object.keys(patch), nameIssue: assetNameIssue(projectOf(projectId), { ...a, ...patch }) };
      },
    },
    {
      name: 'storyreel_asset_image',
      description: 'Render the reference image of an asset from its description in the story\'s world (the project\'s image style applies) and add it to the card (up to 3). Counts as an attempt (asset:<id>:image). Afterwards storyreel_review_shot shows the card\'s image as "REFERENCE — asset" for every shot that uses it.',
      inputSchema: schema({ ...PROJECT, assetId: { type: 'string' }, replace: { type: 'boolean', description: 'Replace the card\'s images instead of adding.' } }, ['projectId', 'assetId']),
      run: async ({ projectId, assetId, replace }) => {
        const a0 = app();
        if (!a0.settings.geminiKey) fail('NO_KEY', 'The Gemini API key (image generation) is not set in StoryReel Settings.');
        const p = projectOf(projectId);
        const a = assetOf(p, assetId);
        if (!(a.description || '').trim()) fail('NOT_READY', 'The asset has no description yet — set one first (storyreel_set_asset).');
        const attempt = countAttempt(projectId, { sceneId: a.id, kind: 'asset_image' }, `The reference image of asset "${a.name}"`);
        const style = resolveStyleText(a0.styles, 'image', p.imageStyleId) || '';
        const raw = await generateImage(a0.settings, { prompt: assetImagePrompt(p, a, style), aspectRatio: '1:1', imageSize: '1K' });
        const dataURL = await resizeDataURL(raw, 1024 * 1024, 0.9);
        setAssets(projectId, (list) => list.map((x) => (x.id === a.id ? { ...x, photos: replace ? [dataURL] : [...(x.photos || []), dataURL].slice(0, MAX_ASSET_PHOTOS), libId: x.libId || storyAssetLibId(p, x) } : x)));
        await settle();
        return { attempt, assetId: a.id, referenceImages: (projectOf(projectId).storyline.assets.find((x) => x.id === a.id)?.photos || []).length, next: 'storyreel_sync_assets, then recreate the frames of the shots that use it.' };
      },
    },
    {
      name: 'storyreel_find_assets',
      description: 'Have the text model list the story\'s key assets from the synopsis, scenes and shots — recurring objects the characters act with — each with a unique English name and a description in the story\'s world. New names are added as cards (existing ones are kept). Counts as an attempt.',
      inputSchema: schema({ ...PROJECT }, ['projectId']),
      run: async ({ projectId }) => {
        const a0 = app();
        if (textKeyError(a0.settings)) fail('NO_KEY', 'The text model is not available in StoryReel Settings.');
        const p = projectOf(projectId);
        const attempt = countAttempt(projectId, { stage: 'find_assets' }, 'Finding the assets');
        const data = await generateJSON(a0.settings, findAssetsPrompt(p, a0.lang));
        const have = new Set(storyAssetsOf(p).map((x) => (x.name || '').trim().toLowerCase()));
        const fresh = (Array.isArray(data?.assets) ? data.assets : [])
          .map((x) => ({ id: uid(), name: String(x.name || '').trim(), description: String(x.description || '').trim(), type: ['prop', 'wardrobe', 'logo', 'ui', 'other'].includes(x.type) ? x.type : 'prop', photos: [], mentions: Array.isArray(x.mentions) ? x.mentions.map(String).slice(0, 6) : [] }))
          .filter((x) => x.name && !have.has(x.name.toLowerCase()));
        if (fresh.length) setAssets(projectId, (list) => [...list, ...fresh].slice(0, MAX_STORY_ASSETS));
        await settle();
        return { attempt, added: fresh.map((x) => ({ id: x.id, name: x.name, description: x.description })), next: fresh.length ? 'Give each a reference image (storyreel_asset_image) and run storyreel_sync_assets.' : 'Nothing new.' };
      },
    },
    {
      name: 'storyreel_sync_assets',
      description: 'Attach every asset to the shots whose text names it (by its exact name; nothing the user attached is removed). Run after Stage 4 and after adding assets. Free.',
      inputSchema: schema({ ...PROJECT }, ['projectId']),
      run: async ({ projectId }) => {
        const p = projectOf(projectId);
        const { patch, attached } = syncShotAssets(p);
        if (Object.keys(patch).length) patchProject(projectId, patch);
        await settle();
        return { attached, note: attached.length ? '' : 'No new attachments — the shots already carry their assets, or no shot names one.' };
      },
    },
  ];
}
