# Unreleased (after v2.11.0)

Base: tag `v2.11.0` (commit `226abd8`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. Script export (Stage 4 and Project settings)

**Request.** Once every scene has its shot breakdown, offer a "Script Export"
button at Stage 4 and in Project settings. Two formats, chosen by checkboxes
(either or both): a book-style text (synopsis first, then the story with no
technical, camera or sound notes) and a JSON file with everything from Stage 4.

**Behaviour.**
- Button "Export script" in the Stage 4 action row (after the batch progress
  badge) and a "Script export" section in the Project settings modal. Both are
  disabled until `scriptReady(project)` — every outline scene has at least one
  shot.
- The button opens `ScriptExportModal`: two checkboxes, both ticked by
  default; "Save" is disabled when neither is ticked. Each ticked format is
  saved as a browser download (`<title>-script.md`, `<title>-script.json`).
- Story text (`buildBookText`): `# title`, `## Synopsis` + the Stage 2
  synopsis, a `* * *` rule, then per scene `## scene title` followed by each
  shot's action as a paragraph and each line of its dialogue as its own
  paragraph. Shot type, location, durations and notes are omitted. Production
  cues inside an action line are stripped: bracketed or parenthesised groups
  starting with a cue word (`[camera …]`, `(SFX: …)`) and label sentences
  (`Camera: …`, `Sound: …`). The cue-word list is `CUE_WORDS` in the module.
  The text is assembled from the written shots; no model call is made, so
  wording is exactly what Stage 4 holds.
- JSON (`buildScriptJSON`): `{ format: 'storyreel-script', version: 1,
  exported_at, title, genres, language, aspect_ratio, script_type, series?,
  synopsis, characters[], groups[], total_duration_sec, scenes[], dynamics_plan }`.
  Each scene: `number, episode?, title, summary, start_sec, duration_sec,
  planned_duration_sec, shots[]`; each shot: `number, start_sec, duration_sec,
  shot_type, location, action, dialogue, notes`. Text fields are unmodified.

**Files.**
- `src/lib/scriptExport.js` (new): `scriptReady`, `buildBookText`,
  `buildScriptJSON`, `scriptFileBase`.
- `src/components/ScriptExportModal.jsx` (new).
- `src/lib/exportScript.js`: `downloadText(filename, text, type)` — third
  argument added (MIME type, default markdown).
- `src/stages/Stage4.jsx`: `showExport` state, the button, the modal.
- `src/components/ProjectSettingsModal.jsx`: the section, the modal.
- i18n: `sx.button`, `sx.title`, `sx.hint`, `sx.notReady`, `sx.book`,
  `sx.bookHint`, `sx.json`, `sx.jsonHint`, `sx.save`, `tip.sxOpen`,
  `tip.sxBook`, `tip.sxJson`, `tip.sxSave`.

**Verified.** Module output checked on a seeded project (cue stripping,
timings, JSON shape); button, modal and the disabled states checked in the dev
app. The actual file download was not clicked through.

---

## 2. Series: free episode count and episode length (Stage 2)

**Request.** At Stage 2 of a short-drama project let the user set the number
of episodes and the duration of each, instead of the fixed template.

**Behaviour.**
- Stage 2 of a series master shows, above "Create storyline": "Number of
  episodes" and "Episode length" (seconds), an approximate total running time,
  and a hint. Values are saved on blur through `rawUpdate` (no stale-stage
  toast).
- Episode count range is now 1–200 (was 3–100). Episode length is a target of
  30–600 s, default 105; prompts ask for target ± 15 s (so the default is the
  former 90–120 s).
- Every series prompt (Stage 1 directions, Stage 2 storyline, series sections,
  episodes, the segment scene outline) and the Stage 3 badge use the project's
  range. Segment projects copy the length from the master.
- Changing the numbers after the storyline or plan exists does not rewrite
  them; the hint says to recreate. Stage 3 already warns when the plan's
  episode count differs from the project's.

**Data model.**
- `project.episodeSeconds` (number; 0 for non-series; clamped 30–600, default
  105) — `projectDefaults`, `newProject({ episodeSeconds })`, `migrateProject`.
- `project.seriesPart.episodeSeconds` on segment projects.
- `project.episodeCount` clamp widened to 1–200.

**Files.**
- `src/lib/series.js`: `SERIES_MIN_EPISODES = 1`, `SERIES_MAX_EPISODES = 200`;
  `EPISODE_MIN_SEC` / `EPISODE_MAX_SEC` removed in favour of
  `EPISODE_DEFAULT_SEC`, `EPISODE_SEC_MIN`, `EPISODE_SEC_MAX`,
  `EPISODE_TOLERANCE_SEC`, `clampEpisodeSec`, `episodeRange(project)`;
  `buildSegmentProject` passes `episodeSeconds`.
- `src/lib/storage.js`: the field and clamps above.
- `src/lib/prompts.js`: `episodeRange(project)` everywhere a length is stated;
  `seriesTotal(project)` (the whole series' count, also inside a segment
  project) replaces `episodeCountOf` in the prompts.
- `src/stages/Stage2.jsx`: the `.series-setup` block.
- `src/stages/Stage3Series.jsx`: badge uses `episodeRange`.
- `src/data/shortDramaStyle.js`: the factory rules no longer state a fixed
  episode length; `SHORT_DRAMA_V6_REWRITES` lists the replaced phrases.
- `src/lib/styles.js`: `STYLES_VERSION = 6`; migration v6 applies those phrase
  rewrites to the stored "Short Drama Series" style (other user edits kept).
- `src/styles.css`: `.series-setup`.
- i18n: `ser.episodeLen`, `tip.episodeLen`, `ser.totalRun`, `ind.serTotal`,
  `ser.setupHint`; reworded `new.episodesHint`, `tip.episodes`.

**Verified.** `episodeRange` values, the style migration and the Stage 2
controls (edit → saved → hint and total update) in the dev app. No real model
run with a non-default length.

---

## 3. Stage 4: "Storyboard preview & timeline" hidden

**Request.** Hide the section on Stage 4.

**Behaviour.** The section is not rendered. `StoryboardTimeline.jsx`, its
strings and the stored `project.storyboards` / `project.referenceFrames` are
kept; Stage 5 still offers existing storyboard frames as H3 references.
Side effects: new storyboard frames can no longer be created, and Stage 4
loses the timeline's drag-to-reorder and duration handles (shot cards keep
their own duration field and drag handle).

**Files.** `src/stages/Stage4.jsx`: `const SHOW_STORYBOARD = false` guards
the `<StoryboardTimeline>` render. The file's line endings were normalised to
LF in the same change.

---

## 4. Style library: protected names replaced with descriptive wording

**Request.** Check all library styles (script, image, video) for brand names,
personal names, trademarks and film or game characters; then replace the ones
found with descriptive wording.

**Review result.** Script styles and the Stage 1 personas
(`src/data/auteur_personas.json`) contained none. Ten image styles and
three video preset titles did.

**Behaviour.** Factory titles and texts changed as follows (style ids are
unchanged, so projects that selected these styles stay linked):

| Style id | Change |
|---|---|
| `bi2.image.panavision_70s` | title "1970s Panavision" → "1970s Anamorphic Film"; "Panavision anamorphic lens" → "vintage anamorphic lens" |
| `bi2.image.imax_epic` | title "IMAX Epic Sci-Fi" → "Large-Format Epic Sci-Fi"; "IMAX 70mm film" → "large-format 70mm film"; ", directed by Denis Villeneuve" → ", monumental scale, austere minimalist production design" |
| `bi2.image.french_new_wave` | "high contrast Kodak Tri-X" → "high contrast fast black-and-white film stock" |
| `bi2.image.sun_nostalgia` | "Kodak Portra 400 film stock" → "warm fine-grain colour negative film stock" |
| `bi2.image.surreal_pop` | ", Wes Anderson style" → ", deadpan storybook whimsy" |
| `bi2.image.pixar_3d` | title "Pixar 3D Magic" → "Polished 3D Family Animation"; "3D animation, Disney Pixar style," → "polished feature-film 3D animation, warm family-film look," |
| `bi2.image.retro_90s_anime` | ", Studio Ghibli aesthetic" → ", gentle hand-painted pastoral backgrounds" |
| `bi2.image.modern_anime` | " (Makoto Shinkai / CoMix Wave style)" → ", luminous photoreal backgrounds" |
| `bi2.image.spiderverse` | title 'Stylized "Spider-Verse" 3D' → "Stylized Comic-Book 3D" |
| `bi2.image.gothic_stopmotion` | " (Tim Burton / Henry Selick style)" → ", macabre handmade puppet look"; "smooth Pixar 3D" → "smooth glossy 3D" in the avoid list |
| `bi3.video.motion_03` | title "3D Pixar Animation" → "3D Family Animation" |
| `bi3.video.motion_07` | title "MTV Retro" → "Retro Music Video" |
| `bi3.video.motion_09` | title "Action Camera (GoPro)" → "Action Camera" |

Existing installations are migrated on start: a style's title is replaced only
if it still equals the old factory title, and its text only if it still equals
the old factory text. Anything the user edited is left as it is, as are the
user's own styles.

**Data model.** `STYLES_VERSION = 7`; migration v7 in `migrate()`.

**Files.**
- `src/lib/styles.js`: new titles and texts in `BUILTINS_V2.image`; the old
  values frozen in `V6_FACTORY_NAMED` (image: title + text) and
  `V6_VIDEO_NAMES` (video titles) — the old names remain in the source only
  as these comparison strings; migration v7.
- `src/data/video_motion_presets.json`: the three preset titles.

**Verified.** In the dev app: a stored v6 library upgrades to v7 with no
remaining names; an edited title or text is kept; a user style is untouched.
Note for dev work: editing `styles.js` while the dev page is open hot-reloads
the module and can persist the page's old in-memory library under the new
version number — set the stored version back and reload to test a migration.
The reworded styles were not test-rendered; the looks may shift slightly
without the names.

---

## 5. Stage 1: pinned versions

**Request.** Let the user pin a specific story direction to a saved list and
return to it after any number of regenerations and plot variations.

**Behaviour.**
- Every idea card has a star button in its header: click to pin, click again
  to unpin. A pin stores a copy of the idea.
- A "Pinned versions" section below the idea grid holds the pins as a compact list
  (with a count): one row per pin showing only its title. Clicking the title
  (or its chevron) unfolds the row into the full description — pitch, "why it
  works" and the randomization modifiers; the unfolded state is view state
  (`openPins`, a Set of ids in the component), not stored. Each row has
  "Develop" (same action as on an idea card: sets the approved plot and the
  selection; reads "✓ Selected" for the selected one) and a remove button.
  The section stays when "Create/Recreate ideas" replaces the idea cards.
- "Pin this plot" next to "Use my original" saves the approved plot exactly as
  it reads now (including manual edits) as a pin titled "Pinned plot N"; the
  button reads "Plot pinned" and is disabled while that exact text is pinned.
- Pins are per project and are copied with it (duplicate, export/import).

**Data model.** `project.pinnedIdeas`: array of
`{ id, title, pitch, why_it_works, modifiers, pinnedAt }`; default `[]` in
`projectDefaults`, normalised in `migrateProject` (entries without `id` or
a string `pitch` are dropped). A pinned idea keeps the id of the idea it was
copied from, so `project.selectedIdeaId` highlights it in both lists.

**Files.**
- `src/lib/storage.js`: the field.
- `src/stages/Stage1.jsx`: `pinned`, `isPinned`, `togglePin`, `pinApproved`,
  `ideaCard(idea)` and `ideaMods(idea)` renderers (replace the inline card
  markup), the pinned list (`openPins`, `togglePinOpen`), the "Pin this plot"
  button.
- `src/styles.css`: `.idea-head`, `.idea-pin`, `.pinned-title`,
  `.pinned-list`, `.pinned-row`, `.pinned-head`, `.pinned-toggle`,
  `.pinned-name`, `.pinned-body`.
- i18n: `s1.pinnedTitle`, `s1.pinnedHint`, `s1.pinPlot`, `s1.plotPinned`,
  `s1.pinnedPlotTitle`, `tip.s1Pin`, `tip.s1Unpin`, `tip.s1PinPlot`,
  `tip.s1PlotPinned`, `s1.developShort`, `s1.pinnedUntitled`,
  `tip.s1PinUnfold`, `tip.s1PinFold`.

**Verified.** In the dev app with a stubbed text model: pin, regenerate ideas
(pin stays), develop the pinned version, pin the edited plot, unpin.

---

## 6. Series: keep all episodes in the current project

**Request.** At Stage 3 of a short-drama series, allow going straight on to
Stage 4 without splitting, keeping every episode in the current project.

**Behaviour.**
- The series plan (Stage 3 of a series master) ends with a single "Production" section
  (`.seg-panel`) holding both ways to produce the series as two
  `.prod-option` blocks: first "Keep in this project" with a "Continue here"
  button, then "Split into projects" (size selector, "Create projects", the
  list of parts). The "write every episode first" hint appears once, at the
  top of the section. "Continue here" is enabled once every episode is
  written and asks for confirmation, stating the episode count and the
  approximate minutes of video.
- After that the project is an **inline series**. Stage 3 shows a two-way
  switch under the heading — "Series plan" / "Scene outline" — and opens on
  the scene outline. The plan stays editable; splitting into projects still
  works from the plan view.
- "Create scene outline" for an inline series writes the outline of the whole
  series in calls of `EPISODES_PER_CALL` (10) episodes: the button shows
  "Episodes a–b…", scenes are appended as each call returns (1–3 scenes per
  episode, titles prefixed "E<n> · "), and the per-call pacing plans are merged
  into one (scene numbers and timestamps offset, block ids `blk_<call>_<k>`,
  curve "wave"). A failed call keeps the scenes already written. The outline
  uses the plan as it reads at that moment.
- "Continue" in the outline view leads to Stage 4 as in any project.
- "Use split only" in the plan view turns the inline mode off (confirm); the
  written outline is kept.
- Stage 2's episode count/length controls and the Project settings episode
  field stay visible for an inline series.

**Data model.**
- `project.seriesPart` with `inline: true` on the master itself:
  `{ inline, parentId: <own id>, seriesTitle, total, from: 1, to: total,
  arcTitle: '', arcSummary: '', prevCliffhanger: '', episodes }` — built by
  `inlineSeriesPart(project)`. It carries no `episodeSeconds`; the length
  is read from `project.episodeSeconds`. It is refreshed from the plan every
  time the outline is created.
- `isSeriesMaster(p)` is now true for a series without `seriesPart` **or**
  with an inline one; `isSeriesInline(p)` is new. A segment project
  (`seriesPart` without `inline`) is unchanged.

**Files.**
- `src/lib/series.js`: `isSeriesInline`, widened `isSeriesMaster`,
  `inlineSeriesPart`, `seriesChunkProject(project, part, from, to)` (a view
  of the project limited to an episode range, fed to `stage3Prompt`).
- `src/stages/Stage3.jsx`: the wrapper picks plan / outline / both with the
  switch; `Stage3Outline` gains `viewSwitch`, `sceneFrom`,
  `generateInline` (chunked, own busy/error state).
- `src/stages/Stage3Series.jsx`: `viewSwitch` and `onKept` props, the
  "Keep in this project" panel (`keepHere`, `unkeep`), footer text.
- `src/styles.css`: `.series-view`, `.prod-option`.
- i18n: `ser.keepTitle`, `ser.keepHint`, `ser.keepBtn`, `ser.keepConfirm`,
  `ser.keptNote`, `ser.keptFooter`, `ser.unkeep`, `ser.unkeepConfirm`,
  `ser.view_plan`, `ser.view_scenes`, `ser.outlineProg`, `ser.prodTitle`,
  `ser.prodHint`, `tip.serKeep`,
  `tip.serUnkeep`, `tip.serView_plan`, `tip.serView_scenes`.

**Verified.** In the dev app with a stubbed text model: a 24-episode plan kept
in the project, the outline written in three calls with merged pacing plan,
the switch between the two views, Continue to Stage 4, and turning the mode
off. No real model run; a long inline series (many hundreds of shots in one
project) has not been load-tested.

---

## 7. Stage 5: auto queue per ready scene; delete a video

**Request.** Enable the auto queue as soon as one scene has prompts and first
frames for all its shots, so that scene's videos can be generated before the
other scenes are finished; generate videos only for shots without one; add
deleting a generated video, like deleting a generated image.

**Behaviour — auto queue.**
- A scene is **ready** when it has shots and every shot has a non-empty video
  prompt and a first frame (`project.shotImages[shotId]`). Other scenes are
  ignored — they no longer block the button.
- The "Auto queue" button is enabled when at least one ready scene has a shot
  without a video. Its hint and the confirmation state the number of videos
  and of ready scenes. With no ready scene the hint explains what "ready"
  means; with nothing missing it says so.
- The queue walks the ready scenes in order and generates **videos only**, and
  only for shots that have none (members of an H3 take are skipped, as
  before — their video is the take lead's). It no longer creates first frames;
  the workbench's own "Create scene media" still does images + videos for one
  scene.
- The finish toasts and the stop on a content policy refusal are unchanged
  (the Stop state itself is replaced in section 10).

**Behaviour — delete video.** The Video tab's button row shows a trash button
after the upload button when the shot has a video. After a confirmation it
removes the video and what was derived from it; the prompt and frames stay.
The shot then counts as "without a video" for the auto queue.

**Data model.** No new fields. Deleting removes the shot's key from
`shotVideos`, `videoGenDurations`, `shotVideoEngines` and `shotTrims`, and
the clip `h3_<shotId>` from the `h3mix` audio lane.

**Files.**
- `src/stages/Stage6.jsx`: `sceneReady`, `missingVideos`, `readyScenes`,
  `queueScenes`, `queueTotal`, `queueReason` replace `noPromptCount` /
  `queuePlan`; `runAutoQueue` iterates `queueScenes` and calls the
  workbench queue with `videosOnly: true`.
- `src/stages/Stage5.jsx`: `processSceneMedia({ silent, onStep, videosOnly })`
  skips the image pass and its count when `videosOnly`; `deleteShotVideo(shot)`;
  the trash button in the video button row.
- i18n: changed `s6.autoQueueTip` (params `{v}`, `{s}`),
  `s6.autoQueueNothing`, `s6.autoQueueConfirm` (params `{v}`, `{s}`); removed
  `s6.autoQueueNoPrompts`; new `s6.autoQueueNoScene`, `vid.delete`,
  `vid.deleteConfirm`.

**Verified.** In the dev app on a seeded two-scene project (one ready, one
not): button state and hint text in each case, the queue's scene list, and
deleting a video (button returns to enabled, timeline clip gone). The queue
itself was not started — the dev build is wired to the live ComfyUI.

---

## 8. Stage 5: Create video button as a progress bar

**Request.** The "Create video" button should double as the progress
indicator: when generation starts it switches to a progress-bar state and
shows the progress.

**Behaviour.**
- While a shot's video is being generated its button (same width, disabled)
  shows a fill bar behind the label and the text "NN% · m:ss". The clock is
  the real elapsed time; the tooltip gives elapsed and expected time.
- **The percentage is an estimate.** Neither backend reports step progress
  over the calls the app uses: ComfyUI's `/history` poll only says "not done"
  or "done", and Kling returns a status word. The bar is therefore driven by
  the expected duration of this kind of job, learned from finished runs on
  the same machine: linear to 90% at the expected time, then creeping toward
  99%, never 100% before the result arrives.
- The expectation is kept per `engine:resolution:mode` as seconds of work per
  second of requested video (running average, updated after every successful
  run; failures are not recorded). First-run defaults: H3 45, LTX 25, Kling 35.
- Applies to manual runs and to runs started by the scene queue / auto queue
  (visible when that shot's card is open).

**Data model.** Nothing in the project. `localStorage['storyreel.videoEta.v1']`:
`{ "<engine>:<resolution>:<mode>": <seconds per video-second> }`.

**Files.**
- `src/lib/videoEta.js` (new): `etaKey`, `expectedSeconds`, `recordRun`,
  `etaPercent`.
- `src/components/GenProgress.jsx` (new): the fill + label, ticking once a
  second on its own state.
- `src/stages/Stage5.jsx`: `vidProg` state (`{ shotId, startedAt,
  expectedSec }`) set in `genVideo` before the generator call and cleared in
  its `finally`; `recordRun` after a successful generation; the button gets
  the `progress` class and renders `<GenProgress>` while busy.
- `src/styles.css`: `.s5e-gen.progress`, `.gen-fill`, `.gen-label`.
- i18n: `vid.progressTip`.

**Verified.** `etaPercent` / `expectedSeconds` / `recordRun` values and the
rendered button state (fill width, label, tooltip, width unchanged at 168px)
in the dev app, by starting a job with every ComfyUI request stubbed. No real
generation was run, so the learned timings are untested against a real GPU run.

**Open.** True step progress is available from ComfyUI only over its
WebSocket, which the packaged app would have to reach through the Electron
main process (renderer requests to ComfyUI are rejected for their Origin).
Not built.

---

## 9. Stage 5: stop a video generation; one-hour video timeout

**Request.** Add a button to interrupt video generation, and raise the
timeout if it is under 30 minutes — some videos take up to 45 minutes.

**Behaviour — stop.**
- While a shot's video is being generated a stop button (square icon, accent
  outline) appears right after the Create video button. It asks for
  confirmation.
- ComfyUI engines (H3, LTX): the wait ends within one poll (2 s) and the job is
  taken off ComfyUI — `POST /interrupt` if it is the job currently running,
  or `POST /queue { delete: [id] }` if it is still pending. A job that belongs
  to someone else and happens to be running is never interrupted.
- Kling: only the wait ends. Kling has no cancel call, so an accepted task
  keeps running and is billed on Kling's side; its result is not collected.
- A stopped job shows no error. The scene queue and the assembly stage's auto
  queue stop with it (the latter through the `storyreel:queue-stop` window
  event). Nothing is recorded for the progress estimate.

**Behaviour — timeout.** Video jobs wait up to 60 minutes: ComfyUI video
(was 15) and Kling (was 25). Image, music and sound-effect jobs keep their
limits. The timeout message states the minutes.

**Files.**
- `src/lib/comfy.js`: `VIDEO_TIMEOUT_MS` (exported), `abortError`,
  `cancelPrompt(settings, id)`; `runGraph` takes `signal`; the three video
  generators (`generateComfyVideo`, `generateComfyRefVideo`,
  `generateComfyMultiVideo`) accept `{ onStatus, signal }` and pass
  `signal` + `VIDEO_TIMEOUT_MS`.
- `src/lib/kling.js`: `generateKlingVideo(..., { onStatus, signal })`,
  abort checks in the create back-off and the poll loop, 60-minute limit.
- `src/stages/Stage5.jsx`: `vidAbort` ref, `stopVideo`, the
  `AbortController` per job passed as the generators' third argument,
  `AbortError` swallowed in `genVideo`'s catch, the stop button, exported
  `QUEUE_STOP_EVENT`.
- `src/stages/Stage6.jsx`: listens for `QUEUE_STOP_EVENT` next to the policy
  event and cancels the auto queue.
- `src/styles.css`: `.s5e-ico.vid-stop`.
- i18n: `vid.stop`, `vid.stopConfirm`.

**Verified.** With every ComfyUI request stubbed in the dev app (no real job):
starting a job from the button, the stop button appearing, and an aborted wait
that issues `/interrupt` for a running job and a queue delete for a
pending one, raises `AbortError`, and the timeout constant is 60 minutes.
Not tested against a real ComfyUI job or a real Kling task.

---

## 10. Stage 5: auto queue button — "Abort creation"

**Request.** When the auto queue starts, switch its button to an "Abort
creation" state so the user can interrupt the automatic generation.

**Behaviour.**
- While the auto queue runs, the "Auto queue" button reads "Abort creation"
  (stop icon, danger style, same fixed width — the button is now
  `fixedw-lg`); the progress count `a/b` moved out of the label into a badge
  beside it.
- Clicking it asks for confirmation, then aborts: no further jobs are started
  **and the video being created is interrupted** (ComfyUI: interrupt / remove
  from the queue; Kling: only the wait ends — see section 9). Before, "Stop"
  let the running job finish first.
- An interrupted job is not counted as finished: the scene queue breaks before
  incrementing its counter, so the closing toast ("Auto queue aborted after
  N item(s)") counts completed videos only.

**Files.**
- `src/stages/Stage6.jsx`: `cancelAutoQueue` confirms first; the button
  markup (label, class, the count badge).
- `src/stages/Stage5.jsx`: the queue API's `cancel` also calls
  `vidAbort.current?.abort()`; `processSceneMedia` breaks after an
  interrupted `genVideo`.
- i18n: new `s6.autoQueueAbort`, `s6.autoQueueAbortTip`,
  `s6.autoQueueAbortConfirm`, `ind.autoQueueCount`; removed
  `s6.autoQueueStop`, `s6.autoQueueStopTip`; reworded `s6.autoQueueStopped`.

**Verified.** In the dev app with every ComfyUI request stubbed: starting the
queue switches the button to "Abort creation" with the count badge; aborting
issues the interrupt, the button returns to "Auto queue", and the toast
counts 0 finished. No real job was run.

---

## 11. Fix: video progress disappeared when another shot was worked on

**Report.** After starting a video, switching to another shot and creating a
prompt or an image there made the progress bar stop showing.

**Cause.** The workbench tracks "what is busy" in one shared state,
`imgBusy` (a single shot id / `id:kind` string). The video job marked itself
there as `<shotId>:vid`; an image, final-frame, location or voice action on
any other shot overwrote the value and, on finishing, reset it to `null` — so
the video's button fell back to its idle look while the job kept running.

**Fix.** The video job no longer uses `imgBusy`. Its busy state is `vidProg`
(`{ shotId, startedAt, expectedSec }`) alone:
- `vidBusy = vidProg?.shotId === shot.id` in the shot card;
- `genVideo` no longer sets or clears `imgBusy`; it returns at once when a
  video job is already running (`vidAbort.current` set);
- while a video runs on one shot, "Create video" on every other shot is
  disabled (`vidElsewhere`) — one video job at a time — and "Create scene
  media" is disabled too. Prompts, images and voice on other shots stay
  available and no longer affect the video's progress or stop button.

**Files.** `src/stages/Stage5.jsx` only.

**Verified.** In the dev app with every ComfyUI and Gemini request stubbed:
a video started on shot 1, then an image created on shot 2 and its prompt
recreated; back on shot 1 the progress bar and stop button are still shown
and the clock kept counting. No real job was run.

**Known, not changed.** The other kinds of jobs (image, final frame, location
plate, voice) still share `imgBusy`: starting one on a second shot hides the
"Creating…" label of the first, though both jobs complete.

---

## 12. MiniMax H3 video prompts: dialogue described and spoken, speech in English

**Request.** H3 video prompts must include descriptions of dialogues and
monologues and the characters' spoken lines; all direct speech in English.

**Behaviour.**
- **H3 speaks by default.** A dialogue shot's voice source used to default to
  "TTS", for which the H3 prompt deliberately contained no speech. The default
  is now "H3 native": the prompt carries the spoken lines and H3 voices them.
  An explicit per-shot choice still wins; a shot with no choice that already
  has a voice clip (`project.shotAudios[id]`) stays "TTS", so older projects
  with laid-in voices do not get a second voice.
- **Speech in English.** Every `<d>` tag is `<d>[English] …</d>`. A script line
  in another language is translated into natural spoken English (meaning,
  tone, register kept; sized to the shot's seconds; names unchanged). Before,
  native lines were passed verbatim in the script language. On-screen text
  still keeps its original language.
- **Dialogue and monologue are described.** The prompt writer must state who
  speaks to whom and in what order, each delivery (tone, volume, pace,
  emotion, pauses), the listener's reactions, and for a monologue whether it
  is spoken aloud alone, addressed to someone silent, or an inner voice /
  voiceover; lines are timed against the action.
- Shots explicitly set to "TTS" behave as before: the character visibly
  delivers the line and the delivery is described, but no speech reaches any
  audio field.
- Applies to every H3 prompt path that uses `stage5H3VideoPrompt` (plain,
  takes, reference and multi-frame modes). LTX and Kling prompts are
  unchanged. Existing stored prompts change only when recreated.

**Data model.** No new field. `project.shotVoiceSources[shotId]` now holds
only explicit choices (`'native'` | `'tts'`); the effective value comes from
`voiceSourceFor(project, shotId)`.

**Files.**
- `src/lib/prompts.js`: new exported `voiceSourceFor`; `H3_SYSTEM` — the
  speaker rule, two new rules (English speech; describe every exchange) and
  the language hard rule; the "Dialogue handling" paragraph of
  `stage5H3VideoPrompt`; both `native` checks use `voiceSourceFor`.
- `src/stages/Stage5.jsx`: `voiceSourceOf` delegates to `voiceSourceFor`.
- `src/lib/storage.js`: field comment.
- i18n: reworded `vsrc.nativeHint`, `tip.vsrc_tts`, `tip.vsrc_native`.

**Verified.** The built prompt for a seeded scene (a Russian dialogue shot
with no choice, one with an existing voice clip, one explicitly TTS) inspected
in the dev app: tags and instructions as described. No model call — the
quality of the English lines and of H3's delivery is untested.

---

## 13. Fix: video button row wrapped when the stop button appeared

**Report.** When the stop button appears during video generation, the buttons
of the row shift onto the next line.

**Cause.** The stop button (38px + the row's 10px gap) was added to a row that
was already full in the compact card, next to the 168px Create video button.

**Fix.** While the job runs, the Create video button is 48px narrower
(`.s5e-btnrow .s5e-gen.progress`: 120px, side padding 6px), so button + stop
button occupy exactly the idle button's 168px. The upload, delete, resolution
and workflow controls keep their positions. The progress label ("NN% · m:ss")
fits the narrower button.

**Files.** `src/styles.css` only.

**Verified.** In the dev app with ComfyUI stubbed: the row height and the
positions of the controls after the button are identical idle and running.

---

## Open

- The reworded image styles (section 4) have not been compared visually with the old ones.
- The story text is assembled, not rewritten; if a literary rewrite by the
  text model is wanted, it is a separate feature.
