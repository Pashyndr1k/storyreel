# Unreleased (after 2.15.0)

Base: tag `v2.15.0` (commit `4797b44`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. Stage 3: split a project into parts of any size

**Request.** On Stage 3, make it possible to split a project into parts with
any number of scenes each.

**Behaviour.** Below the scene outline (any project with two or more scenes,
including inline series) a "Split into parts" panel:
- a strip of scene numbers with a scissors button in every gap — a click
  cuts there (accent when active), a second click removes the cut; cuts are
  stored in `project.splitCuts` (0-based scene indices after which a part
  starts);
- "Every N" sets cuts after every N scenes (the last part takes the rest);
  "Clear cuts";
- the parts the cuts define, as rows: "Part k · scenes a–b", scene count,
  total duration, and "Open" once created or "not created";
- "Create parts (n)" (confirmation) creates one project per part that does
  not exist yet, recorded in `project.parts` [{ from, to, projectId, title }];
  a part whose project was deleted counts as not created again. The original
  project is not changed.
- A part project (`buildPartProject`) is a clone of the original trimmed to
  its scenes: outline, `sceneDetails`, `sceneLayouts`, every per-shot map
  (prompts, frames, versions, videos, audio, pads, assets, locations,
  durations, modes, seeds, engines, camera / dynamics, voice sources, speaker
  notes, references, takes, keyframes, trims), the dynamics plan reduced to
  its scenes (scene numbers restart at 1, block timestamps at 0, durations
  recomputed), agent flags and attempts for kept shots / scenes. Storyline,
  cast with photos, styles, aspect ratio, cover and settings are copied;
  the assembly's audio lanes start empty (their clips are timed against the
  whole film). Title "<original> · Part k/m"; `partInfo` { parentId,
  parentTitle, index, total, from, to } shows a context box at Stage 3
  ("part k of m · scenes a–b of the original"). The part keeps the
  original's stage.

**Data model.** `project.splitCuts: number[]`, `project.parts: [{ from, to,
projectId, title }]`, `project.partInfo: object | null`; normalised in
`migrateProject`.

**Files.** `src/lib/split.js` (new: `normalizeCuts`, `planParts`, `cutsEvery`,
`buildPartProject`), `src/stages/Stage3.jsx` (panel, helpers, context box;
takes `addProjects` / `openProject` / `projectExists`), `src/lib/storage.js`,
`src/styles.css` (`.cut-strip`, `.cut-scene`, `.cut-gap`). i18n: `split.*`
(title, hint, cutTip, uncutTip, every, everyTip, clear, clearTip, create,
createTip, confirm, partLabel, partRange, sceneCount, notCreated, open,
openTip, partOf, partHint).

**Verified.** In the dev app on a 4-scene project with shots and media on
scenes 1 and 3: `planParts` / `cutsEvery` / `normalizeCuts`; part projects carry
only their scenes' shots, prompts, frames, videos, seeds, layouts, attempts,
and a renumbered pacing plan, empty audio lanes; the panel — cuts toggled
in the strip, the preset, the part rows, "Create parts (2)" creating two
projects ("Split Test · Part 1/2", "· Part 2/2") listed with the right
scenes and cast, rows turning to "Open", the button disabling. Not checked:
the context box on a part (its project opened at its stage, 5).

**Open.** Parts are independent copies: later edits in the original do not
flow into them. Series masters keep their own episode split (Stage3Series).

---

## 2. Agent API brought up to date (engines, parts, split tool)

**Request.** Has the MCP been updated for the amendments of the latest
versions? Audit and catch-up.

**Audit.** Covered already: 3D layout (get / build / set, `useLayout`),
duplicate shot, seed replay (`create_media seed`), enforced names (automatic
in `run_stage` 3 / 4), layout views in `review_shot`. Gaps found and closed:
- `storyreel_status.services` ignored Krea (reported "gemini" for the Krea
  image service) and named no models: `image` now reads "gemini (Nano Banana
  2.1)", "krea (<model>)" or "comfyui (Flux.2 Klein, local)"; `videoEngine`
  "minimax (H3 local, <steps> steps)", "ltx (local)", "kling (<model>)" or
  "krea (<model>)"; `kreaKeySet` added.
- `storyreel_get_project`: `partOf` on a part project, `parts` (scenes,
  projectId, title) on a split original.
- New `storyreel_split_project { projectId, cutAfter?: [sceneNo], every?: n }`
  — the Stage 3 split (section 1) for the agent; existing parts are
  skipped; stores `splitCuts` / `parts` like the UI. No attempt counted.
  Errors: `NOT_READY` (< 2 scenes), `BAD_INPUT` (no usable cuts).
- Guide: new sections "Engines, quality and cost" (engines are the user's
  choice and not changeable by the agent; 8 / 4-step H3 is preview quality;
  when to replay a seed; cloud cost) and "Parts". `docs/agent-api.md`
  appended. 24 tools in total. The MCP bridge needs no change (it reads the
  tool list from the app) — restart the app and reconnect.
- Not exposed on purpose: changing engines, models, H3 steps or keys.

**Files.** `src/lib/agent/api.js`, `agent/AGENT_GUIDE.md`, `docs/agent-api.md`.

**Verified.** In the dev app through `window.__storyreelAgent`: status
strings, `parts` / `partOf`, `BAD_INPUT` without cuts, a split with
`cutAfter: [1]` creating two projects, a repeat creating none, 24 tools.
Not run through the MCP bridge.

---

## 3. Series: production projects of any size (episode strip removed again)

**Request.** Split the main (series master) project into smaller projects
with any number of episodes each — the "Episodes per project" select was
limited to 5–10. A first version also added an episode strip with scissors
to cut between any two episodes; the user then asked to remove that block
and its functionality.

**Behaviour** (Stage 3 of a series master, "Split into projects"):
"Episodes per project" offers 1 … all episodes. `planSegments` divides each
section into round(len / N) near-equal projects, so a project never
straddles a section boundary (closes on an intermediate finale); N ≥ total
gives one project. The old 5–10 clamp and the merge-short-sections rule are
gone (`SEGMENT_MIN` 1, `SEGMENT_MAX` = the series maximum,
`clampSegment(n, total)`). Creating projects is unchanged. No episode strip,
no hand-made cuts (`seriesPlan.cuts` is not read; a value left by the
interim build is ignored).

**Files.** `src/lib/series.js` (constants, `clampSegment`, `planSegments`),
`src/stages/Stage3Series.jsx` (select 1 … all). i18n: reworded
`ser.splitHint`, `tip.serSegSize`, `ser.prodHint`.

**Verified.** In the dev app on a 6-episode master with two sections (1–3,
4–6): every 1 → six projects, every 4 → 1–3 / 4–6 along the sections, N ≥
total → one; creating two projects. The scene-level split of section 1
(which has its own cut strip) is unchanged.

---

## 4. Assembly: Render on the right, minutes past two, episodes for a series

**Request.** At Stage 5 (assembly): move the Render button to the right side
of the frame; show the total film length in minutes once it is above two
minutes; for the short-drama template add an episode selector to the Render
button to render by episodes (1.5–2 min each).

**Behaviour.**
- The control row keeps Play, Auto queue, Background music, Sound FX and the
  icon buttons on the left; a spacer pushes **Render** to the right end, with
  the render progress badge and Cancel beside it while rendering.
- The timecode "elapsed / total" switches to `m:ss.s` for both numbers once
  the film is longer than 120 s (e.g. `1:05.3 / 12:40.0`); below that it stays
  in seconds.
- When the project's scenes carry episode numbers (a series part or an inline
  series — the short-drama template), a select stands before Render: **Whole
  film** (the active segment, as before), **All episodes (n files)** (when
  there are at least two), and **Episode n · m:ss** per episode. Episodes are
  the time windows of their scenes in timeline order (`episodes`). One
  episode renders `<title>-epNN.mp4`; "All episodes" renders each in turn
  (progress badge "Episode n k/m · p%", Cancel stops the sequence) and ends
  with one toast naming the folder. The ffmpeg path was refactored into
  `renderWindow(rIn, rOut, suffix)` + the `doRenderFfmpeg` loop; the in-browser
  canvas fallback is unchanged (whole film / active segment only).

**Files.** `src/stages/Stage6.jsx`, `src/styles.css` (`.render-target`). i18n:
`s6.renderWhole`, `s6.renderAll`, `s6.renderEp`, `s6.renderEpLabel`,
`s6.renderedEps`, `tip.renderTarget`.

**Verified.** In the dev app (no ffmpeg there): the row with Render at the
right end, the timecode in minutes on a 3-minute timeline, the episode
select on a project whose scenes carry episode numbers (options and the
episode lengths), the chosen target reaching the render targets list with
the right windows and suffixes (checked through a stubbed `ffmpegBridge`).
Not run with the real ffmpeg render in the desktop app.

---

## 5. The short-drama engine (scriptwriting mechanism for the genre)

**Request.** Overhaul the video-creation process for the short-drama genre
after the "Short Drama Production Craft Guide" (2026) and its references:
not a narrative template but a scriptwriting mechanism that knows the
genre's conventions at every stage — the opening (first 3–5 s), the end of
each episode, dialogue style, cliffhangers, plot progression including the
hook that drives the transition to the paid part after the first quarter;
scripts optimised for timing and action, later turned into model prompts.
Also: the randomization and non-standard plot tools must work with it.

**Sources distilled** (the guide + SceneMixer, OutlierKit, Lollipop, the
short-drama toolkit, the vertical-showrunner and open-drama skills,
clipcurator's episode sheet, hamlog's 15-second cuts; js-mark's document
chain). Everything prescriptive lives as data and text in
`src/lib/shortDrama/rules.js`:
- `isShortDrama(project)` = every series project (the "Short drama" template).
- `DRAMA_CORE`: the brief — the dramatic unit (excavate, not compress), the
  0–3 s opening formula (ordinary state + disruption + unanswered
  question), progression (options lost, a turn every ~30 s, a shift every
  15 s), the three hook types with rotation and the fixed hooks of episodes
  1–5, the season engine (first trap, antagonist and stakes, first
  reversal, first win by episode 5, the PAID CHECKPOINT after the first
  quarter, mid-season betrayal, a climax that forces a choice between two
  values, the finale answering the opening humiliation before the same
  witnesses), the plot mechanisms table, villains who err on screen,
  characters as pressure functions with playable profiles, the dialogue
  rules (< 20 words a line, < 40 an action block, ~3 words/s, 18–25 lines,
  no em dashes, no voice-over / inner monologue, on the nose about stakes
  and never about shown emotion), the vertical frame and the AI-generation
  constraints (≤ 4 locations, no crowds / fights / readable text).
- `DRAMA_STAGE`: stage-specific instructions (ideas, storyline, arcs,
  episodes, outline, shots); `DRAMA_FRAME_RULE` for the image / video
  prompt writers; `seasonLandmarks(total)` (first win ≤ 5, first reversal ≈
  16 %, paid checkpoint = round(total / 4) ≥ 3, betrayal ≈ 50 %, climax ≈
  96 %); `timingGrid(sec)` (the guide's 60 / 90 / 120 s grids, scaled);
  `dramaRulesSummary(project)` for tools.
- `prompts.js`: `dramaSystem(lang, scriptStyle, project, stage)` builds the
  system prompt of every series stage = the base rules + DRAMA_CORE + this
  series' landmarks + the sub-genre brief + the stage block. The legacy
  "Short Drama Series" script style is skipped (the engine supersedes it);
  any other script style still applies. Builders: Stage 1 (series) — four
  directions each with labelled lines Trope / Opening (0–3 s) / Episode 1
  trap / First win (ep N) / Quarter hook (ep N) / Season promise inside the
  pitch; Stage 2 — the synopsis as the season spine and each character a
  production profile (want, method, leverage, shame trigger, speech rhythm,
  physical strategy, motif); sections — one must end exactly at the paid
  checkpoint (12+ episodes); episodes — new fields `goal, main_conflict,
  power_start, power_end, turns[], hook_type, cliffhanger_question,
  first_action_next`, hook rules per chunk (fixed types for 1–5, "not the
  previous episode's type", the first win, the paid checkpoint, the
  betrayal when inside the chunk); outline — scenes carry a `beat` (open /
  orient / turn / squeeze / reversal / cliff), the first scene of an
  episode opens inside the disruption, the last ends on the hook; shots —
  the scene's position in its episode (first / middle / last), the
  episode's timing grid, the planned turns and hook, shot 1 ≤ 5 s with the
  conflict visible, the last shot a hook frame whose notes end with
  "HOOK · TYPE", every shot a `beat`. Image / video prompt writers and the
  smart edit get the frame rule / the engine through `withDrama` wrappers
  (`stage5Prompt`, `stage5VideoPrompt`, `stage5H3VideoPrompt`,
  `stage5KlingVideoPrompt`, `finalFramePrompt`, `smartEditPrompt`).
- **Randomization.** Stage 1's plot randomization (oblique constraints,
  auteur lens, genre mashup, forced variance) stays on for series; when any
  method is active a bridge rule (`DRAMA_RANDOM_BRIDGE`) tells the model the
  directives shape the execution inside the format and never remove the
  trope, the episode unit, the hook rotation or the dialogue rules. The
  auteur persona still replaces the showrunner persona; the engine's rules
  stand above both.
- `series.js`: `episodeLine` carries turns, the hook label, the open question
  and the next episode's first action (so parts and the next chunk see
  them).
- **Genre check** (`src/lib/shortDrama/check.js`): `checkProject(project)` —
  the plan (hook missing / repeated / unexpected for 1–5, cliffhanger
  missing, paid-checkpoint episode on an emotion hook, no first win in
  1–5), per episode (length vs target, scene count, first / last scene
  beats, locations > 4, opening shot > 5 s or without visible disruption,
  action blocks > 40 words, voice-over / inner monologue, lines > 20 words,
  em dashes, flat runs > 15 s without a marked shift, turns < 1 per 30 s,
  speakable density, the hook tag on the last shot); a score (100 − 8 per
  error − 3 per warning); per-episode metrics. `autoFixProject` replaces
  em dashes in dialogue with full stops (capitalising the next word).
  `DramaCheckModal` ("Genre check" button at Stage 3 (series plan and
  outline) and Stage 4) shows metrics, issues by episode, "Fix em dashes".
- Stage 3 (series plan): each episode row has a hook-type selector
  (Identity / Emotion / Realisation), the open question, and badges "Paid
  checkpoint" and "First win here" on the landmark episodes.
- Data model: `seriesPlan.episodes[]` gain `hookType, goal, mainConflict,
  powerStart, powerEnd, turns, cliffhangerQuestion, firstActionNext`;
  scenes and shots gain `beat`; `project.dramaStyleId` (see 6).

**Files.** `src/lib/shortDrama/rules.js`, `src/lib/shortDrama/check.js`,
`src/components/DramaCheckModal.jsx` (new); `src/lib/prompts.js`,
`src/lib/series.js`, `src/lib/storage.js`, `src/stages/Stage3.jsx`,
`src/stages/Stage3Series.jsx`, `src/stages/Stage4.jsx`, `src/styles.css`.
i18n: `drama.*` (check modal, hooks, badges).

**Verified.** In the dev app, by building the prompts for a 40-episode
series: the engine and the stage block in Stage 1 with two randomization
methods active and the bridge present; the legacy brief skipped; the
sub-genre brief present; the landmarks line (win ≤ 5, reversal ≈ 6,
checkpoint 10, betrayal 20, climax 38); plain (non-series) prompts
untouched; the episode prompt for 1–5 with the fixed hooks and the first
win, for 9–10 with the previous hook and the checkpoint; the sections rule
at episode 10; Stage 4 for a first and a last scene (position, grid, hook
line, turns, beat schema); the frame rule on image prompts for a series
only; the check on a seeded part (opening too long, em dash, voice-over,
few turns, missing hook tag…), the em-dash fix; the Stage 3 hook row with
the open question, the Genre check modal at Stage 3 and 4. **No real model
run** — how well the models follow the engine is untested.

---

## 6. Short-drama sub-genres in the style library

**Request.** A dedicated section in the style library for short-drama
sub-genres that influence nuance and plot types without touching the core
mechanics.

**Behaviour.** New style category `drama` (`STYLE_CATEGORIES` = script,
image, video, drama; `STYLES_VERSION` 8). Built-ins (`src/data/dramaStyles.js`):
Comedy, Dark comedy, Action, Romance, Mystery, Sci-fi, Fantasy, Brainrot,
Surrealism — each a 90–160-word brief on tone, typical opening pressure,
turns, villains, hook flavour, dialogue sound and what to keep legible for
AI, editable like any style; the user adds their own. Project field
`dramaStyleId` ('' = none); Project settings shows the "Short drama
sub-genre" selector for series only; a sub-genre chip at Stage 3. The
brief rides in every series prompt as "SUB-GENRE BRIEF (never overrides the
engine)". The style assistant knows the category (`STYLE_RULES.drama`). The
v8 migration adds the built-ins to existing libraries and renames the old
"Short Drama Series (vertical)" script style to "… (legacy brief)" (text
kept; the engine ignores it when selected).

**Files.** `src/data/dramaStyles.js` (new), `src/lib/styles.js`,
`src/lib/storage.js`, `src/components/ProjectSettingsModal.jsx`,
`src/components/StyleControls.jsx`, `src/lib/prompts.js`. i18n:
`styles.cat_drama`, `pset.style_drama`, `pset.styleHint_drama`, `stind.drama`.

**Verified.** The migrated library (version 8, nine drama styles, the legacy
name), the selector in Project settings for a series, the brief in the
prompts.

---

## 7. Agent: short-drama tools

**Request.** Short-drama tools in the MCP so the agent understands the
genre, corrects script errors, analyses pacing and evaluates results.

**Behaviour.** Three tools (27 in all):
- `storyreel_drama_rules { projectId, brief? }` — the conventions as data
  (timing grids, hook types and rotation, dialogue limits, this project's
  landmarks); `brief: true` adds the full brief and stage blocks.
- `storyreel_drama_check { projectId, episode? }` — `checkProject`: score,
  metrics, issues with episode / scene / shot ids and a `next` hint.
- `storyreel_drama_fix { projectId, mechanical? | sceneId, issues? }` —
  mechanical: em dashes fixed project-wide (free); sceneId: the model
  rewrites that scene's shots against the issues the check found there
  (plus the agent's own), through `dramaFixPrompt` (the Stage 4 engine
  prompt + the current shots + the issue list; same number and order of
  shots; only text fields, duration and beat change, so frames and videos
  stay attached); counts an attempt (`scene:<id>:drama_fix`); returns the
  remaining issues.
- `storyreel_update_project` accepts `dramaStyleId`; `storyreel_list_styles`
  the `drama` category; `storyreel_get_project` returns `shortDrama`
  (sub-genre, landmarks, the plan's hook types / turns / questions / next
  openings) and `beat` on scenes and shots; `storyreel_review_shot` returns
  `expected.shortDrama` (beat, position in the episode, the vertical-frame
  expectations, the opening / hook-frame requirement for the first / last
  shot of an episode).
- Guide: a "Short drama" section (the rules in one paragraph, the work
  order: check after Stage 3 and 4, fix, check again; judging by the rules;
  reviewing media against `expected.shortDrama`).

**Files.** `src/lib/agent/api.js`, `agent/AGENT_GUIDE.md`, `docs/agent-api.md`.

**Verified.** Through `window.__storyreelAgent`: rules, list_styles drama,
update_project with a valid / invalid id, the project view's shortDrama,
the check on one episode, the mechanical fix, a scene rewrite with the
model stubbed (two shots rewritten in place, ids kept, no remaining
issues), the error without issues. Not run through the MCP bridge.

---

## 8. Text service: the local Claude Code console as an alternative to the API key

**Request.** Revise how Anthropic models are used for scripts and prompts:
let the user choose between an agent running locally in the console and an
API key, if it does not conflict with the MCP agent driving the app.

**Behaviour.** Settings → Model selection → Text generation has a third
option, **Claude Code (local console, your subscription)**. Each request
runs the installed CLI headless from the app's main process
(`electron/claudeCli.cjs`): `claude -p --output-format json
--no-session-persistence --max-turns 1 --tools "" --system-prompt-file
<tmp> --mcp-config <empty> --strict-mcp-config --setting-sources ""`, the
user prompt on stdin, cwd a temp folder — so the call carries the app's
own system prompt only: no tools, no MCP servers, no plugins / hooks /
skills, no project CLAUDE.md. The answer's `result` text goes through the
same JSON extraction, policy and name enforcement as the API path
(`callClaudeCli` in `claude.js`; `generateJSON` routes on
`settings.textService === 'claude-cli'`). The model select still applies
(`--model`). A "Check Claude Code" button runs `claude --version`.
`textKeyError` returns `NO_CLAUDE_CLI` outside the desktop app (shown by
`ErrorNote` and the Stage 5 notes). The agent's status names the service.
`--bare` is NOT used: it drops the stored login, so the subscription
could not be used.
- **MCP agent:** no conflict — the agent's calls into the app and the app's
  CLI runs are separate processes; the CLI is started with `CLAUDECODE`
  cleared so it does not refuse to run under a console session.
- **Cost / quota:** a call is billed to the subscription's usage, not per
  token. Measured in this session: with the default context a tiny call
  consumed ~56k cached input tokens (MCP tool definitions, plugins); with
  the empty MCP config and no setting sources: 6933 tokens of
  context write, 4410 ms — see the verification note.

**Files.** `electron/claudeCli.cjs` (new), `electron/main.cjs`,
`electron/preload.cjs` (`window.claudeCliBridge`), `src/lib/claude.js`,
`src/lib/storage.js`, `src/components/SettingsModal.jsx`,
`src/components/ErrorNote.jsx`, `src/stages/Stage5.jsx`, `src/lib/agent/api.js`.
i18n: `set.svcClaudeCli`, `set.svcClaudeCliHint`, `set.cliCheck`,
`set.cliChecking`, `tip.cliCheck`, `err.noClaudeCli`.

**Verified.** `claudeCli.cjs` under Node on this machine (Claude Code
2.1.292, logged in): version check; a JSON request on Haiku answered in
4410 ms (answer {"ok":true,"n":7} (in a code fence)). The Settings option and
hint in the dev app. **Not run inside the packaged app** (the IPC path from
the renderer) and not with a full script request.

**Open.** No cancel for a running CLI call (the Stop in the UI only ends
the wait). The CLI wraps JSON in a code fence at times — `extractJSON`
copes.

**Fix after first real use (2026-10-09).** Creating improvement ideas with
the console service failed with "Claude Code CLI: Invalid API key · Fix
external API key". Cause: a persistent `ANTHROPIC_API_KEY` in the user's
Windows environment; the app inherits it when started from the desktop,
the CLI then authenticates with that key (stale) instead of the console
login. `claudeCliRun` now removes `ANTHROPIC_API_KEY` and
`ANTHROPIC_AUTH_TOKEN` from the child's environment — this mode is the
login by definition; the API-key mode is the other setting. The error text
for the remaining cases (an `apiKeyHelper`, or no login) now says what to
do: run `claude` in a terminal and `/login`. Verified: the bridge under Node
with a fake `ANTHROPIC_API_KEY` set answers through the login after the
change (before it, a key the CLI had not approved was ignored anyway, so
the failure needs a key the user once approved in the console — the
situation on this machine).

---

## 9. Jev model: where it fits

**Request.** Think about where the Jev model (TypeSafe System One: Choice /
Score / Noul judgements, no generation) can be used in the pipeline.

**Delivered.** `docs/jev-in-the-pipeline.md`: nine candidate points ranked
(hook-type verification, opening test, turn detection, line hygiene,
ranking Stage 1 directions, prompt–shot agreement, best-of-N prompts,
agent triage, policy pre-check), what it is not for, how it would be wired
(`src/lib/jev.js`, a semantic layer on the genre check, a Settings key),
and the adoption order. No code.

---

## 10. Story assets: cards at Stage 2, context-true images, automatic attachment

**Request.** Identify the assets characters interact with (objects used in
actions across shots, repeatedly mentioned), give them cards like the
characters': an "Assets" tab at Stage 2, each card with a description and an
uploaded or generated image; the look must match the story's world (a key
in sci-fi vs medieval fantasy); unique English names the generation models
cannot misread; automatic attachment to the scenes / shots that mention
them.

**Behaviour.**
- Data: `project.storyline.assets[] = { id, name, type (prop | wardrobe |
  logo | ui | other), description, photos[≤3], libId?, mentions? }`
  (normalised in `migrateProject`). A card mirrors to a library `asset`
  entry (`useLibrarySync`, id `liba_<project>_<asset>`) once it has a photo or
  is attached to a shot, so Stage 5's per-shot references (`shotAssets`,
  `assetsFor`) resolve it unchanged.
- **Stage 2** now has two tabs under the synopsis / cover: Characters (the
  cast and groups as before) and **Assets**. A card: name (unique English
  label; live warning for empty / non-Latin / duplicate (against characters,
  groups, locations, assets) / too generic), type, description, "in N shots"
  badge, up to three reference images with upload, "from the assets
  library", and **Create an image from the description** (Gemini,
  `assetImagePrompt`: the object alone on a neutral background, rendered in
  the story's genre / world from the synopsis, with the project's image
  style). Buttons: "+ Add asset", **Find assets** (the text model lists the
  story's key objects from synopsis, scenes and shots — `findAssetsPrompt`:
  3–12 recurring objects, each a 2–3-word unique label such as "Halvard
  Signet Ring", a description in the story's world written for an image
  model, a type, and the words the script uses — new names added as cards),
  "Attach to shots".
- The Stage 2 storyline generation now proposes assets too (`stage2Prompt`
  schema gains `assets[{ name, description }]`); regenerating the storyline
  keeps cards that already carry images and adds the new names.
- **Names in scripts and prompts.** Asset names join `cardNames`, so every
  script stage is told to use them verbatim and the name enforcement puts
  Cyrillic forms back to the card name; `characterBlock` (used by Stage 3,
  Stage 4, the series plan, the H3 prompt and the image prompt writer)
  appends a KEY ASSETS block — exact names, descriptions — so shots mention
  the object by name and image prompts describe it as the card does.
- **Automatic attachment** (`syncShotAssets`): every shot whose action,
  dialogue or notes names an asset (exact name, tolerant of inflection) is
  attached to its library entry; nothing attached by hand is removed. Runs
  after every Stage 4 breakdown, whenever the cards change at Stage 2, from
  the "Attach to shots" button, and from the agent. `assetUsage` drives the
  badges.
- **New project.** Templates reordered: Short drama first (then 10–30 s,
  1–4 min, 5–10 min; the default selection stays 1–4 min). For Short drama
  an **episode length** segment (60 / 90 / 120 s) sits beside the episode
  count; defaults: 10 episodes (was 30), 90 s (was 105). `onCreate` /
  `Home.create` / `newProject` carry `episodeSeconds`; the agent's
  `storyreel_create_project` accepts it.
- **Agent.** `storyreel_assets` (cards + the scenes' locations as
  environment references), `storyreel_set_asset` (create / edit / delete,
  name validation), `storyreel_asset_image` (render the card's reference;
  attempt `asset:<id>:image`), `storyreel_find_assets` (attempt),
  `storyreel_sync_assets`; `storyreel_get_project` returns `assets`;
  `storyreel_review_shot` returns `expected.assets` (name, description,
  whether a reference exists, what to check) and `expected.environments`,
  and its reference images are labelled "REFERENCE — asset … must look like
  this" / "REFERENCE — location …", including assets the shot names but is
  not attached to; new flag kind `asset`. Guide: "Assets and environments"
  (give cards images, sync, compare the render with the card, flag
  `asset` / `environment`, fix the description or the prompt).

**Files.** `src/lib/storyAssets.js`, `src/components/StoryAssets.jsx`,
`src/lib/agent/assetTools.js` (new); `src/lib/prompts.js`, `src/lib/storage.js`,
`src/lib/series.js`, `src/lib/useLibrarySync.js`, `src/stages/Stage2.jsx`,
`src/stages/Stage4.jsx`, `src/components/NewProjectModal.jsx`,
`src/pages/Home.jsx`, `src/lib/agent/api.js`, `agent/AGENT_GUIDE.md`,
`docs/agent-api.md`, `src/styles.css`. i18n: `s2.tabCast*`, `s2.tabAssets*`,
`asset.*` (intro, name / description / type / photos, used, remove, genImage,
needsDesc, add, find, noneFound, sync, synced, issue_*), `new.epSeconds*`.

**Verified.** In the dev app: `syncShotAssets` on Russian shot text naming
two assets (both attached, libIds assigned, the unmentioned one untouched),
`assetUsage`, the name checks (ok / generic / duplicate / non-Latin),
`cardNames` with assets, the KEY ASSETS block in the Stage 4 prompt, the
Stage 2 schema, the find prompt; the Assets tab (cards, Find assets with
the model stubbed adding only new names, Create image with Gemini stubbed,
the library entry created by the sync hook); the agent's list / create
(duplicate name refused) / edit / sync / image / review (`expected.assets`
and the labelled reference) / delete; the new-project modal (order, 10
episodes, 60 / 90 / 120 with 90 preset; creating with 120 s stores
episodeSeconds 120, 10 episodes, 9:16). Found and fixed on the way:
`migrateProject` rebuilt the storyline without `assets` (cards vanished on
reload). **Not run with real models**: the quality of found assets and of
the rendered references is untested.

**Open.** Asset images come from Gemini regardless of the image service
(like character portraits). Attachment matches names, not the script's
other words for the object (the "mentions" the finder returns are stored
but not yet used for matching).

---

## 11. Audio is never cut at the end of a shot (agent runs)

**Request.** When the agent drives generation, the sound of a shot sometimes
loses its last words and ends in silence.

**Cause (found by reading the whole audio path).** The shot's slot
(`shot.duration`) rules everything and nothing ever grew it for the agent:
the TTS voice was trimmed to the slot inside the talking-video workflow
(`TrimAudioDuration` in the LTX si2v graph) and clamped again as a lane
clip; a native-audio engine (H3, Seedance) that spoke past the slot had its
mix clip clamped to the slot (`Math.min(slotDur, mix.duration)`) and the
video trimmed tail-only; `storyreel_edit_script` rounded the requested
length to the nearest half second (6.2 → 6.0) and never warned that the
existing video no longer covered the slot — the render then froze the last
frame and padded silence (`tpad` + `apad`). The guide ordered video before
voice, so the voice was cut at generation.

**Fix.**
- `genVoice` measures the clip and grows the shot to hold it (≤ 10 s, as the
  silence pads already did); the si2v video run grows the slot first when the
  voice is longer; a native-audio mix longer than the slot of a spoken shot
  grows the slot to the generated length instead of clamping the clip.
- Agent: `storyreel_create_media` returns `shotExtendedTo` / `voiceSec`; a
  spoken shot on the local engine cannot get its video before its voice
  (NOT_READY); `storyreel_edit_script` rounds a duration UP and returns
  `warnings` when the video is shorter than the new slot or the voice longer.
  Guide: voice before video, never shorten below the voice, recreate a
  video shorter than its slot.

**Files.** `src/stages/Stage5.jsx` (genVoice, genVideo si2v, native mix),
`src/lib/agent/api.js`, `agent/AGENT_GUIDE.md`.

**Verified.** Build; the agent paths with stubs (see §17). **Not run with a
real voice or video model.**

---

## 12. Spatial layout: the shot type decides the shot size; the camera keeps its side

**Request.** The planner often put the camera so close that the character
filled the frame (a telephoto lens with a short distance); and two
consecutive shots (the pastry shop) came out mirrored — the window and the
row of lamps on the right in one, on the left in the next — although the
layout tool exists to prevent it; the agent also never made a location
reference.

**Fix (`src/lib/spatial/build.js`, `layout.js`, `describe.js`).**
- `framingOf(shotType)` reads the framing words of the shot type (extreme
  close-up … extreme wide, OTS, two-shot, insert) → the frame height at the
  subject and the lens that suits it. `fitCamera` keeps the planner's lens
  only when it is within one step of that lens, then sets the DISTANCE from
  the frame height and the lens's vertical field of view (so a close-up is a
  close-up on 9:16 as on 16:9); for medium shots and wider it moves back
  until every present character the shot names is inside the frame. Applied
  to every shot the planner returns (scene build and single-shot rebuild, in
  the window and through the agent).
- The line of action: `actionAxis` (the two present characters nearest the
  target, in cast order, or a lone character's facing line), `cameraSide`,
  `mirrorCamera` (the same shot from the other side of the line — position
  and target reflected, yaw recomputed). `keepSide` mirrors a camera that
  crossed the line back to the previous shot's side unless the shot's text
  asks for it (`crossesLineOnPurpose`: "crosses the line", "other side of",
  "opposite side", "180-degree", "turns around"). Since set boxes never
  move, keeping the side keeps the window / door / counter on the same side
  of the screen.
- Planner prompt: always box the landmarks that define the place and its
  background (window, shop front, door, counter…); the set keeps its side.
- `continuityWarnings` adds `lineCross` (the camera changed sides) and
  `setFlip` (a labelled set piece swapped screen sides); the window and the
  agent show them (i18n `sp.warn_lineCross` / `sp.warn_setFlip` EN/RU/UK).
- `describeShot` ends with a "Continuity:" sentence for every shot after the
  first — the background keeps its screen side (naming the set pieces and
  their sides) or, when the line is crossed, says so; the image and video
  prompt writers read it.
- Agent: `storyreel_create_media` kind `location_ref` exposes the workbench's
  location-reference tool (the approved frame, people removed, widened →
  the scene's location photos); new `storyreel_location_image` renders a
  reference from the text alone (`locationImagePrompt`). `storyreel_review_shot`
  adds `environmentNote` when the location has no reference and extends the
  environment check: landmarks on the same screen side as in the previous
  frame unless the layout says the line is crossed. Guide: location
  reference after the first good frame, the side rule, the new warnings.

**Verified.** In the dev app with a staged scene (see §17): `framingOf`,
`fitCamera` (85 mm at 1 m planned for a "wide shot" → 24 mm at the wide
distance; a medium with a named character out of frame → camera moved
back), `keepSide` (a camera placed at yaw 180 against a yaw-0 previous
shot is mirrored back; not when the action says "other side"), the
warnings and the "Continuity:" line. **Not run with the real planner model.**

---

## 13. Transitions chosen from what happens in the shots

**Request.** After the videos exist the agent must set the transitions
from the events: abrupt for action, smooth for slow scenes.

**Behaviour.** `src/lib/transitions.js`: `suggestTransition(prev, next, …)`
reads the two shots' type / action / notes (action verbs → `smash_cut`;
both quiet → `soft_cut`; a time jump inside the scene → `dissolve`; across
scenes: time jump → `rest_cut`, action → `smash_cut`, a new place → `soft_cut`;
episode end → `dip_to_black`; continuous dialogue → `match_action_cut`; else
the scene's rhythm block as before), with Russian / Ukrainian verbs too.
The assembly's automatic choice (`cutFor` in Stage 6) now uses it; a manual
pick per boundary still wins. Agent: `storyreel_transitions` (every
boundary: effective, override, suggested, reason, `tailSlackSec` — a smooth
transition needs tail slack or the render cuts hard) and
`storyreel_set_transitions` ({ items: [{ shotId, type }] } or { auto: true }).
Guide step 6. `shotTransitions` is now copied into split parts.

**Verified.** `suggestTransition` cases and the two tools in the dev app.

---

## 14. Subtitles: a layer under the video track

**Request.** Automatic subtitles at Stage 5 on a separate layer beneath the
video; compact text at the bottom of the frame with the dialogue;
double-click a block → editor for font, size, colour, placement (bottom /
centre / top); custom text anywhere on the frame; an MCP tool.

**Behaviour.**
- Data: `project.subtitles = { style: { font, size (% of frame height),
  color, outline, position }, items: [{ id, shotId?, start, duration, text,
  custom?, x?, y?, style? }] }` (`src/lib/subtitles.js`, normalised in
  `migrateProject`). Fonts: those present on Windows and macOS with Cyrillic
  (Arial, Arial Black, Verdana, Tahoma, Georgia, Times New Roman, Trebuchet
  MS, Courier New, Impact), so the burned-in text matches the preview.
- Timeline (Stage 6): a lane "ST" between the video track and the audio
  lanes with the blocks placed on the same measured geometry as the audio
  clips; lane buttons ≡ "From dialogue" (`autoSubtitles`: each shot's lines
  share the slot minus its silence pads, in proportion to their length;
  custom text is kept), + "Add text" (a free block at the playhead, placed
  by X / Y), ✕ "Clear". Drag a block to move it; double-click opens
  `SubtitleModal` (text, start, length, font, size, colour, outline colour,
  placement bottom / centre / top / anywhere with X / Y, a live sample,
  "Use this look for all subtitles", Delete, Save).
- Preview: the active blocks are drawn over the picture, sized to the frame
  the preview shows (a ResizeObserver keeps the overlay on the contained
  frame), with the same placement maths as the render.
- Render: `buildAss` writes an ASS subtitle file (a style for the layer's
  look, per-block override tags for font / size / colours, `\an` alignment
  for bottom / centre / top, `\pos` for custom text, times shifted into the
  rendered window); `electron/ffmpegRender.cjs` writes it to the temp dir and
  appends `subtitles='…'` (libass) after the transition chain. The canvas
  fallback (no ffmpeg bridge) draws the text with the 2D context.
- Agent: `storyreel_subtitles` and `storyreel_set_subtitles` ({ auto, style,
  add, edit, remove, clear }). Guide step 7. i18n `sub.*` EN/RU/UK.

**Verified.** In the dev app: the lane, "From dialogue" on the seeded shots,
the overlay in the preview, the editor (double-click), moving a block, the
ASS text, the two tools. **Not rendered through ffmpeg** (no Electron here):
the `subtitles` filter is present in the bundled Windows ffmpeg (libass,
fontconfig) — the macOS build must be checked once on a Mac
(`ffmpeg -filters | grep subtitles`).

---

## 15. Action logs: an app log file and a per-project log

**Request.** Log user actions: app-level actions in an app log file,
project-specific actions inside the project file.

**Behaviour** (`src/lib/actionLog.js`).
- App log: `<userData>/logs/app.log` (desktop app; one JSON line per entry
  with `t`, `iso`, `by` user | agent, `action`, `details`; rotated once to
  `app.log.1` past 2 MB; IPC `app-log` / `app-log-path`, bridge
  `window.appLog`; `storyreel_status` returns `appLogFile`). Logged:
  `project.create` / `delete` / `duplicate` / `import`, `style.create` /
  `edit` / `delete` / `import`, `settings.save` (the changed fields; a key
  field is logged as set / cleared, never its value), `undo` / `redo`, and
  every writing `agent.call` (tool, project, shot, kind).
- Project log: `project.actionLog` (≤ 400 entries, inside the project and
  so inside `project.md`): `App.updateProject` appends `{ t, by, action:
  'edit', keys }` for every content change — the project fields the patch
  touched (`sceneDetails`, `shotVideos`, `subtitles`…) and whether the user or
  the agent made it; the same actor touching the same fields within five
  seconds extends the last entry (`n`) instead of adding one (typing);
  named actions pass a patch made with `logged(patch, action)` (the subtitle
  actions do). Undo rolls the log back with the project — the undo itself
  is in the app log.

**Verified.** The project log entries and coalescing in the dev app; the
app log falls back to the console outside Electron. **The file itself is
not written here** (no Electron run).

---

## 16. macOS: the timeline scrollbar vanished

**Cause.** `* { scrollbar-width: thin; scrollbar-color: … }` is set globally;
in Chromium 121+ the standard properties switch the WebKit pseudo-element
styling off, and on macOS that leaves the native OVERLAY scrollbar, which
hides until the next scroll ("Show scroll bars: when scrolling"). Windows
draws classic bars, so it only showed on the Mac.

**Fix.** `.nle-scroll` reverts the two properties to `auto` and styles its
WebKit scrollbar (12 px, visible track and thumb) — a classic, permanent
bar on macOS. **Not verified on a Mac** (no Mac here); the CSS is inert on
Windows.

---

## 17. Verification of §11–16 in the dev app

See each section's "Verified" line; the dev app has no Electron bridge, so
the ffmpeg burn-in, the app log file and the real generation paths are
untested here.
