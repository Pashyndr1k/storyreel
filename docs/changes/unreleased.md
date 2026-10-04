# Unreleased (after v2.12.0)

Base: tag `v2.12.0` (commit `a6f2d29`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. Agent access: an API for an AI agent to operate the app

**Request.** Delegate launching each stage and verifying its results to an AI
agent such as Claude Code. Provide an interface through which the agent can
create a video from scratch or continue a project, with every stage executed
and verified: character likeness against the reference photos, each shot
following the previous one, environment and asset consistency, audio and
speech not cut off, artifacts (cropped bodies, extra limbs), and choice of a
visual and video style that fits the story. On a discrepancy the agent revises
the prompt or uses smart edit; after four failed attempts it flags the shot or
stage (a tagging system) and moves on.

**Design in one paragraph.** The app's generation logic lives in its React
components, so the agent *drives the open app*: mounted parts of the UI
register their actions in a registry, and a tool layer calls them after
navigating to the right project / stage / scene / shot. The tools are served
by the Electron main process over a loopback HTTP endpoint, and a small MCP
stdio server (shipped with the app) exposes them to Claude Code. The agent
itself judges images; the app supplies the evidence (reference photos, frames,
a video contact sheet) and measures what is measurable (durations, audio cut
off). Guard rails — the attempt limit, one call at a time, ordering — are
enforced in the tool layer, not left to the agent's prompt.

**Behaviour.**
- Settings → Interface → "Agent access": a checkbox (off by default), a port
  (default 47821), the server state, and the `claude mcp add storyreel -- node
  "<path>/storyreel-mcp.mjs"` command with a Copy button. Desktop app only;
  the web/dev build shows "Available in the desktop app."
- 19 tools (all `storyreel_*`): `guide`, `status`, `list_projects`,
  `create_project`, `get_project`, `update_project`, `list_styles`,
  `run_stage` (1–4), `pick_idea`, `edit_script`, `smart_edit`,
  `create_prompts`, `set_prompt`, `set_dynamics`, `create_media`
  (`image` | `final_frame` | `video` | `voice`), `review_shot`, `flag`,
  `list_flags`, `render`. Descriptions and JSON schemas are in `TOOLS`
  (`src/lib/agent/api.js`); user documentation is `docs/agent-api.md`; the
  agent's playbook is `agent/AGENT_GUIDE.md` (returned by `storyreel_guide`).
- `storyreel_review_shot` returns `checks` — `slotSec`, `video { durationSec,
  width, height, shortBy }`, `videoSound` and `voice` audio reports
  (`duration`, `loudness`, `leadSilenceSec`, `tailSilenceSec`, `endsAbruptly`,
  `startsAbruptly`, plus `voiceOverrunsShot` for the voice), optional
  `transcript` — and `images` (`{ label, dataURL }`, JPEG ≤ 640×640 px area):
  character references for the cast named in the shot (`shotCastRefs`),
  location and asset references, the previous shot's last video frame (or its
  first frame), this shot's first/final frame, and a numbered contact sheet of
  the video (default 6 frames). The MCP bridge turns the images into MCP image
  blocks preceded by their labels.
- **Attempts.** `countAttempt` increments `project.agentAttempts[key]` before
  each generation: `stage:<n>`, `stage:smart_edit`, `scene:<id>:shots`,
  `scene:<id>:prompts`, `shot:<id>:imagePrompt|videoPrompt|image|final_frame|
  video|voice`. When the counter is already 4 the call fails with
  `ATTEMPT_LIMIT` and an automatic flag is added (once). A failed generation
  counts. `storyreel_set_prompt`, `set_dynamics`, `edit_script`,
  `update_project`, `pick_idea`, `flag` and all read tools are free.
- **Flags.** `project.agentFlags[]`; open flags show as a red flag button
  with a count in the project header (all stages) and a red dot on the shot's
  timeline clip. The list (`AgentFlagsModal`) offers "Go to" (opens the stage,
  or Stage 5 on the scene/shot) and "Resolve" (marks resolved and deletes the
  target's attempt counters).
- **One call at a time.** A second non-read tool call while one runs returns
  `BUSY`. Read tools (`guide`, `status`, `list_projects`, `get_project`,
  `list_styles`, `list_flags`) are always answered.
- **No dialogs during agent calls.** While a tool runs, `window.confirm`
  answers yes and `window.alert` is captured and returned as the failure
  message (`inAgentCall`, `agentActive`, `agentAlert` in the registry;
  wrapped last in `src/main.jsx`).
- A generation's success is decided by the workbench error state and the
  presence of the media, not by comparing files (a regeneration may return an
  identical file).
- Not exposed: API keys, app settings, adding reference photos, deleting or
  archiving projects, uploads, series planning beyond `run_stage` 3, music and
  sound effects, timeline editing (trims, transitions, audio lanes).

**Security.** The server starts only when enabled; binds `127.0.0.1`; requires
`Authorization: Bearer <token>` (48 hex chars, generated once, stored in
`<userData>/agent.json`, compared in constant time); rejects a non-loopback
`Host` header and any request carrying an `Origin` header; sends no CORS
headers; body limit 2 MB. Relay timeout 75 minutes per call.

**Data model.**
- `project.agentFlags`: `[{ id, target: { shotId?, sceneId?, stage?, kind? },
  kind, issue, note, attempts, attemptKey?, auto?, by: 'agent', resolved,
  createdAt, resolvedAt? }]` — default `[]`, normalised in `migrateProject`.
- `project.agentAttempts`: `{ [key]: number }` — default `{}`.
- `settings.agentEnabled` (false), `settings.agentPort` (47821).
- `<userData>/agent.json`: `{ token, port, url, running }`, rewritten when the
  server starts or stops (`url` is `""` when stopped).

**Files.**
- `src/lib/agent/registry.js` (new): `useAgentScope(scope, actions)`,
  `agentScope`, `waitScope`, `inAgentCall`, `agentActive`, `agentAlert`,
  `takeAgentAlerts`.
- `src/lib/agent/api.js` (new): `TOOLS`, `callAgent(method, params)`,
  `toolList()`, `MAX_ATTEMPTS`, `FLAG_KINDS`; helpers `openStage`,
  `openBench`, `countAttempt`, `addFlag`, `projectView`, `shotView`.
- `src/lib/agent/evidence.js` (new): `still`, `contactSheet`, `videoFrame`,
  `audioReport`.
- `agent/AGENT_GUIDE.md` (new; imported with `?raw`), `agent/storyreel-mcp.mjs`
  (new; dependency-free MCP stdio server: `initialize`, `ping`, `tools/list`,
  `tools/call`; tools fetched from the app via `GET /tools`; reads
  `STORYREEL_AGENT_URL` + `STORYREEL_AGENT_TOKEN`, or `STORYREEL_AGENT_FILE`,
  or the default `agent.json`; offers a single explanatory tool when the app
  is not reachable).
- `electron/agentServer.cjs` (new): `createAgentServer({ app, ipcMain,
  getWindow })` — HTTP routes `GET /health`, `GET /tools`, `POST /call`; IPC
  `agent-call` (main → page), `agent-result` (page → main), `agent-configure`,
  `agent-info`.
- `electron/main.cjs`: creates the server in `whenReady`.
- `electron/preload.cjs`: `window.agentBridge { onCall, configure, info }`.
- `package.json`: `build.extraResources` copies `agent/` into the packaged
  app's resources (the path shown in Settings).
- Registrations (`useAgentScope`): `src/App.jsx` (`'app'`: projects,
  settings, styles, library, `updateProject`, `addProjects`, `openProject`;
  also `window.__storyreelAgent = { call, tools }` and the bridge/config
  effects), `src/pages/Project.jsx` (`'project'`: `id`, `view`, `setView`),
  `src/stages/Stage1.jsx`, `Stage2.jsx`, `Stage3.jsx` (outline and, in
  `Stage3Series.jsx`, the series plan — both as `'stage3'`), `Stage4.jsx`
  (`generateScene`, `generateAll`), `Stage5.jsx` (`'bench'`: `createPrompts`,
  `regenPrompt`, `genImage`, `genFinalFrame`, `genVideo`, `genVoice`,
  `imgErr`, `error`), `Stage6.jsx` (`'assembly'`: `select`, `render`,
  `canRender`, `lastToast`). Stage 1–3 `generate` functions now return their
  promise.
- `src/components/AgentFlagsModal.jsx` (new); flags button and `gotoFlag` in
  `src/pages/Project.jsx`; `flaggedShots` and the `.flagged` clip class in
  `src/stages/Stage6.jsx`; `Flag` icon in `src/components/icons.jsx`.
- `src/components/SettingsModal.jsx`: the Agent access block.
- `src/lib/storage.js`: the project and settings fields.
- `src/main.jsx`: the agent-aware `alert` / `confirm` wrappers.
- `src/styles.css`: `.agent-setup`, `.agent-port`, `.agent-command`,
  `.flags-btn`, `.flags-count`, `.flag-list`, `.flag-row`, `.flag-head`,
  `.nle-clip.flagged::after`.
- i18n: `set.agent*` (10 keys), `tip.agent*` (4), `ind.agentState`,
  `flag.*` (button, title, hint, none, goto, resolve, attempts, where*,
  kind_*), `tip.flagGoto`, `tip.flagResolve`, `ind.flagKind`,
  `ind.flagAttempts`.
- `docs/agent-api.md` (new): user documentation.

**Verified.**
- Tool layer in the dev app with every outside request stubbed: a project
  created and taken through stages 1–4, scene prompts, first frame, review
  evidence, style selection (valid and invalid id), dynamics, script edit,
  manual flag, the attempt limit (4 then `ATTEMPT_LIMIT` with one automatic
  flag), `BUSY` during a running call with read tools still answering, a
  failing generation reported as `GENERATION_FAILED`, the flags button, list
  and Resolve (counters cleared).
- Evidence module: contact sheet of a recorded clip (6 frames, timestamps),
  last frame, and audio reports for a tone that is cut off (`endsAbruptly:
  true`) and one that ends in silence (`false`).
- `electron/agentServer.cjs` under Node with a mocked Electron: 401 without or
  with a wrong token, 403 with an `Origin` header, routes, bad JSON, stop →
  `agent.json` cleared.
- `agent/storyreel-mcp.mjs` over stdio against that server: initialize, tool
  list, a call, a review result turned into text + image blocks, an error
  result, unknown method, and the offline behaviour.
- The real `preload.cjs` + `agentServer.cjs` in a hidden Electron window
  (harness page): configure, relay of a call, a slow call, a throwing handler.

**Not verified.** No run with real models: the agent's actual judgment of
likeness, continuity and artifacts, video generation through the tools, voice,
transcript and render have not been exercised against real services, and the
full packaged app has not been driven by Claude Code end to end.

**Open / ideas.**
- Series planning and splitting, music, sound effects, uploads and timeline
  editing are not exposed as tools yet.
- A per-run spending cap (e.g. a maximum number of video generations) would
  complement the per-target attempt limit.
- An app-side vision check (the app calling a vision model itself and
  returning a verdict) would let agents without image input use the same
  workflow.

---

## 2. UI changes at Stage 4 / Stage 5; highly detailed H3 prompts

**Request.** (1) Stage 4: a "duplicate shot" icon on each shot card next to
the delete icon; the copy goes right after the original. (2) Stage 5: the
"regenerate prompt" icon becomes a text button, and the "copy" text button
becomes an icon. (3) Timeline: remove the mute icon in the top-left corner of
a shot's clip. (4) Stage 4: remove the environment thumbnails from the scene
description. (5) Stage 4: "Duration (2–10 s)" → "Duration". (6) MiniMax H3
prompts must be highly detailed, with camera dynamics and character movement,
and use shot changes inside one shot when the description allows and the shot
is longer than 4 seconds; an example prompt was supplied as the standard.

**Behaviour.**
- Stage 4 shot card tools: a copy icon before the ✕. `duplicateShot(id)`
  inserts `{ ...shot, id: uid() }` at index + 1 (text and duration only —
  media, prompts and settings are keyed by shot id and are not copied).
- Stage 5 prompt header: the recreate control is a text button "Recreate
  prompt" (reads "Creating prompt…" while it runs); Copy is an icon button
  that shows a check mark for 1.5 s after copying. The wording follows the
  app-wide Create / Recreate rule, not "Regenerate". Applies to the image,
  video and voice prompt headers (the voice header has only the copy icon).
- Timeline clips no longer show the 🔇 badge. Muting itself is unchanged
  (`project.shotMutes`); the string `s6.mutedBadge` is now unused.
- Stage 4 scene header shows title, timing and summary only; the environment
  photos remain at Stage 5.
- Stage 4 duration label reads "Duration" (the 2–10 s limits still apply).
- H3 system instruction (`H3_SYSTEM`):
  - new rule "SHOT CHANGES INSIDE ONE VIDEO": a shot longer than 4 s whose
    action has more than one beat is written as two or three internal shots
    (`[Shot 2] At 00:03.500, …`), at most one cut per two seconds, first
    internal shot ≥ 2 s; each internal shot has its own framing and follows
    the shot's CAMERA setting; shots of ≤ 4 s, single unbroken actions and
    explicit one-take shots stay one shot; with a final frame attached the
    last internal shot must arrive at it. This replaces "only if the beat
    genuinely needs a new viewpoint".
  - new "DETAIL STANDARD" (replaces "five to nine sentences"): 150–350 words;
    the camera for the whole shot including what it does not do; for every
    moving element what moves, direction, speed, how many times, start and
    end state; what must stay unchanged; everything in playback order.
  - the scene request adds a sentence invoking both, and its `maxTokens`
    rises from 6000 to 14000.
  The user's example (a locked-off animated painting) informed the standard;
  its text is not embedded in the prompt.

**Files.** `src/stages/Stage4.jsx` (`duplicateShot`, the icon, the removed
thumbnail block), `src/stages/Stage5.jsx` (`CopyButton`, `regenBtn`, icon
imports), `src/stages/Stage6.jsx` (badge removed), `src/lib/prompts.js`
(`H3_SYSTEM`, `stage5H3VideoPrompt`), `src/styles.css`
(`.prompt-recreate`, `.prompt-copy.done`, `.shot-dup`), i18n: new
`tip.dupShot`; changed `s4.duration`.

**Verified.** In the dev app: duplicating a shot (copy placed after the
original with a new id), the Stage 5 header buttons, the absence of the mute
badge and of the Stage 4 thumbnails, the label, and the new rules present in
the built H3 prompt spec. No model call — the length and quality of real H3
prompts, and how H3 renders internal cuts, are untested.

---

## 3. Spatial layout: a 3D blocking tool that the prompt writers follow

**Request.** A "spatial awareness" tool for placing and tracking characters in
a frame: a 3D scene with a checkerboard floor and ultra-simple block figures
(box head, torso, arms, legs; an arrow in front of the face; one distinct
colour per character — red, blue, green, orange, purple, grey — with
different shades on front, side and back; a head with eyes, mouth, ears, nose
and a mark on the back; four pose templates: standing, sitting, lying,
jumping, which set vertical position); a freely movable camera with real
optics (orbit, vertical move, target point, five lenses); a pop-up with the 3D
editor on the left and the camera view on the right. The scene is first built
by AI from the story, positions change shot by shot when characters move, and
the model that writes shot descriptions and prompts cross-references the
camera view. Improvements were proposed first; the user chose: built by the
app's text model; measured description only (no image) for the prompt
writers; characters plus simple set boxes; one layout per shot.

**Behaviour.**
- A "Layout" button on the Stage 4 action row and a cube icon button in the
  Stage 5 scene tools open the window for the current scene (accent-coloured
  once the scene has a layout). Disabled until the scene has shots.
- The window (`SpatialModal`): title, a strip of the scene's shots (outlined
  = has its own layout, filled = open), "Build layout" / "Rebuild layout";
  the open shot's type and action; left, the 3D editor; right, the camera
  view at the project's aspect ratio with the lens in its title; below, three
  panels — "In the scene" (a chip per character in its colour and per set
  box, "+ Box", and the selected item's controls), "Camera" (lens 18 / 24 /
  35 / 50 / 85 mm, orbit, elevation, distance, target height, "Aim at…",
  "Use previous"), and "What the prompt writer gets" (the measured
  description and the scene's continuity warnings, each a button that opens
  its shot).
- Editor interactions: drag a figure, a box or the red camera target across
  the floor (0.1 m snap); drag empty space to orbit the editor view,
  Shift-drag to pan, wheel to zoom. The shot camera is drawn as a body with
  its frustum to the target distance. Figure controls: pose (Stand, Sit, Lie,
  Jump), direction (-180…180°), head turn (-80…80°), "Turn toward…" (body)
  and "Look at…" (head only). Box controls: label, width, depth, height,
  direction, delete. Up to 6 characters (colours in cast order) and 8 boxes.
- **One layout per shot, carried forward.** A shot without its own entry uses
  the nearest earlier shot's; the first edit gives it its own. "Use previous"
  drops a shot's own layout. Set boxes are per scene.
- **Build layout** sends the scene, its cast and its shots to the text model
  (`layoutPrompt`) and stores positions, poses, facing, boxes and a camera
  for every shot (`layoutFromModel`); a character the model leaves out stays
  where they were; `aim_at` points the camera at a character.
- **Measured description** (`describeShot`), computed from the same camera
  maths the view renders with: shot size (from the frame height at the
  subject: extreme close-up < 0.3 m, close-up < 0.7, medium close-up < 1.1,
  medium < 1.7, medium-full < 2.6, full < 3.6, wide < 9, else extreme wide),
  lens, camera height word and tilt; who is in frame from screen-left to
  screen-right; per character the frame position (centre, left/right of
  centre, left/right, far left/right), foreground / middle / background,
  distance from camera, pose, body facing relative to the camera, head turn,
  and who they look at (head within 22°); per pair who is screen-left, the
  distance and their relation (facing each other, back to back, one faces the
  other, at an angle); who is not in frame; set boxes in frame.
- **Prompt integration.** When the scene has a layout, each shot in the image
  prompt request, the LTX and Kling video prompt requests (`spatial_layout`
  field) and the H3 request (`spatial_layout:` block) carries that text, with
  the binding `SPATIAL_RULE`: stage the frame exactly so, never move or turn a
  character otherwise, keep positions consistent across shots, never mention
  the figure colours or the floor plan. Scenes without a layout are unchanged.
- **Continuity warnings** (`continuityWarnings`): a character named in a
  shot's text but not in frame; two characters swapping screen sides between
  consecutive shots (the line was crossed); a character more than 3 m from
  where the previous shot left them.
- Closing the window saves the open shot's camera view (JPEG, ≤ 480 px wide)
  as `view` in its layout. The agent's `storyreel_review_shot` returns it as
  "INTENDED COMPOSITION" and the description as `expected.spatialLayout`.

**Conventions.** Metres on the floor; x to the right, z toward the viewer of
the default camera. A body at `rot` 0 faces +z; 90 faces +x. Head turn is
added to `rot` (positive = the character's own left). The camera orbits its
target: `yaw` 0 is the +z side, `pitch` raises it, `dist` is the distance.
Vertical field of view: `2·atan(sensorH / 2f)` with a 36 mm long side
(`sensorH = 36 / aspect` for landscape, 36 for portrait). Head-top heights:
standing 1.8, sitting 1.4, lying 0.35, jumping 2.4.

**Data model.** `project.sceneLayouts[sceneId] = { props: [{ id, label, x, z,
w, d, h, rot }], shots: { [shotId]: { chars: { [characterId]: { x, z, rot,
head, pose } }, camera: { tx, ty, tz, yaw, pitch, dist, lens }, view? } } }` —
default `{}`, normalised as an object in `migrateProject`. Values are clamped
on read (`normalizeChar`, `normalizeCamera`, `normalizeProp`).

**Files.**
- `src/lib/spatial/layout.js` (new): constants (`CHAR_COLORS`, `POSES`,
  `LENSES`, `POSE_TOP`, `MAX_PROPS`), normalisers, `sceneCast`,
  `layoutFor` (inheritance), `hasLayout`, `cameraPosition`, `verticalFov`,
  `aspectValue`, `forwardOf`.
- `src/lib/spatial/describe.js` (new): `cameraFrame`, `analyse`,
  `describeShot`, `continuityWarnings`.
- `src/lib/spatial/scene3d.js` (new, three.js): `createSpatialView` —
  floor, figures, boxes, labels, camera gizmo (layer 1, editor only), two
  renderers; `setLayout`, `resize`, `pick`, `floorPoint`, `orbitBy`,
  `panBy`, `zoomBy`, `snapshot`, `dispose`. Unlit materials with fixed
  shades per face; face textures drawn on canvases.
- `src/lib/spatial/build.js` (new): `layoutPrompt`, `layoutFromModel`.
- `src/components/SpatialModal.jsx` (new).
- `src/lib/prompts.js`: `SPATIAL_RULE`, `spatialOf`, `anySpatial`, and
  the four builders.
- `src/stages/Stage4.jsx`, `src/stages/Stage5.jsx`: the buttons and the modal.
- `src/lib/agent/api.js`: the intended-composition image and
  `expected.spatialLayout` in `reviewShot`.
- `src/lib/storage.js`: `sceneLayouts`.
- `src/styles.css`: `.sp-*` classes, `.has-layout`.
- `package.json` / `package-lock.json`: new dependency `three` ^0.170.0
  (the main bundle grows from about 0.9 MB to 1.5 MB).
- i18n: `sp.*` (window, poses, camera, report, warnings) and `tip.sp*`.

**Verified.** In the dev app: the description and warnings for a hand-made
layout; a model answer turned into a layout (name matching, kept positions,
aim-at); the description present in the image, H3, LTX and Kling prompt
requests; the window opened from Stage 4 and Stage 5 with both views drawing
(camera view at 1.78 for a 16:9 project); selecting, pose, direction, aim,
lens, "Use previous", inheritance, the saved view, and "Rebuild layout"
through a stubbed model. Dragging a figure with the pointer was exercised
only for the orbit path. No real model run: how well the text model places a
scene, and how closely the image and video models follow the description,
are untested.

**Open.**
- Portrait (9:16) framing words use the same thresholds as landscape.
- No start/end pair per shot (the user chose one layout per shot), no
  elevation for platforms or stairs, no pan of the camera target in height by
  dragging.
- Agent tools to read or change the layout were not requested and are not
  exposed (the description is in `review_shot` only).

---

## 4. Spatial layout: whole-scene cast, presence per shot, optional tool

**Request.** A bug: a scene opens with a shot describing one character, two
more appear in the third shot and another later; the layout must account for
all characters across all shots, present in some and absent in others. Make
the tool optional with a switch that is off by default. Put the icon that
opens the layout into the individual shot's interface at Stage 5.

**Behaviour.**
- **Cast of the scene.** `sceneCast` now holds everyone named in ANY shot of
  the scene (action, dialogue, notes), the scene title and summary, plus the
  members of a named group. Name matching (`mentions`) accepts the whole name
  or any word of it at a word start; Cyrillic words are matched by stem (the
  word minus its last two letters, at least three), so inflected forms count.
  If nobody is matched, the whole cast is used. Still at most 6.
- **Editing the cast.** In the window, "+ Character" (a select next to the
  chips) adds anyone from the story's cast; "Remove from scene" on a selected
  character removes them from the layout in every shot. Either action stores
  an explicit list (`cast`) for the scene, which then replaces the automatic
  one. "Rebuild layout" keeps that list.
- **Presence per shot.** Each character's per-shot state has `off` (absent).
  The selected character has an "In this shot" checkbox. An absent character
  is not drawn in either view, has a dimmed dashed chip, takes no part in the
  measurements or the flip / jump warnings, and is listed in the description
  as "Not in this shot at all (do not show them): …". A present character
  outside the frame is now worded "Present but outside the frame: …".
- **Inheritance is per character** (`layoutFor`): each character continues
  from the nearest earlier shot whose entry places them; one placed only in a
  later shot is absent until then, shown at that later position; one never
  placed (for example added to the cast after the layout was made) stands in
  the default row and is absent until a shot's text first names them. Before
  this, a character missing from a shot's entry fell back to the default row
  and was shown. The camera still comes from the nearest earlier shot entry.
- **Build layout.** The request lists every cast member with the shot that
  first names them and requires every character in every shot with
  `"present": true | false` (false = not arrived yet or gone; position = where
  they enter or left). `layoutFromModel` stores `off`; `aim_at` ignores an
  absent character.
- **New warning** `absentNamed`: a character named in a shot's text but
  marked absent from it.
- **Optional tool.** `project.useLayout` (default false). Project settings has
  a "3D spatial layout" section with the checkbox "Use the 3D layout in this
  project". When off: no Layout button at Stage 4, no cube buttons at Stage
  5, `describeShot` returns '' (so no prompt request carries a layout),
  `continuityWarnings` returns [], and the agent's `review_shot` omits the
  intended-composition image. Stored layouts are kept and return when the
  switch is turned on. **Projects that already have layouts start with the
  tool off** until it is switched on.
- **Shot card (Stage 5).** A cube icon button in the shot card header, before
  the style chips, opens the window on that shot (accent-coloured when the
  scene has a layout). The scene-tools cube button remains and opens on the
  focused shot.

**Data model.** `project.useLayout: boolean`.
`project.sceneLayouts[sceneId].cast?: characterId[]` (explicit cast; absent
= automatic). Character state gains `off: boolean`.

**Files.** `src/lib/spatial/layout.js` (`layoutEnabled`, `mentions`,
`autoCastIds`, `sceneCast`, `namedInShot`, `normalizeChar`, `layoutFor`),
`describe.js`, `scene3d.js`, `build.js`, `src/components/SpatialModal.jsx`
(`writeCast`, presence checkbox, add / remove), `ProjectSettingsModal.jsx`,
`src/stages/Stage4.jsx`, `src/stages/Stage5.jsx` (`showLayout` is now
`null | { shotId }`), `src/lib/agent/api.js`, `src/lib/storage.js`,
`src/styles.css` (`.sp-chip.absent`, `.sp-add-char`, `.sp-present`,
`.shot-layout`). i18n: `pset.layout`, `pset.layoutHint`, `pset.layoutOn`,
`tip.psetLayout`, `tip.spOpenShot`, `sp.present`, `tip.spPresent`,
`sp.absentTip`, `sp.removeChar`, `tip.spRemoveChar`, `sp.addChar`,
`tip.spAddChar`, `sp.warn_absentNamed`.

**Verified.** In the dev app: a four-shot scene with one character in shot 1
(inflected Cyrillic name), two entering in shot 3 and one in shot 4 gives a
cast of four, present 1 / 1 / 3 / 4 from a model-shaped answer and from a
hand layout with partial entries; the description lists the absent ones; the
switch is off by default and hides the buttons and the description; with it
on, the shot-card icon opens the window on that shot; adding a character,
ticking / unticking "In this shot", the earlier shots showing them absent,
and the new warning. No real model run of "Build layout" with the presence
flag.

**Open.** A shot card (and so its icon) appears at Stage 5 as before, only
for the focused shot. Removing a character does not delete their stored
positions, so adding them back restores them.

---

## 5. Stage 4: character names verbatim from the Stage 2 cards

**Request.** In the shot descriptions of Stage 4, use the English versions of
the names, exactly as they appear on the character cards from Stage 2.

**Behaviour.** `stage4Prompt` has a new requirement, CHARACTER NAMES: in
"action", "dialogue" (speaker prefixes and names spoken inside lines) and
"notes" every character and group name is written exactly as on the card —
same English spelling in Latin letters — and is never translated,
transliterated into another script, shortened, declined or inflected,
whatever the script language. The names (characters, then groups) are listed
in the rule. Before, a Russian or Ukrainian breakdown could write a name in
Cyrillic or in an inflected form, which also broke name matching elsewhere
(the spatial layout's cast, the continuity checks).

**Files.** `src/lib/prompts.js` (`stage4Prompt`). No data or i18n change.

**Verified.** The rule and the name list appear in the built request. Not run
against a real model. Existing shot breakdowns are not rewritten — recreate a
scene's shots to apply it.

**Open.** Only Stage 4 was asked for; the Stage 3 outline and the "edit with
AI" requests rely on the general system rule (names in Latin letters) only.

---

## 6. Spatial layout: rebuild one shot

**Request.** An option in the 3D layout window to recreate the scene for an
individual shot.

**Behaviour.** A "Rebuild shot" button in the window's top row, left of
"Build layout / Rebuild layout". It asks the text model to place the
characters and the camera again for the open shot only. The request
(`shotLayoutPrompt`) reuses the planner's system rules and the scene / cast /
shot list, and adds as fixed facts the set boxes and the current layout of
the previous and the next shot (positions, facing, pose, presence, camera),
with the instruction to stay continuous with them. The answer
(`shotLayoutFromModel`) replaces that shot's entry (`chars`, `camera`; its
saved `view` is dropped and re-saved on close); a character the model leaves
out keeps the state they had in the shot. Other shots, the set boxes and the
cast list are untouched. If the shot already has its own layout a
confirmation is asked first. Both build buttons are disabled while either
runs; `busy` is now `false | 'all' | 'shot'`.

**Files.** `src/lib/spatial/build.js` (`shotLayoutPrompt`,
`shotLayoutFromModel`), `src/components/SpatialModal.jsx` (`buildShot`).
i18n: `sp.rebuildShot`, `tip.spBuildShot`, `sp.buildShotConfirm`.

**Verified.** In the dev app with the model call stubbed: the request text,
and the button replacing shot 2 only (new pose, camera and presence shown in
the chips and the description; shots 1 and 3 unchanged). No real model run.
The top row's fit with two buttons was not checked visually (it wraps if the
window is narrow).

**Open.** Shots after the rebuilt one that have their own entries are not
adjusted; a continuity warning appears if the new staging breaks with them.

---

## 7. Character names enforced on the model's answer

**Request.** The Stage 4 shot generator still wrote character names in
Cyrillic after section 5. A strict rule: only the original English names,
everywhere, exactly as on the Stage 2 cards.

**Behaviour.** The instruction alone was not obeyed, so the names are now
enforced on the answer itself (`src/lib/names.js`), in two passes:
1. **Deterministic.** Every capitalised Cyrillic word (or word in capitals,
   e.g. a speaker prefix) that reads as a form of a card-name word is replaced
   by that word as written on the card. Matching: transliteration to Latin, a
   phonetic key for both sides (dzh/zh → j, sh, ph → f, th → t, ch/ck/c/q →
   k, soft c → s, w → v, y → i, z → s, h dropped, doubles collapsed; a second
   key with soft g; a third for J + vowel names read as Ю/Я), then either
   "starts with the name's stem and the rest is a case ending" or, for names
   with three or more consonants, an equal consonant skeleton. Examples that
   pass: Анну / Анной / Аня → Anna, Бориса / Борисом → Boris, Джона /
   Джонові → John, Майкл → Michael, Сарой → Sarah, Юля / Юлии → Julia,
   Алису → Alice, БОРИС: → Boris:.
2. **Model check for what is left.** Capitalised Cyrillic words still in the
   answer (three letters or more; words in capitals only as speakers) are
   sent in one small request (`namesRepairSpec`) with the card names; the
   model answers, per word, the matching card name or null (place, brand,
   ordinary word). Accepted values must be a card name or one of its words.
   Named words are then replaced everywhere. This catches translated or
   national forms the first pass cannot read (Ганна → Anna, Олена → Elena).
   Verdicts are remembered per cast for the session (module-level map), so a
   word is asked once. If the check request fails, pass 1's result is kept.
- **Where.** `generateJSON` runs it for any request whose spec has
  `names`. `cardNames(project)` (characters, then groups) is attached to
  `stage4Prompt`, `stage3Prompt` (both forms), `seriesArcsPrompt` and
  `seriesEpisodesPrompt`. Stage 2 creates the cards and is not covered; the
  Stage 5 prompts are English already.
- **Input.** `stage4Prompt` also runs pass 1 over the synopsis, the scene
  outline and the scene's title / summary it sends, so an older Cyrillic
  spelling there no longer leads the model.
- **System rule** (all script requests) reworded: names exactly as listed,
  never translated, transliterated, shortened, declined or inflected, with an
  example.

**Cost.** Up to one extra small text request per answer, only while new
capitalised Cyrillic words keep appearing (sentence openers are included, so
expect it on most Russian / Ukrainian Stage 3–4 runs; none for English).

**Files.** `src/lib/names.js` (new: `latinNames`, `enforceNames`,
`namesRepairSpec`), `src/lib/claude.js` (`generateJSON`),
`src/lib/prompts.js` (`cardNames`, `names` on four builders, input
cleaning, system rule). No data or i18n change.

**Verified.** In the dev app: the pass-1 examples above, non-names left alone
(Москву, Олегом, «Волга», Сыр, Вера в победу, Марка автомобиля), and the full
path through `generateJSON` with stubbed model answers (replacement, the
check request, no second request on a repeat). Not run against a real model.

**Open.**
- Pass 1 can replace an ordinary sentence-opening word that happens to read
  as a form of a name (a character called Vera and "Верю…"; Mark and
  "Марка…" when the stem and ending fit). Not seen in the tests, possible.
- Names with non-Latin card spelling are not handled (cards are expected in
  English). Existing shots are not rewritten — recreate them.
- The "edit with AI" requests do not carry `names`.
