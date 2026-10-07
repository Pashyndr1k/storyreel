# Unreleased (after 2.14.0)

Base: tag `v2.14.0` (commit `6ce489c`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. MiniMax H3: 20 / 8 / 4 sampling steps selectable (Stage 5 picker)

**Request.** The local H3 workflows ran the full 20-step schedule (only
MULTI mode had a 4-step "Lightning" switch). Make 8-step and 4-step
sampling available as options in the Stage 5 model drop-down; the user's
LoRAs live in `D:\ComfyUI\ComfyUI\ComfyUI\models\loras`
(`MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy`, `MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy`,
`minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16`).

**Behaviour.**
- One setting, `settings.h3Steps` ∈ 20 | 8 | 4 (default 20), applies to every
  H3 workflow: first frame (i2v), first + last (flf2v), reference (r2v) and
  MULTI (mfr). The old `h3Lightning` switch is gone; a stored `true` without
  `h3Steps` loads as 4.
- **Stage 5 model picker** (prompt header, video tab) lists H3 three times:
  "MiniMax H3 · 20 steps" (value `minimax`), "· 8 steps" (`minimax@8`),
  "· 4 steps" (`minimax@4`). Choosing another step count of the same engine
  changes the setting at once, with no confirmation and no prompt rewrite
  (the prompt format is the same); choosing H3 from another engine confirms
  as before and sets both the engine and the steps.
- **Settings → Video & voice** (H3 selected): a select "H3 sampling steps"
  with the three options and a hint (which LoRAs, where, the quality caveat),
  replacing the Lightning checkbox.
- **LoRA choice** (`h3LoraFor(kind, steps, available)`): per base model and
  step count a list of candidate file names in order of preference
  (`H3_LORAS`); the first one that ComfyUI's `LoraLoaderModelOnly` lists
  (matched by base name, sub-folders allowed) is used:
  - fl2v 8: MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy, …-Acc-8Step,
    minimax_h3_fl2v_turbo_8step_v1.0;
  - fl2v 4: minimax_h3_fl2v_turbo_4step_v1.0_768p, then the FL2VA Acc files
    (MiniMax sanctions the Acc adapters at 4 steps too);
  - ref2v 8: MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy, …-Acc-8Step,
    minimax_h3_ref2v_turbo_8step_v1.0;
  - ref2v 4: minimax_h3_ref2v_turbo_4step_v0.1, then the Ref2VA Acc files.
  Acc (PDD) files sample with `euler`; turbo (LightX2V) files keep
  `res_multistep`. Scheduler stays `simple`; guidance is the CFG-free
  `BasicGuider` already in the graphs; the H3 nodes carry no shift inputs.
- **Graph wiring** (`applyH3Speed(graph, ids, accel)`): a `LoraLoaderModelOnly`
  between the UNET loader and the scheduler / guider, `steps` set, sampler
  set. Node ids per family in `H3_IDS` (i2v: 6 / 9 / 16 / 17, LoRA at 7;
  ref graphs: 127 / 124 / 126 / 123, LoRA at 145).
- **Preflight** (`h3Preflight`) now takes `{ kind, steps }`, resolves the LoRA
  from ComfyUI's list, caches per url / workflow / kind@steps and returns the
  choice; when no candidate is installed the H3-not-ready error names the
  expected files and the folder, and suggests 20 steps. If ComfyUI cannot be
  queried the first candidate name is used.
- **Progress estimate** learns per step count (`etaKey` "minimax",
  "minimax8", "minimax4"; first-run rates 45 / 20 / 11 s of work per second
  of video).

**Data model.** `settings.h3Steps` (20); `settings.h3Lightning` no longer
written (read once for the migration).

**Files.** `src/lib/comfy.js` (`H3_STEPS`, `H3_LORAS`, `h3StepsOf`, `h3LoraFor`,
`applyH3Speed`, `H3_IDS`; `h3Preflight` signature; `buildH3MultiGraph` gains
`accel`; i2v / r2v / mfr paths), `src/lib/storage.js`, `src/lib/videoEta.js`,
`src/components/SettingsModal.jsx`, `src/stages/Stage5.jsx` (`VIDEO_ENGINES`,
`videoPick`, `pickModel`, ETA key, engine hint). i18n: `set.h3Steps`,
`set.h3Steps20/8/4`, `tip.h3Steps`, `set.h3StepsHint`, `mdl.steps`
(`set.h3Lightning*` keys left in place, unused).

**Verified.** In the dev app: `h3LoraFor` against the user's file list and
edge cases (missing, unknown list, sub-folder), `applyH3Speed` on the real
i2v template and `buildH3MultiGraph` (LoRA node, model rewiring, steps,
sampler), `h3Preflight` read-only against the live ComfyUI at 127.0.0.1:8188
(fl2v@8 → FL2VA Acc + euler; ref2v@4 → ref2v turbo 4-step + res_multistep;
fl2v@4 → the 768p turbo 4-step file that ComfyUI also lists), the Stage 5
picker (three entries, switching steps with no confirmation, stored value),
the Settings select. **No video was generated** — speed and quality of the
8- and 4-step runs are untested.

**Open.** The fl2v 4-step turbo LoRA is a 768p model; at other sizes the Acc
8-step file at 4 steps may be the better choice (swap the candidate order if
so). Switching between Acc and turbo files is automatic by file name only.

---

## 2. Video seed per shot, "Same seed" for the next render

**Request.** The seed was random on every render. Store it per shot and add
a same-seed option, so a prompt can be tested at 4 or 8 steps and then
rendered with the same seed at 20.

**Behaviour.**
- Every local video generator (H3 i2v / flf2v, H3 reference, H3 MULTI, the
  three LTX graphs) takes an optional `seed` and returns the seed it used
  (`seedOr`: the given number, else a fresh random one). One seed feeds every
  noise node of a graph (LTX-2.5's two passes share it).
- The seed of the shot's current video is stored in
  `project.shotSeeds[shotId]` when the video is saved. Cloud engines (Kling,
  Krea) return no seed and store nothing.
- Stage 5 video tab, local engines only: a two-state segment **New seed /
  Same seed** (`project.shotSeedMode[shotId]` = 'same'). "Same seed" is
  disabled until the shot has a stored seed; its hint shows the number. With
  "Same seed" the next render replays that seed; the mode stays until
  switched back, so a shot can be iterated on prompt / steps alone.
- Deleting a video keeps the seed (it can still be replayed).
- Agent: `shotView.videoSeed`; `storyreel_create_media` accepts
  `seed: "same" | "new"` for videos (sets the mode first; "same" without a
  stored seed → `NOT_READY`).

**Data model.** `project.shotSeeds: { [shotId]: number }`, `project.shotSeedMode:
{ [shotId]: 'same' | 'new' }`, both default `{}`, normalised in
`migrateProject`.

**Files.** `src/lib/comfy.js` (`seedOr`; `seed` in / out of
`generateComfyVideo`, `generateComfyRefVideo`, `generateComfyMultiVideo`,
`buildH3MultiGraph`), `src/lib/storage.js`, `src/stages/Stage5.jsx`
(dispatch + segment), `src/lib/agent/api.js`. i18n: `seed.new`, `seed.same`,
`seed.newTip`, `seed.sameTip`, `seed.tip`, `seed.noneTip`.

**Verified.** In the dev app with the ComfyUI calls stubbed (the queued graph
captured, nothing rendered): H3 i2v graph carries seed 777 and the 8-step
LoRA, both LTX pass seeds 999, MULTI graph seed 12345, random when none is
given; the segment (disabled → enabled with a stored seed, hint with the
number, switching); the agent's `videoSeed` and the `seed` parameter. No
real render.

**Open.** A same-seed render at another step count is not the same
animation (different model weights and schedule) — close in composition,
often in broad motion, not in detail. Same seed + same settings is
reproducible only on the same ComfyUI build and GPU.

---

## 3. Stage 5 image / video tabs redesigned (compact single column)

**Request.** A clearer, more compact UI for the image and video tabs of the
shot card, after a reference mock-up: tabs with a media dot; one wide action
button that doubles as the progress bar (label and percentage left, clock
and Stop right) with the upload / delete icons beside it; a 3-column grid of
parameter tiles (caption, value, "k/n"); the prompt in a box whose header
reads "VIDEO PROMPT · IMAGE-TO-VIDEO · 4 S" with "Recreate prompt" and a copy
icon on the right.

**Behaviour.** Both tabs now render one column (`.s5e-stack`) instead of
the two-column prompt / generation grid:
1. media (image tab: first frame, final frame, versions and the refine row —
   the refine row only once an image exists; video tab: the player on the
   full page, nothing in the embedded workbench, whose preview shows the
   clip);
2. the action row: `.s5e-big` — "Create image / video", "Recreate …" or
   "Create prompt" when the prompt is missing — in capitals, without the
   menu emoji (`plainLabel`); while a video renders it is the progress bar
   (`GenProgress` with a `label`: "GENERATING · 69%" left, the clock right)
   and the Stop square sits inside its right end; while an image renders a
   light sweep runs along its bottom edge; then the icon buttons (upload,
   final frame, final-frame upload, location reference; video: upload,
   delete);
3. the tiles (`.s5e-tiles`, 3 columns, 2 below 720 px). A tile is a button:
   caption, value, index; click = next value. Video: **Mode** (the workflow
   list of the engine; options without material are skipped; Auto shows the
   effective workflow in its hint), **Camera** (6) and **Dynamics** (3) —
   dotted-underlined while derived from the scene, Shift+click returns to
   derived —, **Quality** (SD / HD / FHD), **Seed** (New / Same; disabled
   until a seed is stored; "—" for cloud engines), **Model** (the native
   model select lies invisibly over the tile, so the existing confirm /
   rewrite flow is unchanged). Image: **Characters** (with count),
   **Location**, **Assets**, **Palette** (swatches; the previous-scene
   palette on a scene's first shot) as on / off tiles with a dot, and
   **Model**;
4. the prompt box (`.s5e-promptbox`): "IMAGE PROMPT" or "VIDEO PROMPT ·
   <workflow> · <n> s", the engine-mismatch badge, Recreate prompt, copy, the
   fold toggle (compact card); the textarea in the display (mono) font; the
   tweak row;
5. below: image — the shot's assets and locations; video — the dynamics
   "stale" notice, the H3 reference and keyframe rows.
- Removed: the segmented selectors (resolution, seed, workflow), the camera /
  dynamics blocks (`dynSlider`), the "Apply" switch pills (`SwitchPill`) and the
  mode description under the empty-media box (now in the Mode tile's hint
  and the prompt header). The audio tab is unchanged.

**Files.** `src/stages/Stage5.jsx` (`tile`, `toggleTile`, `dynTile`, `modeTile`,
`qualityTile`, `seedTile`, `modelTile`, `promptBox`, `plainLabel`; both tab
bodies rewritten), `src/components/GenProgress.jsx` (`label` prop →
label + percentage, separate clock), `src/styles.css` (`.s5e-stack`,
`.s5e-actrow`, `.s5e-big*`, `.s5e-tiles`, `.s5e-tile*`, `.s5e-promptbox`,
`.s5e-prompthead`, `.s5e-promptmeta`). i18n: `tile.model`, `tile.mode`,
`tile.quality`, `tile.seed`, `tile.on`, `tile.off`, `tile.none`, `tile.next`,
`tile.toggle`, `tile.nextAuto`, `tile.nextDerived`, `tile.seedCloud`,
`tile.imagePrompt`, `tile.videoPrompt`, `unit.sec`, `vid.working`.

**Verified.** In the dev app (embedded workbench, 980 px): the video tab —
action row, six tiles with the right values and indices (Mode AUTO 1/5,
Camera 3/6 derived, Quality HD 2/3, Seed 2/2, Model), prompt box header
"VIDEO PROMPT · IMAGE-TO-VIDEO · 5 S"; the progress state mocked in the DOM
(red fill, label, clock, Stop); the image tab — action row with upload, the
reference tiles disabled with "None" when the shot has no references, the
Model tile, the prompt box. Not exercised: a real render through the new
button, the tiles' Shift+click, the full (non-embedded) Stage 5 page layout,
and widths under 720 px.

**Open.** Tiles cycle forward only (no previous); the toggle tiles show a dot
rather than a count. The audio tab keeps the old two-column layout.

---

## 4. Default Gemini image model: gemini-nano-banana-2.1

**Request.** Set Gemini Nano Banana 2.1 as the default image model (asked
as "Gemini 3.6 Flash Image" — no such model exists; 3.6 Flash is text-only).

**Behaviour.** `DEFAULT_IMAGE_MODEL` is `gemini-nano-banana-2.1` (1K / 2K / 4K,
up to 14 reference images with consistency for 4 characters; the app keeps
asking for 2K). Existing installs whose stored model is the earlier default
`gemini-3-pro-image-preview` (or none) move to it on load
(`LEGACY_IMAGE_MODELS`); any other stored id — a model chosen by hand — stays.
Nano Banana Pro can be chosen again in Settings → Model selection. The Stage
5 image Model tile and the prompt-header picker now read "Gemini · <name>"
(`geminiImageLabel`: Nano Banana 2.1 / 2 / 2 Lite / Pro / Nano Banana, else
the id), and the image-prompt request names that model ("for the Nano
Banana 2.1 (Gemini) image generation model").

**Files.** `src/lib/config.js`, `src/lib/gemini.js` (`geminiImageLabel`),
`src/lib/storage.js` (load migration), `src/stages/Stage5.jsx`,
`src/lib/prompts.js`. No i18n change.

**Verified.** Build; the label mapping. Not run against the Gemini API with
the new id (the request shape — `generateContent`, `responseModalities`,
`imageConfig` — is the same one the other Nano Banana models accept).

**Open.** Google documents these models with its newer Interactions API;
`generateContent` still serves them. If the model ever vanishes from
"Fetch available models", that is the reason.

---

## 5. Strips above the prompt: assets, locations, references, keyframes

**Request.** Move the assets, locations and references above the prompt
frame and unify their style.

**Behaviour.** Image tab order is now media → action row → tiles → **strips**
(the shot's Assets, Locations) → prompt box. Video tab: media → action row →
tiles → "stale" notice → **strips** (H3 only: References, Keyframes) →
prompt box. A strip (`.s5e-strips > *`) is a box in the tile style — same
background, border and padding — with a 10 px upper-case caption and a row
of 48 px thumbnails and 48 px add / edit buttons; the strips sit in a grid
that fits two side by side when the card is wide enough (min 240 px each).
The markup of the rows is unchanged (`photo-row` / `photo-thumb` /
`photo-add`; `s5e-refrow` / `s5e-refthumb` / `s5e-refbtn`); only their
container class and the scoped styles differ.

**Files.** `src/stages/Stage5.jsx` (blocks moved; `s5e-refgrid` → `s5e-strips`),
`src/styles.css` (`.s5e-strips` rules). No i18n change.

**Verified.** Build; both tabs in the dev app (strips above the prompt box,
boxed, 48 px thumbnails). Not checked under 500 px.

---

## 6. Download as an action-row button

**Request.** Make the download button the same style and size as the upload
button.

**Behaviour.** The first frame's and the video's download are now 48 px icon
buttons (`.s5e-ico`) in the action row, right after Upload — image tab when a
first frame exists, video tab when a clip exists. The small round download
overlays on the media (`.s5e-dl`) are gone from both tabs; the video's expand
overlay and the final frame's own action icons stay.

**Files.** `src/stages/Stage5.jsx`. No CSS or i18n change.

**Verified.** Build; the buttons' presence and size in the dev app.
