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
