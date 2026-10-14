# Unreleased (after 2.18.0)

Base: tag `v2.18.0` (commit `77a966e`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. "Unconventional plot": six opt-in options on Stage 1

**Request.** The four plot directions kept using the same narrative
techniques. Research techniques beyond the randomization engine that keep
the model off the obvious path without breaking coherence (the paper
"Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM
Diversity", Zhang, Yu, Chong, Sicilia, Tomz, Manning, Shi, arXiv
2510.01171 / ICML 2026, and the VentureBeat write-up were supplied); the
user's own ideas — random words on the timeline, a dialogue drawn from the
story, random numbers linked to plot structures — and a set of writing
techniques for Stages 3–4. Then: keep the old way of handling the plot by
default and offer everything as options on Stage 1.

**Behaviour.** A second block under the randomization cards, "Unconventional
plot (optional)": six toggle cards, all off, stored on the project
(`project.originality`, `src/lib/originality.js`). Nothing changes while they
are off — the prompts are the old ones.

- **Sample the space** (`sampling`). Stage 1 asks for the four directions as
  samples from the whole space of possible directions, each with the
  model's own probability, every one below 0.10 and from a different region,
  after a silent pass that lists the ten most obvious directions and
  discards them (verbalized sampling: a request for one answer collapses to
  the most typical one; a request for a distribution with verbalized
  probabilities recovers the base model's diversity, +86% diversity for
  +12% cost in the paper). The JSON gains `probability`; the idea card
  shows "typicality N%". For a series the space stays inside the engine.
- **Subversion pass** (`subversion`). Stage 2 lists the turns a reader would
  predict from the approved direction, keeps at most one as a feint and
  replaces the rest with turns that grow out of these characters and this
  world; the replacements must be as strong as the clichés they displace.
  The JSON gains `subversions`; Stage 2 shows them under the synopsis.
- **Writing rules** (`writing`). The scene outline (both engines), the shot
  breakdown (both) and the smart edit carry the supplied techniques adapted
  to screenwriting: the consensus killer per scene and per shot, a banned
  list of stock images, stock lines and the assistant register, sentence
  rules, one concrete anchor per action block, one odd detail and one
  sayable line per scene, the read-aloud loop. Never on the image / video
  prompt writers.
- **Story dice** (`dice`, `project.storyDice`). Up to five words, rolled from
  a bank of 161 (`src/data/story_dice.json`: objects, places, weather and
  time, animals, events, senses, people) or typed, each pinned to a point of
  the timeline — opening / early / middle / late / ending (for a series: the
  first episode / first third / middle / last third / final episode). The
  prompts of Stage 1, Stage 2, the series sections and episodes and the
  scene outline require each word to appear materially at its point and to
  matter there, never as a cameo.
- **Structure die** (`structure`, `project.structureDie`). One of 46 blocks
  (`src/data/plot_blocks.json`: Polti's thirty-six dramatic situations with
  their elements, and ten narrative forms — in medias res, frame story,
  kishōtenketsu, reverse chronology, two accounts, bottle, false
  protagonist, told through documents, the planted thing that never fires,
  parallel lines), rolled at random (never the same twice in a row) and
  applied to the beginning, the middle (default), the ending or the whole;
  the rest of the story stays free but must lead into it and out of it.
- **Story interview** (`interview`, `project.interview`). "Ask three
  questions" runs `interviewPrompt`: three questions impossible to ask about
  any other story (they name a person, an object or an event of the brief
  and open a door it has not opened; never genre, tone, length or audience),
  each with three concrete answers that lead to different places. The user
  picks an answer or writes one; answered questions become "the author's
  answers", binding facts in the Stage 1, Stage 2, series-plan and outline
  prompts.

**How.** `src/lib/originality.js`: the flag normaliser, the dice (slots,
bank, roll, normalise), the plot blocks (roll, where), the interview
normaliser and `plotConstraintsText(project)` — the text the prompts
append for dice, structure and interview. `src/lib/prompts.js`: `VS_RULE`,
`SUBVERSION_PASS`, `WRITING_RULES` gated by the flags (`writingFor`),
`plotConstraintsText` appended to the user texts, `interviewPrompt`.
`src/components/OriginalitySelector.jsx`: the cards and the three panels.
`src/stages/Stage1.jsx`: renders it and runs the interview through the
stage's generator. `src/lib/storage.js`: defaults and migration of the
four fields. i18n `orig.*` in EN/RU/UK; styles `.orig-*`, `.dice-*`,
`.plot-block`, `.interview-*`.

**Verified** in node: with every option off, the Stage 1–4 and smart-edit
prompts are byte-identical to the previous ones; with each option on, only
its text appears, in the prompts it belongs to. In the dev app: the cards
toggle, the dice roll and pin, the block rolls and moves between acts, the
interview panel shows questions and keeps answers.

**Files.** `src/lib/{originality,prompts,storage}.js`,
`src/data/{story_dice,plot_blocks}.json`,
`src/components/OriginalitySelector.jsx`, `src/stages/Stage1.jsx`,
`src/lib/i18n.js`, `src/styles.css`, `CHANGELOG.md`.

## 2. Settings → Backups: one place for every restore

**Request.** Move the project "Restore" function from the Home page into
Settings → Backups and merge it with the backup restoration process.

**Behaviour.** The Home page no longer has a Restore button. The Backups tab
of Settings (the first tab) now holds, in order:
- **Projects** — the backup file, as before: export all projects and styles
  as one JSON file, import a backup.
- **Project folders** (desktop only) — "Restore projects…" opens the
  restore window that used to live on Home: the per-project folders under
  the projects directory, newest first, projects already in the app and
  older copies unticked; the ticked ones come back with their ids, parts
  and media.
- **The vault** (desktop only) — the status line says what the vault holds
  (library entries and when they were saved, styles saved when, settings
  saved when, or "No vault yet"), with four buttons: **Back up now**
  (writes the library, the styles and the settings without the API keys),
  **Restore library** (adds the vault's entries the library lacks, then
  whatever the projects' cards imply for projects with no entries; nothing
  is removed), **Restore styles** (replaces the styles with the vault's copy
  after a confirm), **Restore settings** (applies the vault's settings, keys
  untouched, after a confirm; the window closes). A message under the
  buttons reports the outcome. The automatic start-up restore of the
  vault (§5 of 2.18.0) is unchanged.
- **Styles** and the **projects directory**, as before.

**How.** `App.jsx` owns `restoreProjects` (moved from Home) and passes
`library`, `setLibrary` and `onRestoreProjects` to `SettingsModal`; the
modal mounts `RestoreProjectsModal` and runs the vault actions through
`lib/vault.js` (`vaultLibraryInfo`, `vaultJsonInfo` added for the status
line; `vaultReadLibrary`, `vaultReadJson`, `vaultWriteLibrary`,
`vaultWriteJson`) and `lib/library.js` (`persistLibraryEntry`,
`rebuildLibraryFromProjects`). Manual actions are logged as
`vault.backup`, `library.restoreVault`, `styles.restoreVault`,
`settings.restoreVault` with `manual: true`. i18n `set.restoreFolders*`,
`set.vault*`, `set.backupNow`, `set.restore{Library,Styles,Settings}`,
`tip.vault*` in EN/RU/UK (`home.restore` and `tip.restoreProjects` stay for
the button in Settings).

**Verified** in the dev app with a stubbed file bridge: the Backups tab shows
the three sections; "No vault yet" turns into the three saved-at entries
after Back up now; "Restore projects…" opens the restore window listing the
folders. Node: the two info readers return null without files and the
counts and dates with them.

**Files.** `src/components/SettingsModal.jsx`, `src/pages/Home.jsx`,
`src/App.jsx`, `src/lib/vault.js`, `src/lib/i18n.js`.

## 3. docs/short-drama-engines.md

A comparison of the two short-drama engines (Short drama / Short Drama 2):
what they share, a side-by-side table of every difference (beats, hook
types, openings, cadence, landmarks, dialogue budget, locations, shots, the
frame rule, the checks) and which to choose.

## 4. Stage 5: mark areas on the first frame for Tweak

**Request.** A pencil icon next to the preview frame; clicking it lets the
user draw over the image with a bright marker to highlight what to change
with Tweak; an "Erase" button clears the drawing; the drawing is merged into
the image only when Tweak is pressed; a video generated instead uses the
clean image as its first-frame reference.

**Behaviour.**
- With a shot selected and its first frame in the preview (Image tab,
  first frame), a small toolbar at the bottom of the preview shows the
  **pencil**. Clicking it turns the marker on: the cursor is a crosshair, a
  hint says what the strokes do, and dragging over the picture draws a
  bright magenta stroke (round, about 3% of the frame's width). Clicking the
  pencil again turns the marker off; the strokes stay. **Erase** (shown while
  marking or while strokes exist) removes every stroke.
- The strokes live beside the frame (`project.shotMarkups[shotId]`, a
  transparent PNG at the frame's natural size); the frame itself is never
  changed. They are dropped when the frame changes: a new version from
  generation or Tweak, or another version selected.
- **Tweak** (the refine row of the shot card) with strokes present merges
  them into a copy of the frame and sends that copy as the edit reference,
  with the instruction extended: the magenta strokes mark the areas to
  change, they are annotations and the result must carry none. The
  resulting new version replaces the frame; the strokes are cleared.
- **Video**, the final frame, references, exports and the mirror all read
  `shotImages`, which stays clean; the strokes never reach them.
- The standalone (non-embedded) Stage 5 card carries the same tools over
  its frame image; in the embedded workbench the picture lives in the
  preview, so the tools live there.

**How.** `src/components/MarkupCanvas.jsx`: the layer (canvas at the
image's natural size, pointer-captured strokes, `toDataURL` on pointer-up,
repaint from the stored PNG, inert when inactive). `src/lib/images.js`
`mergeMarkup` (picture + strokes → JPEG). `Stage6.jsx`: the layer sized
like the subtitle overlay (`videoDims` + `pvBox`), the pencil / Erase
toolbar (`.pv-ctrl.mark-ctrl`), `markMode` reset on shot / tab / frame
change. `Stage5.jsx`: `markupOf`, `setMarkup`, `dropMark` (in
`pushVersion` and `selectVersion`), `markTools` for the standalone card,
`refineImage` merging and the extended instruction. `storage.js` default
and migration; `projectFiles.js` split / merge (`mark_<shotId>.png`).
Icons `Pencil`, `Eraser`. i18n `mark.*`, `tip.markErase` in EN/RU/UK.

**Verified** in the dev app with a stubbed image model: a stroke drawn in
the preview shows as magenta pixels on the layer and is stored as
`mark_sh1.png` while the frame record stays the clean image; Erase clears
it; after a new stroke, Tweak sent a reference that differs from the clean
frame and contains magenta pixels, with the instruction naming the marks;
the returned frame became a new version and the strokes were cleared.

**Files.** `src/components/MarkupCanvas.jsx`, `src/components/icons.jsx`,
`src/lib/{images,storage,projectFiles}.js`,
`src/stages/{Stage5,Stage6}.jsx`, `src/lib/i18n.js`, `src/styles.css`.

## 5. Stage 1: the plot tools as one row of chips

**Request.** Make all randomization tools compact, on one line under the
brief plot description.

**Behaviour.** The two card grids (Randomize, Unconventional plot) are one
row of toggle chips under the brief: "Randomize 0/2 · Oblique · Auteur ·
Mashup · Variance" and "Unconventional 0/6 · Sample space · Subversion ·
Writing rules · Story dice · Structure die · Interview". A chip's hover hint
carries the full name and the explanation the cards used to show; the group
labels carry the old titles. The randomization limit (two, the oldest
dropped) is unchanged. The story dice, structure die and interview panels
appear under the row only while their chip is on; the row wraps on a narrow
window.

The chips are rectangular StoryReel buttons (uppercase, sharp, the
segmented control's inked "on" state), not pills, and all ten share the
width of the widest label, measured at render time so it holds in every
language (`--chip-w` on `.plot-tools`).

**How.** `RandomizationSelector` and `OriginalitySelector` render chips
(`.tool-group`, `.tool-chip`); `OriginalityPanels` (same file) renders the
three panels; Stage 1 lays them out in `.plot-tools`. i18n `rand.short`,
`rand.short_*`, `orig.short`, `orig.short_*` in EN/RU/UK.

**Files.** `src/components/{RandomizationSelector,OriginalitySelector}.jsx`,
`src/stages/Stage1.jsx`, `src/styles.css`, `src/lib/i18n.js`.

## 6. Sharp corners everywhere

**Request.** Do any UI elements have a 3 px corner radius? Replace all of
them with sharp rectangular shapes.

**What was found.** `src/styles.css` carried 123 rules with
`border-radius: 3px`, the tokens `--r-panel`, `--r-btn` and `--r-btn-sm` at
3 px, and smaller radii on 32 more rules (1, 2, 4, 6, 7, 8 and 13 px:
badges, swatches, dots, the counter bubble, the Stage 1 option panels).

**Behaviour.** Every one of them is now 0: buttons, inputs, cards, modals,
panels, chips, badges, thumbnails, swatches and overlays are sharp
rectangles. The only radii left are the eleven true circles
(`border-radius: 50%`: dots, the tile dot, round indicators). The three
tokens are 0, so new rules that use them stay sharp.

**Verified** in the dev app by walking every element's computed
`border-radius` on the Home page and on Stage 1: nothing but 0 and 50%.

**Files.** `src/styles.css`.

## 7. One backup system

**Request.** Unify the backup system: one way of saving projects, styles and
settings backups, the most reliable and best-designed one; drop what is
outdated and the redundant copies.

**What was redundant.** Projects were backed up twice (the JSON "Export all
projects" with every media file base64-encoded into one file, and the
per-project folders written on every change); styles three times (inside
that JSON, the Settings "Styles" export / import which duplicated the Styles
page's own, and the vault); settings once (the vault). The Settings tab also
showed the Styles section with the projects' button labels (a shared i18n
key). Restoring was spread over "Import backup…", "Restore projects…" and
three vault buttons.

**The one system.** The backup is the projects directory: every project in
its own folder (project file + media), and the library, the styles and the
settings (without the API keys) in the vault — all written on every change.
Copying that folder is a full backup. The Backups tab shows one section:
- a status line — "projects: N folders · library: N entries · styles ·
  settings · last written …" (or "Nothing written yet");
- **Back up now** — rewrites every project folder (one at a time, through
  the mirror) and the vault;
- **Restore…** — one window with two parts: the project folders (as
  before: newest first, those in the app and older copies unticked) and the
  vault's copies (Library — adds what the app lacks, then what the
  projects' cards imply; Styles — replaces; Settings — applies, keys
  untouched), each a checkbox, one "Restore selected", one log;
- the projects directory row, unchanged.

**Removed.** The JSON export / import of all projects (and its
replace-everything import), the Settings copy of the styles export / import
(the Styles page keeps its own, which is the sharing format), the three
separate vault restore buttons and their confirms, the dead
`buildProjectExport` in `exportScript.js`, `RestoreProjectsModal` (replaced
by `RestoreModal`), and 34 i18n keys they used. The per-project ZIP export
and import on Home stay: that is how one project travels.

**How.** `SettingsModal`: `backupNow` (calls App's `backupAllProjects`, then
writes the vault), `restoreVault(sel)` for the modal, one status from the
vault infos plus the folder count. `App.jsx` `backupAllProjects` (every
project through `mirrorProjectToDisk`). `RestoreModal.jsx`. i18n
`set.backupTitle`, `set.backupHint`, `set.backupStatus`,
`set.backupStatusNone`, `set.backupBusy`, `set.backupDone`,
`set.restoreBtn`, `tip.backupNow`, `tip.restoreOpen`, `rst.projectsTitle`,
`rst.vault*`, `tip.rstVault_*` in EN/RU/UK; `rst.title` / `rst.hint`
reworded.

**Verified** in the dev app with a stubbed bridge: the tab shows the one
Backup section and the directory row; "Nothing written yet" becomes the
status line after Back up now, which wrote the project folder files and
the three vault files; Restore… lists the folder and the three vault rows,
and restoring the ticked library and styles writes two log lines.

**Files.** `src/components/{SettingsModal,RestoreModal}.jsx`
(`RestoreProjectsModal.jsx` removed), `src/App.jsx`,
`src/lib/exportScript.js`, `src/lib/i18n.js`.
