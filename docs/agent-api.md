# StoryReel agent access

StoryReel can be operated by an AI agent — Claude Code or any program that can
make HTTP requests. The agent runs the stages, creates frames and videos,
checks each result, fixes what it can and flags what it cannot.

The agent drives the open desktop app: you see every step in the window, and
you can stop it at any time by closing the app or turning the access off.

## Turning it on

1. Settings → Interface → **Agent access** → tick "Allow an AI agent to operate
   the app" → Save. (Desktop app only; off by default.)
2. Open Settings again: the block now shows "Listening on port 47821" and a
   command. Copy it and run it once in a terminal:

   ```
   claude mcp add storyreel -- node "<path shown in Settings>/storyreel-mcp.mjs"
   ```

3. Start Claude Code and ask it, for example:

   > Use the storyreel tools. Read the guide, then make a 30-second film from
   > this idea: … Check every frame and video before moving on.

   or

   > Continue the StoryReel project "Harbour": finish the missing videos of
   > scene 2 and tell me what you flagged.

StoryReel must stay open while the agent works. The agent spends your API
keys and your GPU exactly as the buttons do.

## What the agent can do

| Tool | Purpose |
|---|---|
| `storyreel_guide` | The operating guide (pipeline, checks, fixes, rules). Read first. |
| `storyreel_status` | App version, open project, which services are configured. |
| `storyreel_list_projects`, `storyreel_create_project` | Find or start a project. |
| `storyreel_get_project` | The whole project as text, with what media each shot has. |
| `storyreel_update_project` | Title, plot, aspect ratio, and the script / image / video style. |
| `storyreel_list_styles` | The style library, to choose a look that fits the story. |
| `storyreel_run_stage` | Stages 1–4: ideas, storyline, outline, shot breakdown. |
| `storyreel_pick_idea` | Stage 1: approve one of the directions. |
| `storyreel_edit_script` | Edit one scene or shot directly. |
| `storyreel_smart_edit` | One instruction applied consistently across the project text. |
| `storyreel_create_prompts`, `storyreel_set_prompt` | Stage 5 prompts: written by the app, or supplied by the agent. |
| `storyreel_set_dynamics` | A shot's camera and dynamics settings. |
| `storyreel_create_media` | A shot's first frame, final frame, video or voice. |
| `storyreel_review_shot` | Evidence for checking a shot (see below). |
| `storyreel_flag`, `storyreel_list_flags` | Record and list problems for you. |
| `storyreel_render` | Render the assembled timeline. |

It cannot read or change API keys, add reference photos, delete projects, or
change app settings.

## How results are verified

`storyreel_review_shot` gives the agent two things.

**Measurements** (facts, computed by the app):

- video length against the shot's slot (`shortBy`);
- the video's own sound and the voice clip: duration, silence before and
  after, and `endsAbruptly` — sound still going when the file ends, which is
  how cut-off speech shows up;
- `voiceOverrunsShot` — the voice is longer than the shot and would be cut in
  the edit;
- optionally a transcript of what is actually said.

**Images to look at** (the agent judges these itself):

- the reference photos of the characters named in the shot;
- the location and asset references;
- the last frame of the previous shot;
- the shot's first and final frame;
- a numbered contact sheet of frames across the video.

From those it checks likeness to the references, that the action continues
the previous shot, that the environment and assets stay consistent, and that
there are no artifacts (cropped bodies, extra limbs, fused figures, frozen
video).

## Limits that are enforced

- **Four attempts.** Every generation the agent starts is counted per target —
  a stage, a scene's prompts, or a shot's frame / final frame / video / voice /
  prompt. The fifth is refused and the target is flagged automatically. A
  failed attempt (an API error, for instance) counts too.
- **One thing at a time.** While one generation runs, others are refused.
- **Order.** A video needs its first frame; a render needs every shot to have
  a video or a flag.

## Flags

A flag is a note attached to a shot, a scene or a stage: what is wrong, what
was tried, how many attempts were made. Kinds: likeness, continuity,
environment, audio, artifact, style, script, other.

Open flags show as a red flag button with a count in the project header, and
as a red dot on the shot's clip on the timeline. The list lets you jump to the
item and **Resolve** it; resolving also resets its attempt counter, so the
agent may work on it again.

## Using it without Claude Code

The MCP server is a thin bridge over a local HTTP API. Connection details are
in `agent.json` in the app's data folder (`%APPDATA%\StoryReel` on Windows):
`{ "url": "http://127.0.0.1:47821", "token": "…" }`.

```
GET  /health                     → { ok, result: { name, version } }
GET  /tools                      → { ok, result: [ { name, description, inputSchema } ] }
POST /call   { "method": "storyreel_get_project", "params": { "projectId": "…" } }
             → { ok: true, result } | { ok: false, error: { code, message } }
```

Every request needs `Authorization: Bearer <token>`. The server listens on
127.0.0.1 only and refuses requests that come from a web page.

Error codes: `ATTEMPT_LIMIT`, `BUSY`, `NOT_READY`, `NOT_FOUND`, `BAD_INPUT`,
`NO_KEY`, `GENERATION_FAILED`, `UI`, `APP_NOT_READY`, `TIMEOUT`,
`UNKNOWN_TOOL`.

## Added after 2.12.0: layout and shot tools

| Tool | What it does | Attempt |
| --- | --- | --- |
| `storyreel_duplicate_shot` | Stage 4: inserts a copy of a shot after it; returns `newShotId`. | no |
| `storyreel_get_layout` | The 3D layout of a scene or one shot: cast, set boxes, per shot the characters (position, facing, pose, present), camera, measured description, warnings. `image: true` adds the camera view of each shot. Read-only (allowed while another call runs). | no |
| `storyreel_build_layout` | The text model builds the layout for a scene (`sceneId`) or re-plans one shot (`shotId`). Error `LAYOUT_OFF` when the project's layout switch is off. | yes (`scene:<id>:layout` / `shot:<id>:layout`) |
| `storyreel_set_layout` | Hand edit: scene `cast` and `setBoxes`; per shot `characters` (partial), `camera` (partial, `aimAt`), `usePrevious`. | no |

`storyreel_update_project` accepts `useLayout` (boolean). `storyreel_get_project`
returns `useLayout` and, when it is on, `hasLayout` per scene. Build and set
save each changed shot's camera view (rendered off-screen), which
`storyreel_review_shot` returns as the intended composition.

Units for the layout tools: metres; `facingDeg` 0 = toward +z, 90 = +x;
`yawDeg` = the camera's place around its target (0 = +z side);
`elevationDeg` positive = looking down; `lensMm` one of 18, 24, 35, 50, 85.

## Added in 2.16: engines in status, parts

- `storyreel_status.services`: `image` now reads "gemini (<model name>)", "krea (<model>)" or "comfyui (Flux.2 Klein, local)"; `videoEngine` reads "minimax (H3 local, <steps> steps)", "ltx (local)", "kling (<model>)" or "krea (<model>)"; `kreaKeySet` added.
- `storyreel_get_project`: `partOf` on a part project, `parts` on an original that was split.
- `storyreel_split_project { projectId, cutAfter?: [sceneNo…], every?: n }` — Stage 3 split into part projects (see the guide, "Parts"). No attempt counted.

## Added in 2.16: the short-drama engine

| Tool | What it does | Attempt |
| --- | --- | --- |
| `storyreel_drama_rules` | The conventions as data (hooks, timing grids, dialogue limits, landmarks for this project); `brief: true` adds the full text brief. Read-only. | no |
| `storyreel_drama_check` | Score, per-episode metrics and issues (level, code, episode / scene / shot). Read-only. | no |
| `storyreel_drama_fix` | `mechanical: true` → em dashes fixed project-wide; `sceneId` → the model rewrites that scene's shots against the issues, shot count and order kept. | scene rewrite: `scene:<id>:drama_fix` |

`storyreel_update_project` accepts `dramaStyleId`; `storyreel_list_styles` has the `drama` category; `storyreel_get_project` returns `shortDrama` (sub-genre, landmarks, the plan's hook types / turns / questions) and `beat` on scenes and shots; `storyreel_review_shot` returns `expected.shortDrama`.

## Added in 2.16: assets and environments

| Tool | What it does | Attempt |
| --- | --- | --- |
| `storyreel_assets` | Asset cards (name, type, description, reference images, name problems, shots that name them) and the scenes' locations with photo counts. Read-only. | no |
| `storyreel_set_asset` | Create / edit / delete a card. | no |
| `storyreel_asset_image` | Render the card's reference image from its description in the story's world. | `asset:<id>:image` |
| `storyreel_find_assets` | The text model lists the story's key objects as new cards. | `stage:find_assets` |
| `storyreel_sync_assets` | Attach assets to the shots whose text names them. | no |

`storyreel_create_project` accepts `episodeSeconds` (60 / 90 / 120); `storyreel_get_project` returns `assets`; `storyreel_review_shot` returns `expected.assets` / `expected.environments` and labelled reference images; flag kind `asset` added.

## Added in 2.16: the edit (transitions, subtitles), location references, logs

| Tool | Purpose | Attempt |
|---|---|---|
| `storyreel_transitions` | Every boundary: the effective transition, the override, the automatic choice from the shots' text and its reason, the tail slack a fade needs. | no |
| `storyreel_set_transitions` | Set the transition into the next shot per boundary ({ items: [{ shotId, type }] }), or write the automatic choice everywhere ({ auto: true }). | no |
| `storyreel_subtitles` | The subtitle layer: default look and every block. | no |
| `storyreel_set_subtitles` | Make blocks from the dialogue ({ auto }), set the look ({ style }), add / edit / remove blocks (custom text by x / y), clear. | no |
| `storyreel_location_image` | A location's reference image from the scene text, in the project's image style. | yes |
| `storyreel_create_media` kind `location_ref` | The location reference cut from a shot's approved first frame (people removed, widened). | yes |

`storyreel_create_media` returns `shotExtendedTo` when the shot grew to hold
its sound, and `voiceSec` for a voice; a spoken shot on the local engine needs
its voice before its video. `storyreel_edit_script` rounds a duration up and
returns `warnings` when the video is shorter than the new slot or the voice
longer. `storyreel_review_shot` adds `environmentNote` when the location has
no reference. `storyreel_get_layout` warnings gain `lineCross` and `setFlip`.
`storyreel_status` returns `appLogFile`; every writing call is logged there.

`storyreel_run_stage` 4 takes `mode` "normal" | "extended" (extended shots: 2–3
camera changes in one H3 take; the sub-shots come back as consecutive shots
grouped in a take, `breakdownMode` on the project). On MiniMax H3
`storyreel_create_media` kind `voice` is refused: the lines are in the video
prompt and the model speaks them.

| `storyreel_h3_rules` | The MiniMax H3 prompt brief (three fields, <d>[English] …</d> direct speech, internal cuts, keyframe format, take / reference conventions). | no |

## Added after 2.16: the "Short Drama 2" engine

A series project carries `dramaEngine`: `"v1"` (Short drama, the craft-guide
engine, default) or `"v2"` (Short Drama 2, the production-manual engine:
hook / friction / turn / spike / button beats, six rotating cliffhanger types,
the paywall as the last free episode, 135 words a minute, one subject per
frame, prompts written for MiniMax H3 and Nano Banana 2.1).

- `storyreel_create_project` accepts `dramaEngine` (series only).
- `storyreel_drama_rules` returns `engine`, `engineLabel`, `hookTag`
  (`HOOK · TYPE` / `CLIFF · TYPE`) and the engine's own beats, hook types,
  limits, timing grids, landmarks and (`brief: true`) briefs.
- `storyreel_drama_check` reports with the engine's beat names and limits
  (`engine` in the report); v2 adds `long-speech` (a speaking mouth on
  screen for more than 5 s of one line) and `locations-series` (more than
  three locations across the series); `scene-opens-dialogue` applies to
  every scene in v1 and to the later scenes of an episode in v2.
- `storyreel_get_project` → `shortDrama.engine`; `storyreel_review_shot` →
  `expected.shortDrama.frame` is the engine's frame summary.
