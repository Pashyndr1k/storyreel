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
