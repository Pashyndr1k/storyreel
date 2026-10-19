// Agent tools for the graphic novel format (lib/novel): the rules and layout
// templates, the comic screens as data, the composition planner, hand edits
// of layouts / panels / balloons / captions, panel images, a review with the
// rendered screen and measured layout checks, and the PNG export. They work
// on the project data directly — the same functions Stage 5's buttons call —
// so the agent does not need the screen open.
import { isNovel, screenOf, visiblePanels, feedOf, newBubble } from '../novel/model.js';
import { LAYOUTS, LAYOUT_IDS, LAYOUT_GUIDE, layoutOf, screenPanels, placeBubbles, captionLines, SCREEN_W, SCREEN_H, DIALOGUE_SIZE, CAPTION_SIZE } from '../novel/layout.js';
import { COMPOSITION_RULES, NO_LETTERING_RULE, DEFAULT_NOVEL_STYLE } from '../novel/rules.js';
import { novelPlanSpec, screensFromPlan, lostLines, panelRatio } from '../novel/plan.js';
import { panelImageRequest, runPanelImage, imageKeyError } from '../novel/images.js';
import { renderScreen, exportComicFeed } from '../novel/render.js';
import { generateJSON, textKeyError } from '../claude.js';
import { resolveStyleText } from '../styles.js';
import { shotCastRefs } from '../castRefs.js';
import { shotLocationRefs } from '../sceneLocations.js';
import { resizeDataURL } from '../images.js';

const MAX_BUBBLES = 2;
const MAX_BUBBLE_WORDS = 25;
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Measured problems of one screen: what a reader would trip over.
export function screenIssues(project, shot, screen) {
  const issues = [];
  const cast = new Set((project.storyline?.characters || []).map((c) => (c.name || '').trim().toLowerCase()));
  const boxes = screenPanels(screen.layout);
  const panels = visiblePanels(screen);
  panels.forEach((p, i) => {
    const n = `Panel ${i + 1}`;
    const box = boxes[i];
    if (!p.prompt.trim()) issues.push(`${n}: no image prompt.`);
    const placed = placeBubbles(box, p.bubbles);
    if (placed.length > MAX_BUBBLES) issues.push(`${n}: ${placed.length} balloons — at most ${MAX_BUBBLES} per panel; move a line to another panel or screen.`);
    placed.forEach((b, k) => {
      if (words(b.text) > MAX_BUBBLE_WORDS) issues.push(`${n}: balloon ${k + 1} has ${words(b.text)} words — split it (max ${MAX_BUBBLE_WORDS}).`);
      if (b.y + b.h > box.y + box.h * 0.6) issues.push(`${n}: balloon ${k + 1} reaches below 60% of the panel height and may cover faces or the action — shorten it, move it up or give the line more room.`);
      if (b.speaker && !cast.has(b.speaker.trim().toLowerCase())) issues.push(`${n}: speaker "${b.speaker}" is not in the cast.`);
      placed.slice(k + 1).forEach((o, j) => {
        if (overlap(b, o)) issues.push(`${n}: balloons ${k + 1} and ${k + j + 2} overlap — move one (bubbleMoves) or split the panel's lines.`);
      });
    });
    const area = placed.reduce((a, b) => a + b.w * b.h, 0);
    if (area > box.w * box.h * 0.4) issues.push(`${n}: balloons cover ${Math.round((area / (box.w * box.h)) * 100)}% of the image — too much text for this panel.`);
    if (captionLines(p.caption, box.cap.w).cut) issues.push(`${n}: the caption is longer than two lines and is cut — shorten it.`);
    for (const c of p.characters || []) if (!cast.has(String(c).trim().toLowerCase())) issues.push(`${n}: character "${c}" is not in the cast (no reference photo will be attached).`);
    if (i > 0 && p.framing.trim() && p.framing.trim().toLowerCase() === panels[i - 1].framing.trim().toLowerCase()) issues.push(`Panels ${i} and ${i + 1} have the same framing ("${p.framing}") — vary the shot size or angle.`);
  });
  const lost = lostLines(shot, { panels });
  if (lost.length) issues.push(`Script lines missing from the balloons: ${lost.map((l) => `${l.speaker ? `${l.speaker}: ` : ''}${l.text}`).join(' · ')}`);
  return issues;
}

export function novelTools(ctx) {
  const { app, projectOf, patchProject, sceneOf, findShot, fail, settle, countAttempt, schema, PROJECT } = ctx;
  const str = (description) => ({ type: 'string', description });
  const novelOf = (projectId) => {
    const p = projectOf(projectId);
    if (!isNovel(p)) fail('NOT_READY', 'This project is not a graphic novel (create one with storyreel_create_project format "novel").');
    return p;
  };
  const styleOf = (p) => {
    const styles = app().styles;
    return { imageStyle: resolveStyleText(styles, 'image', p.imageStyleId), imageStylePlus: !!(styles?.image || []).find((s) => s.id === p.imageStyleId)?.plus };
  };
  const panelView = (p, screen, i) => {
    const panel = visiblePanels(screen)[i];
    const box = screenPanels(screen.layout)[i];
    return {
      index: i,
      id: panel.id,
      box: `${box.w}×${box.h} ${box.w > box.h * 1.15 ? 'wide' : box.h > box.w * 1.15 ? 'tall' : 'square'}`,
      drawnAt: panelRatio(screen.layout, i),
      framing: panel.framing,
      characters: panel.characters || [],
      prompt: panel.prompt,
      caption: panel.caption,
      bubbles: (panel.bubbles || []).map((b) => ({ id: b.id, speaker: b.speaker, text: b.text, tail: b.tail || 'auto', position: Number.isFinite(b.x) ? { x: b.x, y: b.y } : 'auto' })),
      hasImage: !!(p.panelImages || {})[panel.id],
    };
  };
  const screenView = (p, item) => ({
    shotId: item.shot.id,
    screen: `${item.sceneIndex + 1}.${item.shotIndex + 1}`,
    sceneId: item.scene.id,
    script: { action: item.shot.action || '', dialogue: item.shot.dialogue || '' },
    layout: item.screen.layout,
    planned: !!item.screen.planned,
    panels: visiblePanels(item.screen).map((_, i) => panelView(p, item.screen, i)),
    issues: screenIssues(p, item.shot, item.screen),
  });
  // write one screen (materialising its visible panels with their stable ids)
  const setScreen = (projectId, shotId, fn) =>
    patchProject(projectId, (q) => {
      const { shot } = findShot(q, shotId);
      const cur = screenOf(q, shot);
      const vis = visiblePanels(cur);
      const next = fn({ ...cur, panels: [...vis, ...(cur.panels || []).slice(vis.length)] });
      return { novel: { ...(q.novel || {}), screens: { ...(q.novel?.screens || {}), [shotId]: next } } };
    });
  const drawOne = async (projectId, shotId, i) => {
    const p = projectOf(projectId);
    const item = feedOf(p).find((x) => x.shot.id === shotId) || fail('NOT_FOUND', `No shot "${shotId}".`);
    const panel = visiblePanels(item.screen)[i] || fail('BAD_INPUT', `The screen has ${layoutOf(item.screen.layout).panels} panels (index 0–${layoutOf(item.screen.layout).panels - 1}).`);
    if (!panel.prompt.trim()) fail('NOT_READY', `Panel ${i + 1} of screen ${item.sceneIndex + 1}.${item.shotIndex + 1} has no image prompt.`);
    const attempt = countAttempt(projectId, { shotId, kind: `panel${i + 1}` }, `Panel ${i + 1} of this screen`);
    const settings = app().settings;
    const req = panelImageRequest({ project: p, scene: item.scene, shot: item.shot, screen: { ...item.screen, panels: visiblePanels(item.screen) }, index: i, ...styleOf(p), settings });
    const url = await runPanelImage(settings, req, `${(p.title || 'comic').slice(0, 24)}_sc${item.sceneIndex + 1}_shot${item.shotIndex + 1}_panel${i + 1}`);
    patchProject(projectId, (q) => ({ panelImages: { ...(q.panelImages || {}), [panel.id]: url } }));
    return { panelId: panel.id, attempt, url };
  };

  return [
    {
      name: 'storyreel_novel_rules',
      description: 'Graphic novel: the format\'s rules — the screen (1080×1920, 9:16), the four layout templates with their panel boxes and when to use each, the panel composition rules the planner follows, the lettering limits (one dialogue size everywhere, balloons sized to their text, at most 2 balloons and ~25 words per balloon, a caption line of ≤ 2 lines under every panel) and how panel images are prompted. Read before planning or judging comic screens. Free.',
      inputSchema: schema({}),
      run: async () => ({
        screen: { width: SCREEN_W, height: SCREEN_H, aspect: '9:16', readingOrder: 'top to bottom; panels left → right, top → bottom', dialogueFont: `Comic Sans, ${DIALOGUE_SIZE}px on every screen`, captionFont: `Comic Sans, ${CAPTION_SIZE}px, max 2 lines` },
        layouts: LAYOUTS.map((l) => ({ id: l.id, panels: l.panels, boxes: screenPanels(l.id).map((b, i) => ({ index: i, size: `${b.w}×${b.h}`, drawnAt: panelRatio(l.id, i) })), use: LAYOUT_GUIDE[l.id] })),
        composition: COMPOSITION_RULES,
        lettering: { balloonsPerPanel: MAX_BUBBLES, wordsPerBalloon: MAX_BUBBLE_WORDS, balloons: 'the shot\'s dialogue verbatim and in order, in the project language; split a long line into two balloons of the same speaker; never invent lines', caption: 'narration, place / time, sound or anything that is not dialogue; ≤ 14 words; "" when the panel needs none', bubblePositions: 'auto by default (top of the panel, in reading order, alternating sides); x / y are the balloon\'s top-left corner as fractions (0–1) of the panel image' },
        images: { prompt: 'English; this ONE panel only: framing and angle, who is where (left / right / foreground / background), poses, expressions, place, light, clear upper third when the panel has balloons; characters by their cast names (their photos are attached)', defaultStyle: DEFAULT_NOVEL_STYLE, noLettering: NO_LETTERING_RULE },
      }),
    },
    {
      name: 'storyreel_novel_get',
      description: 'Graphic novel: the comic screens as data — one per shot, in reading order: layout, each panel\'s box and drawing ratio, framing, characters, image prompt, caption, balloons (id, speaker, text, tail, position), whether it has an image — plus measured issues (overlapping or oversized balloons, balloons over the faces, cut captions, repeated framing, speakers not in the cast, script lines missing from the balloons). Filter with sceneId or shotId. Free.',
      inputSchema: schema({ ...PROJECT, sceneId: { type: 'string' }, shotId: { type: 'string' } }, ['projectId']),
      run: async ({ projectId, sceneId, shotId }) => {
        const p = novelOf(projectId);
        const items = feedOf(p).filter((x) => (shotId ? x.shot.id === shotId : sceneId ? x.scene.id === sceneId : true));
        if (!items.length) fail('NOT_FOUND', shotId || sceneId ? 'No such shot or scene.' : 'No shots yet — write them at Stage 4 (storyreel_run_stage 4).');
        const panels = items.reduce((a, x) => a + layoutOf(x.screen.layout).panels, 0);
        const drawn = items.reduce((a, x) => a + visiblePanels(x.screen).filter((pn) => (p.panelImages || {})[pn.id]).length, 0);
        return { screens: items.map((x) => screenView(p, x)), summary: { screens: items.length, planned: items.filter((x) => x.screen.planned).length, panels, drawn } };
      },
    },
    {
      name: 'storyreel_novel_plan',
      description: 'Graphic novel: run the app\'s composition planner — the text model picks a layout template per screen and writes every panel (framing, characters, English image prompt, caption, balloons with the script\'s lines). With sceneId: every screen of the scene; with shotId: that screen only (the rest of the scene is context). Replaces the planned screens\' text; panel images stay with their panels. Counts as an attempt.',
      inputSchema: schema({ ...PROJECT, sceneId: { type: 'string' }, shotId: { type: 'string' } }, ['projectId']),
      run: async ({ projectId, sceneId, shotId }) => {
        const p = novelOf(projectId);
        const settings = app().settings;
        if (textKeyError(settings)) fail('NO_KEY', 'The text model API key is not set in StoryReel Settings.');
        let scene;
        let shots;
        if (shotId) {
          const f = findShot(p, shotId);
          scene = f.scene;
          shots = [f.shot];
        } else {
          scene = sceneOf(p, sceneId || fail('BAD_INPUT', 'Give sceneId or shotId.'));
          shots = p.sceneDetails?.[scene.id]?.shots || [];
          if (!shots.length) fail('NOT_READY', 'This scene has no shots yet (Stage 4).');
        }
        const attempt = countAttempt(projectId, shotId ? { shotId, kind: 'comic' } : { sceneId: scene.id, kind: 'comic' }, shotId ? 'The comic plan of this screen' : 'The comic plan of this scene');
        const data = await generateJSON(settings, novelPlanSpec(p, scene, shots, app().lang || 'en'));
        const screens = screensFromPlan(projectOf(projectId), scene, shots, data);
        if (!Object.keys(screens).length) fail('GENERATION_FAILED', 'The planner returned no screens.');
        patchProject(projectId, (q) => ({ stage: Math.max(q.stage || 1, 5), novel: { ...(q.novel || {}), screens: { ...(q.novel?.screens || {}), ...screens } } }));
        await settle();
        const fresh = projectOf(projectId);
        return { attempt, screens: feedOf(fresh).filter((x) => screens[x.shot.id]).map((x) => screenView(fresh, x)) };
      },
    },
    {
      name: 'storyreel_novel_set_screen',
      description: `Graphic novel: edit one screen by hand. layout: ${LAYOUT_IDS.join(' | ')} (panels hidden by a smaller layout are kept and come back). panels: changes per panel by index — framing, characters (cast names), prompt (English image prompt), caption (the line under the panel), bubbles (replaces the panel's balloon list: [{ speaker, text, tail: auto|left|right|none }]), clearImage: true. bubbleMoves: [{ panelIndex, bubbleId, x, y }] places a balloon (top-left corner as 0–1 fractions of the panel image) or { panelIndex, bubbleId, auto: true } returns it to the automatic place. Returns the screen with its measured issues. Free.`,
      inputSchema: schema(
        {
          ...PROJECT,
          shotId: { type: 'string' },
          layout: { type: 'string', enum: LAYOUT_IDS },
          panels: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer', minimum: 0, maximum: 2 },
                framing: { type: 'string' },
                characters: { type: 'array', items: { type: 'string' } },
                prompt: { type: 'string' },
                caption: { type: 'string' },
                bubbles: { type: 'array', items: { type: 'object', properties: { speaker: { type: 'string' }, text: { type: 'string' }, tail: { type: 'string', enum: ['auto', 'left', 'right', 'none'] } }, required: ['text'], additionalProperties: false } },
                clearImage: { type: 'boolean' },
              },
              required: ['index'],
              additionalProperties: false,
            },
          },
          bubbleMoves: {
            type: 'array',
            items: { type: 'object', properties: { panelIndex: { type: 'integer', minimum: 0, maximum: 2 }, bubbleId: { type: 'string' }, x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 }, auto: { type: 'boolean' } }, required: ['panelIndex', 'bubbleId'], additionalProperties: false },
          },
        },
        ['projectId', 'shotId']
      ),
      run: async ({ projectId, shotId, layout, panels = [], bubbleMoves = [] }) => {
        const p = novelOf(projectId);
        const { shot } = findShot(p, shotId);
        // checked (and the images to clear collected) before anything is written: a throw
        // inside the state update would break the page, and the update runs later
        let clear = [];
        {
          const s0 = screenOf(p, shot);
          const vis = visiblePanels(layout ? { ...s0, layout } : s0);
          clear = panels.filter((ch) => ch.clearImage && vis[ch.index]).map((ch) => vis[ch.index].id);
          for (const ch of panels) if (ch.index >= vis.length) fail('BAD_INPUT', `panels: index ${ch.index} — this layout has ${vis.length} panels (0–${vis.length - 1}).`);
          for (const m of bubbleMoves) {
            if (m.panelIndex >= vis.length) fail('BAD_INPUT', `bubbleMoves: panelIndex ${m.panelIndex} — this layout has ${vis.length} panels.`);
            if (panels.some((ch) => ch.index === m.panelIndex && Array.isArray(ch.bubbles))) fail('BAD_INPUT', 'Move balloons in a separate call after replacing them: the new balloons get new ids (storyreel_novel_get).');
            if (!(vis[m.panelIndex].bubbles || []).some((b) => b.id === m.bubbleId)) fail('NOT_FOUND', `Panel ${m.panelIndex + 1} has no balloon "${m.bubbleId}" (ids from storyreel_novel_get).`);
            if (!m.auto && !(Number.isFinite(m.x) && Number.isFinite(m.y))) fail('BAD_INPUT', 'A balloon move needs x and y, or auto: true.');
          }
        }
        setScreen(projectId, shotId, (s) => {
          let next = { ...s, ...(layout ? { layout } : {}) };
          // the new layout's panels exist with stable ids before they are edited
          next = { ...next, panels: [...visiblePanels(next), ...(next.panels || []).slice(visiblePanels(next).length)] };
          const list = next.panels.map((pn, i) => {
            const ch = panels.find((x) => x.index === i);
            const mv = bubbleMoves.filter((m) => m.panelIndex === i);
            if (!ch && !mv.length) return pn;
            let out = { ...pn };
            if (ch) {
              for (const k of ['framing', 'prompt', 'caption']) if (typeof ch[k] === 'string') out[k] = ch[k];
              if (Array.isArray(ch.characters)) out.characters = ch.characters.map(String);
              if (Array.isArray(ch.bubbles)) out.bubbles = ch.bubbles.filter((b) => String(b.text || '').trim()).map((b) => newBubble({ speaker: b.speaker || '', text: String(b.text).trim(), tail: b.tail || 'auto' }));
            }
            for (const m of mv) {
              out = { ...out, bubbles: out.bubbles.map((b) => (b.id !== m.bubbleId ? b : m.auto ? { ...b, x: undefined, y: undefined } : { ...b, x: Math.round(m.x * 1000) / 1000, y: Math.round(m.y * 1000) / 1000 })) };
            }
            return out;
          });
          return { ...next, panels: list, planned: true };
        });
        if (clear.length) patchProject(projectId, (q) => ({ panelImages: Object.fromEntries(Object.entries(q.panelImages || {}).filter(([k]) => !clear.includes(k))) }));
        await settle();
        const fresh = projectOf(projectId);
        return screenView(fresh, feedOf(fresh).find((x) => x.shot.id === shotId));
      },
    },
    {
      name: 'storyreel_novel_draw',
      description: 'Graphic novel: create panel images with the app\'s image service (the project\'s image style, or the default comic style; the photos of the characters a panel names and of the scene\'s place are attached; no lettering in the image). shotId + panelIndex: that panel (redraws it if it has an image). shotId alone: the screen\'s panels without an image. sceneId: every panel of the scene without an image. Each panel counts as its own attempt. Look at the result with storyreel_novel_review.',
      inputSchema: schema({ ...PROJECT, shotId: { type: 'string' }, panelIndex: { type: 'integer', minimum: 0, maximum: 2 }, sceneId: { type: 'string' } }, ['projectId']),
      run: async ({ projectId, shotId, panelIndex, sceneId }) => {
        const p = novelOf(projectId);
        const keyErr = imageKeyError(app().settings);
        if (keyErr) fail('NO_KEY', keyErr === 'NO_KREA_KEY' ? 'The Krea API key is not set in StoryReel Settings.' : 'The Gemini API key is not set in StoryReel Settings.');
        if (shotId && Number.isInteger(panelIndex)) {
          const r = await drawOne(projectId, shotId, panelIndex);
          await settle();
          return { drawn: [{ shotId, panelIndex, attempt: r.attempt }], images: [{ label: `PANEL ${panelIndex + 1}`, dataURL: await resizeDataURL(r.url, 768 * 768, 0.82) }] };
        }
        const items = feedOf(p).filter((x) => (shotId ? x.shot.id === shotId : sceneId ? x.scene.id === sceneId : false));
        if (!items.length) fail('BAD_INPUT', 'Give shotId (with or without panelIndex) or sceneId.');
        const jobs = items.flatMap((x) => visiblePanels(x.screen).map((pn, i) => ({ shotId: x.shot.id, i, pn }))).filter((j) => j.pn.prompt.trim() && !(p.panelImages || {})[j.pn.id]);
        const drawn = [];
        const failed = [];
        for (const j of jobs) {
          try {
            const r = await drawOne(projectId, j.shotId, j.i);
            drawn.push({ shotId: j.shotId, panelIndex: j.i, attempt: r.attempt });
          } catch (e) {
            failed.push({ shotId: j.shotId, panelIndex: j.i, error: e.message || String(e) });
            if (e.code === 'NO_KEY') break;
          }
        }
        await settle();
        return { drawn, failed, skipped: 'panels that already have an image or have no prompt', next: 'storyreel_novel_review per screen.' };
      },
    },
    {
      name: 'storyreel_novel_review',
      description: 'Graphic novel: evidence for judging one screen — IMAGES: the rendered screen exactly as exported (balloons and captions lettered), each panel image alone, and the REFERENCE photos of the characters the panels name and of the scene\'s place — plus the measured issues and the script. Check: likeness to the references, the same people keep their sides, framing varies, balloons do not cover faces, no lettering or artifacts drawn into the images, the last panel works as the scroll hook. Free.',
      inputSchema: schema({ ...PROJECT, shotId: { type: 'string' } }, ['projectId', 'shotId']),
      run: async ({ projectId, shotId }) => {
        const p = novelOf(projectId);
        const item = feedOf(p).find((x) => x.shot.id === shotId) || fail('NOT_FOUND', `No shot "${shotId}".`);
        const imgs = p.panelImages || {};
        const canvas = await renderScreen(item.screen, imgs);
        const screenURL = await resizeDataURL(canvas.toDataURL('image/png'), 720 * 1280, 0.85);
        const images = [{ label: `SCREEN ${item.sceneIndex + 1}.${item.shotIndex + 1} — as exported`, dataURL: screenURL }];
        const panels = visiblePanels(item.screen);
        for (let i = 0; i < panels.length; i++) {
          if (imgs[panels[i].id]) images.push({ label: `PANEL ${i + 1} — ${panels[i].framing || 'no framing'}`, dataURL: await resizeDataURL(imgs[panels[i].id], 640 * 640, 0.8) });
        }
        const pseudo = { action: panels.map((x) => `${(x.characters || []).join(', ')}. ${x.prompt}`).join('\n'), dialogue: panels.flatMap((x) => x.bubbles || []).map((b) => `${b.speaker}: ${b.text}`).join('\n'), notes: '' };
        for (const c of shotCastRefs(p, pseudo)) images.push({ label: `REFERENCE — character ${c.name}`, dataURL: c.photo });
        for (const g of shotLocationRefs(p, item.scene, shotId).slice(0, 1)) if (g.photos[0]) images.push({ label: `REFERENCE — location ${g.name || ''}`.trim(), dataURL: g.photos[0] });
        return { ...screenView(p, item), images };
      },
    },
    {
      name: 'storyreel_novel_export',
      description: 'Graphic novel: export the finished comic — every screen as a 1080×1920 PNG in reading order (NNN_sceneS_shotK.png). In the desktop app they are written to <projects folder>/<project>/comic/. Screens with undrawn panels export with grey placeholders, so draw and review first. Free.',
      inputSchema: schema({ ...PROJECT }, ['projectId']),
      run: async ({ projectId }) => {
        const p = novelOf(projectId);
        const missing = feedOf(p).flatMap((x) => visiblePanels(x.screen).filter((pn) => !(p.panelImages || {})[pn.id]).map(() => x.shot.id));
        const res = await exportComicFeed(p, app().settings, p.panelImages || {});
        return { ...res, ...(missing.length ? { warning: `${missing.length} panel(s) had no image and were exported as grey placeholders.` } : {}) };
      },
    },
  ];
}
