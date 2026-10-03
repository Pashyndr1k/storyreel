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
- A "Pinned versions" section below the idea grid lists the pins (dashed
  cards, with a count). It stays when "Create/Recreate ideas" replaces the
  idea cards. Each pinned card has "Develop this version" (same action as on
  an idea card: sets the approved plot and the selection) and a remove button.
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
  the shared `ideaCard(idea, inPinned)` renderer (replaces the inline card
  markup), the pinned section, the "Pin this plot" button.
- `src/styles.css`: `.idea-head`, `.idea-pin`, `.idea-card.pinned`,
  `.pinned-title`.
- i18n: `s1.pinnedTitle`, `s1.pinnedHint`, `s1.pinPlot`, `s1.plotPinned`,
  `s1.pinnedPlotTitle`, `tip.s1Pin`, `tip.s1Unpin`, `tip.s1PinPlot`,
  `tip.s1PlotPinned`.

**Verified.** In the dev app with a stubbed text model: pin, regenerate ideas
(pin stays), develop the pinned version, pin the edited plot, unpin.

---

## Open

- The reworded image styles (section 4) have not been compared visually with the old ones.
- The story text is assembled, not rewritten; if a literary rewrite by the
  text model is wanted, it is a separate feature.
