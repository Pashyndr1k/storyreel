// Agent tools for the assembly (Stage 5): the transitions between shots and
// the subtitle layer. Both write the project fields the timeline reads
// (project.shotTransitions, project.subtitles), so the window shows the
// result at once. The handlers get the api's helpers through `ctx`.
import { boundariesOf, TRANSITION_TYPES, ABRUPT, SMOOTH } from '../transitions.js';
import { subtitlesOf, autoSubtitles, normalizeSubItem, normalizeSubStyle, normalizeOverride, SUB_FONTS, SUB_POSITIONS, MAX_SUB_ITEMS, shotStarts } from '../subtitles.js';
import { blockForScene, defaultTrim } from '../dynamics.js';
import { kreaNativeAudio } from '../krea.js';
import { uid } from '../storage.js';

const r2 = (v) => Math.round(v * 100) / 100;

// seconds of tail the clip can give to a fade (a styled transition needs it;
// without slack the render falls back to a hard cut)
function tailSlack(project, shotId, duration) {
  const t = (project.shotTrims || {})[shotId];
  if (t && Number.isFinite(Number(t.tail))) return Number(t.tail);
  const raw = Number((project.videoGenDurations || {})[shotId]) || 0;
  const engine = (project.shotVideoEngines || {})[shotId] || 'ltx';
  const tailOnly = ['minimax', 'kling'].includes(engine) || kreaNativeAudio(engine);
  return defaultTrim(Number(duration) || 0, raw, { tailOnly }).tail;
}

export function transitionsView(project) {
  const blockOf = (scene) => blockForScene(project.dynamicsPlan, scene);
  const shotsById = {};
  let n = 0;
  for (const sc of project.outline || []) for (const sh of project.sceneDetails?.[sc.id]?.shots || []) shotsById[sh.id] = { ...sh, number: ++n, sceneId: sc.id };
  const list = boundariesOf(project, blockOf).map((b) => {
    const a = shotsById[b.shotId];
    const c = shotsById[b.nextShotId];
    const slack = tailSlack(project, b.shotId, a?.duration);
    return {
      afterShot: a?.number,
      shotId: b.shotId,
      nextShot: c?.number,
      nextShotId: b.nextShotId,
      sameScene: a?.sceneId === c?.sceneId,
      effective: b.override || b.suggested,
      override: b.override,
      suggested: b.suggested,
      reason: b.reason,
      tailSlackSec: r2(slack),
      ...(slack < 0.04 && SMOOTH.includes(b.override || b.suggested) ? { note: 'no tail slack: the render makes this a hard cut (the clip ends exactly at the slot)' } : {}),
    };
  });
  return {
    boundaries: list,
    types: TRANSITION_TYPES,
    abrupt: ABRUPT,
    smooth: SMOOTH,
    disabled: project.disabledTransitions || [],
    note: 'Abrupt (smash_cut, match_action_cut, whip_pan) for action and sudden events; smooth (soft_cut, dissolve, directional_crossfade) for slow, quiet beats; rest_cut / dip_to_black for a jump in time or the end of an episode. "effective" is what the render uses: the override, else the automatic choice from the shots\' text.',
  };
}

export function subtitlesView(project) {
  const subs = subtitlesOf(project);
  const starts = shotStarts(project);
  const numbers = {};
  let n = 0;
  for (const sc of project.outline || []) for (const sh of project.sceneDetails?.[sc.id]?.shots || []) numbers[sh.id] = ++n;
  return {
    enabled: subs.enabled,
    style: subs.style,
    items: subs.items.map((it) => ({ ...it, ...(it.shotId ? { shot: numbers[it.shotId] || null } : {}) })),
    count: subs.items.length,
    fonts: SUB_FONTS,
    positions: SUB_POSITIONS,
    shotsWithDialogue: Object.keys(starts).filter((id) => {
      for (const sc of project.outline || []) for (const sh of project.sceneDetails?.[sc.id]?.shots || []) if (sh.id === id) return !!(sh.dialogue || '').trim();
      return false;
    }).length,
    note: 'Times are film seconds (the assembly order). size is percent of the frame height; x / y percent of the frame for custom text; position bottom | center | top | custom. A block spans 90% of the frame width and its words appear one by one across the block, in step with the line (the last word by ~85% of the block); enabled=false hides the layer in the preview and the render.',
  };
}

const STYLE_SCHEMA = {
  type: 'object',
  properties: {
    font: { type: 'string', enum: SUB_FONTS },
    size: { type: 'number', description: 'Percent of the frame height (1.5–14).' },
    color: { type: 'string', description: '#rrggbb' },
    outline: { type: 'string', description: '#rrggbb' },
    position: { type: 'string', enum: SUB_POSITIONS },
  },
  additionalProperties: false,
};
const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    start: { type: 'number' },
    duration: { type: 'number' },
    shotId: { type: 'string', description: 'The shot the block belongs to (its dialogue); optional.' },
    custom: { type: 'boolean', description: 'Free text placed by x / y.' },
    x: { type: 'number', description: 'Percent of the frame width (custom text).' },
    y: { type: 'number', description: 'Percent of the frame height (custom text).' },
    style: STYLE_SCHEMA,
  },
  additionalProperties: false,
};

export function assemblyTools(ctx) {
  const { projectOf, patchProject, fail, settle, schema, PROJECT, findShot } = ctx;
  return [
    {
      name: 'storyreel_transitions',
      description:
        'Stage 5: the transition at every boundary between two consecutive shots — the override set by hand or by you, the automatic choice from the shots\' text (action → abrupt, quiet → soft, a jump in time → fade), the reason, and whether the clip has tail slack for a fade. Free.',
      inputSchema: schema({ ...PROJECT }, ['projectId']),
      run: async ({ projectId }) => transitionsView(projectOf(projectId)),
    },
    {
      name: 'storyreel_set_transitions',
      description:
        'Stage 5: set the transition INTO the next shot per boundary, after the videos exist and you have looked at them (storyreel_review_shot contact sheets): abrupt cuts (smash_cut, match_action_cut, whip_pan) where the action is fast or something sudden happens, smooth ones (soft_cut, dissolve, directional_crossfade) for slow, quiet moments, rest_cut / dip_to_black for a jump in time or an episode end. items: [{ shotId, type }] (type "auto" removes the override); auto: true writes the automatic choice of every boundary as an explicit pick. Free.',
      inputSchema: schema(
        {
          ...PROJECT,
          items: { type: 'array', items: { type: 'object', properties: { shotId: { type: 'string' }, type: { type: 'string', enum: ['auto', ...TRANSITION_TYPES] } }, required: ['shotId', 'type'], additionalProperties: false } },
          auto: { type: 'boolean' },
        },
        ['projectId']
      ),
      run: async ({ projectId, items, auto }) => {
        const p = projectOf(projectId);
        const view = transitionsView(p);
        const patch = { ...(p.shotTransitions || {}) };
        let n = 0;
        if (auto) {
          for (const b of view.boundaries) {
            patch[b.shotId] = b.suggested;
            n++;
          }
        }
        for (const it of items || []) {
          findShot(p, it.shotId);
          if (!view.boundaries.some((b) => b.shotId === it.shotId)) fail('BAD_INPUT', `Shot ${it.shotId} is the last shot: it has no transition after it.`);
          if (it.type === 'auto') delete patch[it.shotId];
          else patch[it.shotId] = it.type;
          n++;
        }
        if (!n) fail('BAD_INPUT', 'Give items or auto: true.');
        patchProject(projectId, { shotTransitions: patch });
        await settle();
        return { set: n, ...transitionsView(projectOf(projectId)) };
      },
    },
    {
      name: 'storyreel_subtitles',
      description: 'Stage 5: the subtitle layer — the default look (font, size, colours, placement) and every block with its time, text and placement. Free.',
      inputSchema: schema({ ...PROJECT }, ['projectId']),
      run: async ({ projectId }) => subtitlesView(projectOf(projectId)),
    },
    {
      name: 'storyreel_set_subtitles',
      description:
        'Stage 5: edit the subtitle layer. auto: true (or { sceneId } / { shotId }) makes blocks from the shots\' dialogue — compact text at the bottom, timed inside each shot\'s slot (custom text is kept); style sets the layer\'s default look; add / edit / remove change blocks (a custom block with x / y goes anywhere on the frame); clear: true removes every block. The preview shows the result; the render burns it in. Free.',
      inputSchema: schema(
        {
          ...PROJECT,
          auto: { anyOf: [{ type: 'boolean' }, { type: 'object', properties: { sceneId: { type: 'string' }, shotId: { type: 'string' } }, additionalProperties: false }] },
          style: STYLE_SCHEMA,
          add: { type: 'array', items: ITEM_SCHEMA },
          edit: { type: 'array', items: ITEM_SCHEMA },
          remove: { type: 'array', items: { type: 'string' } },
          clear: { type: 'boolean' },
          enabled: { type: 'boolean', description: 'Show (true) or hide (false) the whole layer.' },
        },
        ['projectId']
      ),
      run: async ({ projectId, auto, style, add, edit, remove, clear, enabled }) => {
        let p = projectOf(projectId);
        let subs = subtitlesOf(p);
        let made = 0;
        if (typeof enabled === 'boolean') subs = { ...subs, enabled };
        if (clear) subs = { ...subs, items: [] };
        if (auto) {
          const r = autoSubtitles({ ...p, subtitles: subs }, typeof auto === 'object' ? auto : {});
          subs = r.subtitles;
          made = r.made;
        }
        if (style) subs = { ...subs, style: normalizeSubStyle({ ...subs.style, ...style }, subs.style) };
        for (const id of remove || []) subs = { ...subs, items: subs.items.filter((x) => x.id !== id) };
        for (const it of edit || []) {
          const cur = subs.items.find((x) => x.id === it.id) || fail('NOT_FOUND', `No subtitle block "${it.id}".`);
          const next = normalizeSubItem({ ...cur, ...it, style: it.style ? normalizeOverride({ ...(cur.style || {}), ...it.style }) : cur.style, custom: it.custom ?? (it.x != null || it.y != null ? true : cur.custom) });
          subs = { ...subs, items: subs.items.map((x) => (x.id === it.id ? next : x)) };
        }
        for (const it of add || []) {
          if (!(it.text || '').trim()) fail('BAD_INPUT', 'A block needs text.');
          if (it.shotId) findShot(p, it.shotId);
          const next = normalizeSubItem({ ...it, id: `sub_${uid()}`, custom: it.custom ?? (it.x != null || it.y != null) });
          subs = { ...subs, items: [...subs.items, next] };
        }
        if (subs.items.length > MAX_SUB_ITEMS) fail('BAD_INPUT', `At most ${MAX_SUB_ITEMS} blocks.`);
        subs.items.sort((a, b) => a.start - b.start);
        patchProject(projectId, { subtitles: subs });
        await settle();
        p = projectOf(projectId);
        return { made, ...subtitlesView(p) };
      },
    },
  ];
}
