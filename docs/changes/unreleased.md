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
