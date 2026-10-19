// Agent tools for the edits a person makes by hand anywhere in the app:
// projects (pin, archive, duplicate, delete), the Stage 1 plot options, the
// storyline text, character cards and their portraits, actor groups, scenes
// and shots (add, delete, move), scene locations, the style library and the
// app's non-secret preferences. Every tool writes through the same state the
// UI writes, so undo, saving and the disk mirror follow as usual.
import { uid } from '../storage.js';
import { ORIGINALITY_KEYS, normalizeOriginality } from '../originality.js';
import { RANDOMIZATION_METHODS, MAX_METHODS, sanitizeMethods } from '../randomization.js';
import { STYLE_CATEGORIES, newStyle, resolveStyleText } from '../styles.js';
import { SHOT_MAPS } from '../split.js';
import { generateImage } from '../gemini.js';
import { resizeDataURL } from '../images.js';
import { locationsOf } from '../sceneLocations.js';

const MAX_PHOTOS = 3;
const isImageDataURL = (v) => typeof v === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(v);

// non-secret preferences the agent may change, with their allowed values
// (null = any non-empty string). API keys are never readable or writable.
const SETTINGS = {
  lang: ['en', 'ru', 'uk'],
  theme: ['dark', 'light'],
  textService: ['claude', 'gemini', 'claude-cli'],
  model: null,
  imageService: ['gemini', 'comfy', 'krea'],
  geminiModel: null,
  videoEngine: ['ltx', 'minimax', 'kling', 'krea'],
  hideStaleToast: [true, false],
};

export function editTools(ctx) {
  const { app, projectOf, patchProject, sceneOf, findShot, fail, settle, countAttempt, schema, PROJECT } = ctx;
  const str = (description) => ({ type: 'string', description });

  const storylineOf = (p) => p.storyline || { synopsis: '', characters: [], groups: [] };
  const charOf = (p, key) => {
    const list = storylineOf(p).characters || [];
    const k = String(key || '').trim().toLowerCase();
    return list.find((c) => c.id === key || (c.name || '').trim().toLowerCase() === k) || fail('NOT_FOUND', `No character "${key}". Characters: ${list.map((c) => c.name).join(', ') || 'none'}.`);
  };
  const setStoryline = (projectId, fn) => patchProject(projectId, (p) => ({ storyline: fn(storylineOf(p)) }));

  // everything keyed by the given shots goes with them (media, prompts, comic screens)
  const dropShotData = (p, shotIds) => {
    const ids = new Set(shotIds);
    const out = {};
    for (const key of SHOT_MAPS) {
      if (!p[key] || typeof p[key] !== 'object') continue;
      out[key] = Object.fromEntries(Object.entries(p[key]).filter(([k]) => !ids.has(k)));
    }
    const screens = p.novel?.screens || {};
    const goneScreens = Object.entries(screens).filter(([k]) => ids.has(k));
    if (goneScreens.length) {
      const goneImages = new Set(goneScreens.flatMap(([, s]) => (s.panels || []).map((x) => x.id)));
      out.novel = { ...(p.novel || {}), screens: Object.fromEntries(Object.entries(screens).filter(([k]) => !ids.has(k))) };
      out.panelImages = Object.fromEntries(Object.entries(p.panelImages || {}).filter(([k]) => !goneImages.has(k)));
    }
    return out;
  };

  return [
    // ------------------------------------------------------------ projects
    {
      name: 'storyreel_manage_project',
      description: 'Project housekeeping, as on the home screen: "pin" / "unpin" (sort to the top), "archive" / "unarchive", "duplicate" (a full copy with all media, titled "<title> (copy)"; returns the new id) or "delete". delete removes the project and all its media for good — only when the user asked for it, and confirmTitle must repeat the project\'s exact title.',
      inputSchema: schema({ ...PROJECT, action: { type: 'string', enum: ['pin', 'unpin', 'archive', 'unarchive', 'duplicate', 'delete'] }, confirmTitle: str('delete only: the project\'s exact title.') }, ['projectId', 'action']),
      run: async ({ projectId, action, confirmTitle }) => {
        const p = projectOf(projectId);
        if (action === 'pin' || action === 'unpin') app().updateProject(projectId, { pinned: action === 'pin' }, { touch: false });
        else if (action === 'archive' || action === 'unarchive') app().updateProject(projectId, { archived: action === 'archive' }, { touch: false });
        else if (action === 'duplicate') {
          // callAgent loaded this project's media first
          const copy = structuredClone(projectOf(projectId));
          copy.id = uid();
          copy.createdAt = Date.now();
          copy.updatedAt = Date.now();
          copy.archived = false;
          copy.pinned = false;
          copy.title = `${p.title} (copy)`;
          copy.agentFlags = [];
          copy.agentAttempts = {};
          app().addProjects([copy]);
          await settle();
          return { duplicated: true, newProjectId: copy.id, title: copy.title };
        } else if (action === 'delete') {
          if ((confirmTitle || '') !== p.title) fail('CONFIRM', `To delete, pass confirmTitle exactly: "${p.title}". Deleting cannot be undone.`);
          app().removeProject(projectId);
          await settle();
          return { deleted: true };
        }
        await settle();
        return { done: action };
      },
    },

    // -------------------------------------------------------------- stage 1
    {
      name: 'storyreel_set_plot_options',
      description: `Stage 1 options that shape the next plot generation (storyreel_run_stage 1). originality: switches for the unconventional-plot tools (${ORIGINALITY_KEYS.join(', ')}) — sampling: verbalized sampling of the idea space; subversion: a subversion pass at Stage 2; writing: writing rules for scenes and shots; dice: story-dice words pinned to the timeline; structure: a structure die (one dramatic situation or narrative form for one act); interview: a story interview whose answers become facts. randomization: up to ${MAX_METHODS} plot randomization methods in order (${RANDOMIZATION_METHODS.join(', ')}); [] for none. Free.`,
      inputSchema: schema(
        {
          ...PROJECT,
          originality: { type: 'object', properties: Object.fromEntries(ORIGINALITY_KEYS.map((k) => [k, { type: 'boolean' }])), additionalProperties: false },
          randomization: { type: 'array', items: { type: 'string', enum: RANDOMIZATION_METHODS }, maxItems: MAX_METHODS },
        },
        ['projectId']
      ),
      run: async ({ projectId, originality, randomization }) => {
        const p = projectOf(projectId);
        const patch = {};
        if (originality) patch.originality = normalizeOriginality({ ...(p.originality || {}), ...originality });
        if (randomization) patch.randomization = sanitizeMethods(randomization);
        patchProject(projectId, patch);
        await settle();
        const fresh = projectOf(projectId);
        return { originality: normalizeOriginality(fresh.originality), randomization: fresh.randomization || [] };
      },
    },

    // -------------------------------------------------------------- stage 2
    {
      name: 'storyreel_edit_storyline',
      description: 'Stage 2: replace the synopsis text (the story the outline and shots are written from). The plot from Stage 1 is storyreel_update_project → approvedPlot. Later stages are not rewritten; use storyreel_smart_edit for a change that must reach every scene and shot.',
      inputSchema: schema({ ...PROJECT, synopsis: { type: 'string' } }, ['projectId', 'synopsis']),
      run: async ({ projectId, synopsis }) => {
        projectOf(projectId);
        setStoryline(projectId, (s) => ({ ...s, synopsis: String(synopsis) }));
        await settle();
        return { updated: ['synopsis'] };
      },
    },
    {
      name: 'storyreel_set_character',
      description: 'Stage 2: create, edit or delete a character card. Without characterId a new card is made (name required). With characterId (id or current name): change name, role, description; addPhoto attaches a reference photo (a data:image/… URL, max 3 photos; large images are reduced), removePhotoIndex drops one. delete: true removes the card and its group memberships. Renaming a character does NOT rename it in scenes and shots — use storyreel_smart_edit ("rename X to Y") for that.',
      inputSchema: schema(
        {
          ...PROJECT,
          characterId: str('Id or current name of the character to change; omit to create one.'),
          name: { type: 'string' },
          role: { type: 'string' },
          description: str('Appearance and personality as the image and text models should know it.'),
          addPhoto: str('A reference photo as a data:image/png|jpeg|webp;base64 URL.'),
          removePhotoIndex: { type: 'integer', minimum: 0, maximum: 2 },
          delete: { type: 'boolean' },
        },
        ['projectId']
      ),
      run: async ({ projectId, characterId, name, role, description, addPhoto, removePhotoIndex, delete: del }) => {
        const p = projectOf(projectId);
        if (!characterId) {
          if (!(name || '').trim()) fail('BAD_INPUT', 'name is required for a new character.');
          const c = { id: uid(), name: name.trim(), role: role || '', description: description || '', photos: [] };
          if (addPhoto) {
            if (!isImageDataURL(addPhoto)) fail('BAD_INPUT', 'addPhoto must be a data:image/png|jpeg|webp;base64 URL.');
            c.photos = [await resizeDataURL(addPhoto, 640 * 640, 0.85)];
            c.libId = `libc_${projectId}_${c.id}`;
          }
          setStoryline(projectId, (s) => ({ ...s, characters: [...(s.characters || []), c] }));
          await settle();
          return { created: true, characterId: c.id };
        }
        const c = charOf(p, characterId);
        if (del) {
          setStoryline(projectId, (s) => ({
            ...s,
            characters: (s.characters || []).filter((x) => x.id !== c.id),
            groups: (s.groups || []).map((g) => ({ ...g, memberIds: (g.memberIds || []).filter((m) => m !== c.id) })),
          }));
          await settle();
          return { deleted: c.name };
        }
        const patch = {};
        if (typeof name === 'string' && name.trim()) patch.name = name.trim();
        if (typeof role === 'string') patch.role = role;
        if (typeof description === 'string') patch.description = description;
        let photos = [...(c.photos || [])];
        if (Number.isInteger(removePhotoIndex)) photos = photos.filter((_, i) => i !== removePhotoIndex);
        if (addPhoto) {
          if (!isImageDataURL(addPhoto)) fail('BAD_INPUT', 'addPhoto must be a data:image/png|jpeg|webp;base64 URL.');
          if (photos.length >= MAX_PHOTOS) fail('BAD_INPUT', `This character already has ${MAX_PHOTOS} photos; remove one first (removePhotoIndex).`);
          photos.push(await resizeDataURL(addPhoto, 640 * 640, 0.85));
          if (!c.libId) patch.libId = `libc_${projectId}_${c.id}`;
        }
        if (photos.length !== (c.photos || []).length || addPhoto) patch.photos = photos;
        setStoryline(projectId, (s) => ({ ...s, characters: (s.characters || []).map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));
        await settle();
        return { updated: Object.keys(patch), photos: photos.length, ...(patch.name ? { note: 'Scenes and shots still use the old name; storyreel_smart_edit renames it everywhere.' } : {}) };
      },
    },
    {
      name: 'storyreel_character_portrait',
      description: 'Stage 2: render a reference portrait of a character from its description (Gemini, in the project\'s image style) and add it to the card\'s photos (max 3). Every image of the character is then made from it — check it with storyreel_get_project / the shot reviews. Counts as an attempt.',
      inputSchema: schema({ ...PROJECT, characterId: str('Id or name of the character.') }, ['projectId', 'characterId']),
      run: async ({ projectId, characterId }) => {
        const p = projectOf(projectId);
        const c = charOf(p, characterId);
        const settings = app().settings;
        if (!settings.geminiKey) fail('NO_KEY', 'Portraits need the Gemini API key (StoryReel Settings).');
        if ((c.photos || []).length >= MAX_PHOTOS) fail('BAD_INPUT', `${c.name} already has ${MAX_PHOTOS} photos; remove one first.`);
        if (!(c.description || '').trim()) fail('NOT_READY', `${c.name} has no description to draw from.`);
        const attempt = countAttempt(projectId, { stage: `portrait:${c.id}` }, `The portrait of ${c.name}`);
        const style = resolveStyleText(app().styles, 'image', p.imageStyleId);
        const prompt = `${style?.trim() ? `Visual style: ${style.trim()}\n\n` : ''}Character reference portrait of ${c.name}${c.role ? ` (${c.role})` : ''}: ${c.description}

One single person, chest-up portrait, face fully visible and evenly lit, looking slightly off-camera, plain unobtrusive background, no text, no watermarks. Render the face, hair and distinguishing features precisely and unambiguously — this image becomes the character's visual reference for every future shot.`;
        const raw = await generateImage(settings, { prompt, aspectRatio: '1:1', imageSize: '1K' });
        const url = await resizeDataURL(raw, 640 * 640, 0.8);
        setStoryline(projectId, (s) => ({
          ...s,
          characters: (s.characters || []).map((x) => (x.id === c.id ? { ...x, photos: [...(x.photos || []), url].slice(0, MAX_PHOTOS), libId: x.libId || `libc_${projectId}_${x.id}` } : x)),
        }));
        await settle();
        return { attempt, photos: Math.min(MAX_PHOTOS, (c.photos || []).length + 1), images: [{ label: `PORTRAIT — ${c.name}`, dataURL: url }] };
      },
    },
    {
      name: 'storyreel_set_group',
      description: 'Stage 2: an actor group — several characters that act as one entity (a band, a crew, a family); naming the group in a shot stands for all its members. Without groupId a group is created; with groupId (id or name) it is changed. members: the full list of member character names. delete: true removes the group (the characters stay).',
      inputSchema: schema({ ...PROJECT, groupId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, members: { type: 'array', items: { type: 'string' } }, delete: { type: 'boolean' } }, ['projectId']),
      run: async ({ projectId, groupId, name, description, members, delete: del }) => {
        const p = projectOf(projectId);
        const groups = storylineOf(p).groups || [];
        const memberIds = members ? members.map((m) => charOf(p, m).id) : null;
        if (!groupId) {
          if (!(name || '').trim()) fail('BAD_INPUT', 'name is required for a new group.');
          const g = { id: uid(), name: name.trim(), description: description || '', memberIds: memberIds || [] };
          setStoryline(projectId, (s) => ({ ...s, groups: [...(s.groups || []), g] }));
          await settle();
          return { created: true, groupId: g.id };
        }
        const k = String(groupId).toLowerCase();
        const g = groups.find((x) => x.id === groupId || (x.name || '').toLowerCase() === k) || fail('NOT_FOUND', `No group "${groupId}". Groups: ${groups.map((x) => x.name).join(', ') || 'none'}.`);
        if (del) {
          setStoryline(projectId, (s) => ({ ...s, groups: (s.groups || []).filter((x) => x.id !== g.id) }));
          await settle();
          return { deleted: g.name };
        }
        const patch = { ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}), ...(typeof description === 'string' ? { description } : {}), ...(memberIds ? { memberIds } : {}) };
        setStoryline(projectId, (s) => ({ ...s, groups: (s.groups || []).map((x) => (x.id === g.id ? { ...x, ...patch } : x)) }));
        await settle();
        return { updated: Object.keys(patch) };
      },
    },

    // -------------------------------------------------------------- stage 3
    {
      name: 'storyreel_edit_outline',
      description: 'Stage 3: change the list of scenes. op "add" inserts a new scene after afterSceneId (or at the end): title, summary, durationSec, episode (series). op "delete" removes a scene with its shots, prompts, media and comic screens. op "move" puts a scene at toIndex (0-based). Edit a scene\'s text with storyreel_edit_script; write its shots with storyreel_run_stage 4.',
      inputSchema: schema(
        {
          ...PROJECT,
          op: { type: 'string', enum: ['add', 'delete', 'move'] },
          sceneId: str('delete / move: the scene.'),
          afterSceneId: str('add: insert after this scene; omit to append.'),
          toIndex: { type: 'integer', minimum: 0, description: 'move: the new 0-based position.' },
          title: { type: 'string' },
          summary: { type: 'string' },
          durationSec: { type: 'number', minimum: 2 },
          episode: { type: 'integer', minimum: 1 },
        },
        ['projectId', 'op']
      ),
      run: async ({ projectId, op, sceneId, afterSceneId, toIndex, title, summary, durationSec, episode }) => {
        const p = projectOf(projectId);
        if (op === 'add') {
          if (!(title || '').trim()) fail('BAD_INPUT', 'title is required.');
          if (afterSceneId) sceneOf(p, afterSceneId);
          const scene = { id: uid(), title: title.trim(), summary: summary || '', duration: Math.max(2, Math.round(Number(durationSec) || 20)), ...(episode ? { episode } : {}) };
          patchProject(projectId, (q) => {
            const i = afterSceneId ? q.outline.findIndex((s) => s.id === afterSceneId) : q.outline.length - 1;
            const outline = [...q.outline.slice(0, i + 1), scene, ...q.outline.slice(i + 1)];
            return { outline, sceneDetails: { ...q.sceneDetails, [scene.id]: { shots: [] } } };
          });
          await settle();
          return { added: true, sceneId: scene.id, number: projectOf(projectId).outline.findIndex((s) => s.id === scene.id) + 1 };
        }
        const scene = sceneOf(p, sceneId || fail('BAD_INPUT', 'sceneId is required.'));
        if (op === 'delete') {
          const shotIds = (p.sceneDetails?.[scene.id]?.shots || []).map((s) => s.id);
          patchProject(projectId, (q) => {
            const { [scene.id]: _gone, ...details } = q.sceneDetails || {};
            const { [scene.id]: _layout, ...layouts } = q.sceneLayouts || {};
            return { outline: q.outline.filter((s) => s.id !== scene.id), sceneDetails: details, sceneLayouts: layouts, ...dropShotData(q, shotIds) };
          });
          await settle();
          return { deleted: scene.title, shotsRemoved: shotIds.length };
        }
        if (!Number.isInteger(toIndex)) fail('BAD_INPUT', 'toIndex is required for move.');
        patchProject(projectId, (q) => {
          const rest = q.outline.filter((s) => s.id !== scene.id);
          const at = Math.max(0, Math.min(rest.length, toIndex));
          return { outline: [...rest.slice(0, at), q.outline.find((s) => s.id === scene.id), ...rest.slice(at)] };
        });
        await settle();
        return { moved: scene.title, number: projectOf(projectId).outline.findIndex((s) => s.id === scene.id) + 1 };
      },
    },
    {
      name: 'storyreel_set_location',
      description: 'Stage 3: a scene\'s locations (the places shots can use; their photos are the environment references). Without locationId a location is added (name required); with locationId (id or name) it is renamed, or removed with delete: true. addPhoto attaches a reference photo (data:image URL); storyreel_location_image renders one instead.',
      inputSchema: schema({ ...PROJECT, sceneId: { type: 'string' }, locationId: { type: 'string' }, name: { type: 'string' }, addPhoto: str('data:image/png|jpeg|webp;base64 URL.'), removePhotoIndex: { type: 'integer', minimum: 0 }, delete: { type: 'boolean' } }, ['projectId', 'sceneId']),
      run: async ({ projectId, sceneId, locationId, name, addPhoto, removePhotoIndex, delete: del }) => {
        const p = projectOf(projectId);
        const scene = sceneOf(p, sceneId);
        const locs = locationsOf(scene);
        const setLocs = (fn) => patchProject(projectId, (q) => ({ outline: q.outline.map((s) => (s.id === scene.id ? { ...s, locations: fn(locationsOf(s)) } : s)) }));
        const photo = addPhoto ? (isImageDataURL(addPhoto) ? await resizeDataURL(addPhoto, 1280 * 1280, 0.85) : fail('BAD_INPUT', 'addPhoto must be a data:image URL.')) : null;
        if (!locationId) {
          if (!(name || '').trim()) fail('BAD_INPUT', 'name is required for a new location.');
          const l = { id: uid(), name: name.trim(), photos: photo ? [photo] : [], libId: '' };
          setLocs((ls) => [...ls, l]);
          await settle();
          return { added: true, locationId: l.id };
        }
        const k = String(locationId).toLowerCase();
        const l = locs.find((x) => x.id === locationId || (x.name || '').toLowerCase() === k) || fail('NOT_FOUND', `No location "${locationId}" in this scene. Locations: ${locs.map((x) => x.name).join(', ') || 'none'}.`);
        if (del) {
          setLocs((ls) => ls.filter((x) => x.id !== l.id));
          await settle();
          return { deleted: l.name };
        }
        setLocs((ls) =>
          ls.map((x) => {
            if (x.id !== l.id) return x;
            let photos = [...(x.photos || [])];
            if (Number.isInteger(removePhotoIndex)) photos = photos.filter((_, i) => i !== removePhotoIndex);
            if (photo) photos.push(photo);
            return { ...x, ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}), photos };
          })
        );
        await settle();
        return { updated: true };
      },
    },

    // -------------------------------------------------------------- stage 4
    {
      name: 'storyreel_edit_shots',
      description: 'Stage 4: change the list of shots of a scene. op "add" inserts a new shot after afterShotId (or at the end of sceneId) with durationSec, shotType, location, action, dialogue ("NAME: line"), notes. op "delete" removes a shot with its prompts, media and comic screen. op "move" puts a shot at toIndex (0-based) inside its scene. Edit an existing shot\'s text with storyreel_edit_script; copy one with storyreel_duplicate_shot.',
      inputSchema: schema(
        {
          ...PROJECT,
          op: { type: 'string', enum: ['add', 'delete', 'move'] },
          sceneId: str('add: the scene (when afterShotId is not given).'),
          shotId: str('delete / move: the shot.'),
          afterShotId: str('add: insert after this shot.'),
          toIndex: { type: 'integer', minimum: 0 },
          durationSec: { type: 'number', minimum: 2, maximum: 10 },
          shotType: { type: 'string' },
          location: { type: 'string' },
          action: { type: 'string' },
          dialogue: { type: 'string' },
          notes: { type: 'string' },
        },
        ['projectId', 'op']
      ),
      run: async ({ projectId, op, sceneId, shotId, afterShotId, toIndex, durationSec, ...f }) => {
        const p = projectOf(projectId);
        if (op === 'add') {
          const at = afterShotId ? findShot(p, afterShotId) : null;
          const scene = at ? at.scene : sceneOf(p, sceneId || fail('BAD_INPUT', 'Give sceneId or afterShotId.'));
          if (!(f.action || '').trim()) fail('BAD_INPUT', 'action is required.');
          const shot = { id: uid(), duration: Math.max(2, Math.min(10, Math.ceil((Number(durationSec) || 4) * 2) / 2)), shotType: f.shotType || '', location: f.location || '', action: f.action, dialogue: f.dialogue || '', notes: f.notes || '' };
          patchProject(projectId, (q) => {
            const list = q.sceneDetails?.[scene.id]?.shots || [];
            const i = at ? list.findIndex((s) => s.id === afterShotId) : list.length - 1;
            return { sceneDetails: { ...q.sceneDetails, [scene.id]: { ...(q.sceneDetails?.[scene.id] || {}), shots: [...list.slice(0, i + 1), shot, ...list.slice(i + 1)] } } };
          });
          await settle();
          return { added: true, shotId: shot.id, sceneId: scene.id };
        }
        const { scene, shot } = findShot(p, shotId || fail('BAD_INPUT', 'shotId is required.'));
        if (op === 'delete') {
          patchProject(projectId, (q) => ({
            sceneDetails: { ...q.sceneDetails, [scene.id]: { ...q.sceneDetails[scene.id], shots: q.sceneDetails[scene.id].shots.filter((s) => s.id !== shot.id) } },
            ...dropShotData(q, [shot.id]),
          }));
          await settle();
          return { deleted: shot.id };
        }
        if (!Number.isInteger(toIndex)) fail('BAD_INPUT', 'toIndex is required for move.');
        patchProject(projectId, (q) => {
          const list = q.sceneDetails[scene.id].shots;
          const rest = list.filter((s) => s.id !== shot.id);
          const at = Math.max(0, Math.min(rest.length, toIndex));
          return { sceneDetails: { ...q.sceneDetails, [scene.id]: { ...q.sceneDetails[scene.id], shots: [...rest.slice(0, at), shot, ...rest.slice(at)] } } };
        });
        await settle();
        return { moved: shot.id, number: (projectOf(projectId).sceneDetails[scene.id].shots.findIndex((s) => s.id === shot.id)) + 1 };
      },
    },

    // -------------------------------------------------------------- styles
    {
      name: 'storyreel_set_style',
      description: `The style library (Styles page): create a style (no styleId: category, name, instructions), edit one (styleId: name, instructions, plus — image styles only: applied strictly and literally) or delete one (delete: true). Built-in styles cannot be changed or deleted — create a copy instead. Categories: ${STYLE_CATEGORIES.join(', ')}. Assign a style to a project with storyreel_update_project.`,
      inputSchema: schema({ category: { type: 'string', enum: STYLE_CATEGORIES }, styleId: { type: 'string' }, name: { type: 'string' }, instructions: { type: 'string' }, plus: { type: 'boolean' }, delete: { type: 'boolean' } }, ['category']),
      run: async ({ category, styleId, name, instructions, plus, delete: del }) => {
        const styles = app().styles;
        const list = styles[category] || [];
        if (!styleId) {
          if (!(name || '').trim() || !(instructions || '').trim()) fail('BAD_INPUT', 'name and instructions are required for a new style.');
          const s = { ...newStyle(), name: name.trim(), instructions: instructions.trim(), ...(category === 'image' && plus ? { plus: true } : {}) };
          app().setStyles((cur) => ({ ...cur, [category]: [...(cur[category] || []), s] }));
          await settle();
          return { created: true, styleId: s.id };
        }
        const s = list.find((x) => x.id === styleId) || fail('NOT_FOUND', `No ${category} style "${styleId}".`);
        if (s.builtin) fail('BAD_INPUT', `"${s.name}" is built in and cannot be changed; create a new style from its text instead.`);
        if (del) {
          app().setStyles((cur) => ({ ...cur, [category]: (cur[category] || []).filter((x) => x.id !== styleId) }));
          await settle();
          return { deleted: s.name, note: 'Projects that used it now have no style in that category.' };
        }
        const patch = { ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}), ...(typeof instructions === 'string' && instructions.trim() ? { instructions: instructions.trim() } : {}), ...(category === 'image' && typeof plus === 'boolean' ? { plus } : {}) };
        app().setStyles((cur) => ({ ...cur, [category]: (cur[category] || []).map((x) => (x.id === styleId ? { ...x, ...patch } : x)) }));
        await settle();
        return { updated: Object.keys(patch) };
      },
    },

    // ------------------------------------------------------------ settings
    {
      name: 'storyreel_app_settings',
      description: `The app's preferences that are not secrets: ${Object.keys(SETTINGS).join(', ')}. Without set it returns the current values; with set it changes them (lang: en / ru / uk drives the UI and the language new text is written in; textService / imageService / videoEngine pick the generation services — changing them changes what generation costs, so only when the user asked). API keys can never be read or changed here.`,
      inputSchema: schema({ set: { type: 'object', properties: Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v && typeof v[0] === 'boolean' ? { type: 'boolean' } : v ? { type: 'string', enum: v } : { type: 'string' }])), additionalProperties: false } }),
      run: async ({ set }) => {
        if (set && Object.keys(set).length) {
          for (const [k, v] of Object.entries(set)) {
            if (!(k in SETTINGS)) fail('BAD_INPUT', `${k} cannot be changed by the agent.`);
            if (SETTINGS[k] && !SETTINGS[k].includes(v)) fail('BAD_INPUT', `${k} must be one of ${SETTINGS[k].join(', ')}.`);
            if (!SETTINGS[k] && !(typeof v === 'string' && v.trim())) fail('BAD_INPUT', `${k} must be a non-empty string.`);
          }
          app().patchSettings(set);
          await settle();
        }
        const s = app().settings;
        return Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, s[k] ?? null]));
      },
    },
  ];
}
