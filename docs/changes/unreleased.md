# Unreleased (after 2.16.0)

Base: tag `v2.16.0` (commit `9198f4e`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. The "Short Drama 2" template (a second short-drama engine)

**Request.** A second project template, "Short Drama 2", built like the
existing "Short drama" one but with its genre conventions, plot construction,
shot composition, pacing and episode structure derived from the *AI Short
Drama Series: Production Manual* (the sections "Publishing and Iterating",
"Checklists" and "Pre-Production for AI" excluded) and from the articles the
manual cites. Video prompts are written for MiniMax H3, images for Nano
Banana 2.1.

**What the user sees.**
- The new-project modal has a fifth type card, **Short Drama 2** ("vertical
  series · production manual"), right after "Short drama". It behaves like
  the series card: 9:16 by default, the episodes row (count, 60/90/120 s), the
  series plot placeholder.
- The project is an ordinary series project (`scriptType: 'series'`) with
  `project.dramaEngine: 'v2'`; everything that keys on series (Stage 3
  series planning, episode projects, assembly by episode, the drama check)
  works unchanged. Episode projects inherit the engine from their master.
- Project settings show a read-only **Template** line for a series ("Short
  drama" or "Short Drama 2").
- Stage 3 (series plan): the hook selector of a v2 episode offers the six
  cliffhanger types of the manual — Revelation, Reversal, Deadline,
  Intrusion, New arrival, Withheld — each with a tip; the paywall badge reads
  "Last free episode" and a "Twist window" badge marks where the season's
  big twist lands (two episodes before to one after the paywall).
- The drama check modal shows the v2 landmarks line (problem personal in 1,
  opponent's move, first failure, last free episode, twist window, darkest
  point, resolution).

**The engine (`src/lib/shortDrama/rules2.js`).** Same export surface as
`rules.js`, different content:
- **Hook (cliffhanger) types** `revelation / reversal / deadline / intrusion /
  arrival / withheld`, rotated (no fixed opening sequence; `OPENING_HOOKS`
  is empty). The last shot's note is `CLIFF · REVELATION` etc.
  (`HOOK_TAG`, `TAG_PREFIX`).
- **Beats** `hook / friction / turn / spike / button`.
- **Limits.** 135 words a minute (`WORDS_PER_SEC` 2.25; ≈203 words per 90 s,
  270 per 120 s), lines ≤16 words, action ≤40 words, 2 locations per episode
  and 3 per series, hook readable inside 3 s, a beat every ~30 s, a shift
  every 10 s (8–10 s blocks), shots 3–6 s, a scene change at most every 20 s,
  no speaking mouth on screen for more than 5 s of one line (`EXTRAS`).
- **Season landmarks** (`seasonLandmarks`): episode 1 ends when the problem
  becomes personal, 2 on the opponent's first move, 3 on the first failed
  attempt; the paywall is the last free episode (5–10 free episodes on a long
  run, the middle of a short one; none under five episodes), the twist window
  is paywall−2…paywall+1, the first paid episode pays the cliffhanger off
  inside ~10 s; phases establish / deepen / darkest / resolve scaled from the
  manual's 1–10 / 11–40 / 41–70 / 71–end map.
- **Timing grid** HOOK 0–3 s → FRICTION → TURN (≈ a third) → ESCALATION →
  SPIKE → BUTTON (last 5–10 s), scaled to the episode length.
- **The brief** (`DRAMA_CORE`): the business shape (free episodes, the last
  free episode's reveal, the first paid episode), the one-sentence premise
  with built-in conflict (enemies-to-lovers, forbidden proximity, power
  imbalance, forced circumstances), the four-part engine (want, fresh
  obstacles, ticking clock, open question; information imbalance as the
  renewable turn source), the genre table, the season phases and the first
  ten episodes, the beat sheet with the mute test and the "what changed?"
  test, hook types and the things never to open on (scenery, voice-over,
  recaps), the six cliffhanger types and what makes one real, dialogue rules
  (every line advances conflict or reveals character, no feelings named,
  conflict within 2–3 lines, the word budget, ≤5 s mouth-visible speech),
  writing for the close-up (reaction beats, evidence on screen, 1–2
  characters a scene, dramatic irony), pacing for the cut (8–10 s blocks, no
  slow scenes, jump cuts welcome, the last 3 s carry the hook, captions
  25 × 3).
- **Stage briefs** (`DRAMA_STAGE`): ideas (premise + Setup / Want / Clock /
  Question / Antagonist / Paywall reveal / Dramatic irony), storyline (the
  season map, fixed identity blocks and anchor attributes per character, one
  immutable detail and key-light direction per location), arcs (phases, the
  first section ends at the last free episode), episodes (the beat sheet
  fields, cliffhanger rotation), outline (1–3 scenes, the first scene opens
  inside the conflict, later scenes on a close detail), shots (3–6 s, one
  beat each, anchor shots, singles / inserts / reactions, the `CLIFF · TYPE`
  note).
- **The frame rule** (`DRAMA_FRAME_RULE`) for the image and video prompt
  writers: vertical zones (face in the top third, eyeline on the top-third
  line, evidence in the middle third, bottom third quiet for captions, right
  edge clear, centre two-thirds), one subject per frame, depth built
  vertically, establish by detail not wide shot; the identity block pasted
  verbatim; Nano Banana 2.1 image prompt shape (shot type + zones + identity
  + action/emotion + location detail + light + lens); MiniMax H3 video prompt
  shape (one beat per clip, 3–6 s, one or two exchanges, identity verbatim,
  static or one slight move, lines in `<d>` tags, ≤5 s mouth-visible speech
  split across internal cuts, ambient under dialogue, no music).
- `dramaRulesSummary(project)` returns all of that as data.

**The dispatcher (`src/lib/shortDrama/engine.js`).** `rulesFor(project)`
returns the active engine's surface (`engine`, `label`, hook types and
labels, `hookTag`, `tagPrefix`, beats and `beatEnum`, the limits, landmarks,
timing grids, briefs, `frameShort`, `landmarksText`, `arcsNotes`,
`episodePlanNotes`, `shotsSceneNote`, `check`, `dramaRulesSummary`,
`extras`). Every former direct import of `rules.js` constants goes through
it: `prompts.js` (`dramaSystem`, `seriesArcsPrompt`, `seriesEpisodesPrompt`,
`stage4Prompt`, the `withDrama` wrappers — the frame rule and the smart-edit
extra are now per project), `agent/api.js`, `shortDrama/check.js`,
`Stage3.jsx`, `Stage3Series.jsx`, `Stage4.jsx` (`mapShots` takes the
project). `rules.js` gained the same hook exports (`HOOK_TAG`, `TAG_PREFIX`,
`FRAME_SHORT`, `landmarksText`, `arcsNotes`, `episodePlanNotes`,
`shotsSceneNote`, `CHECK`) with the v1 texts moved out of prompts.js
unchanged.

**The check (`check.js`).** Reads the engine's `CHECK` config: open/cliff
beat names, which beats count as turns, the weak paywall hook types, whether
a first win is expected (v1 only), whether every scene must open without
dialogue (v1) or only the later scenes of an episode (v2 — its first scene
opens on the hook, which may be a line). New v2 issues: `long-speech` (a
shot keeps a speaking mouth on screen for more than 5 s of one line) and
`locations-series` (more than three locations across the series). The hook
frame message names the engine's tag (`HOOK · TYPE` / `CLIFF · TYPE`). The
report carries `engine`.

**Storage.** `projectDefaults().dramaEngine = 'v1'`; `migrateProject`
normalises it; `newProject({ dramaEngine })`; `series.js` copies the master's
engine into episode projects; `split.js` clones carry it.

**Agent.** `storyreel_create_project` accepts `dramaEngine: 'v1' | 'v2'`
(series only). `storyreel_drama_rules` returns `engine`, `engineLabel`,
`hookTag` and the engine's own data and briefs; `storyreel_get_project`'s
`shortDrama` has `engine`; `storyreel_review_shot`'s `expected.shortDrama.frame`
is the engine's frame summary. `agent/AGENT_GUIDE.md` and `docs/agent-api.md`
describe the two engines.

**i18n.** `new.type_series2`, `new.typeHint_series2`, `drama.hookTip2`,
`drama.hook_{revelation,reversal,deadline,intrusion,arrival,withheld}` (+
`_tip`), `drama.paywall2`, `drama.paywallTip2`, `drama.twist`,
`drama.twistTip`, `drama.landmarks2`, `pset.template`, `pset.templateTip`
in EN/RU/UK.

**Files.** `src/lib/shortDrama/{rules2,engine,rules,check}.js`,
`src/lib/{prompts,storage,series}.js`, `src/lib/agent/api.js`,
`src/stages/{Stage3,Stage3Series,Stage4}.jsx`,
`src/components/{NewProjectModal,ProjectSettingsModal,DramaCheckModal}.jsx`,
`src/pages/Home.jsx`, `src/lib/i18n.js`, `agent/AGENT_GUIDE.md`,
`docs/agent-api.md`, `CHANGELOG.md`.

## 2. Short drama: how the cast looks (no scars)

**Request.** The screenwriter kept giving the protagonist a scar. The genre
casts attractive people with striking, modern details — tattoos, coloured
hair, contemporary accessories — with tasteful contemporary styling and
modern make-up. Instruct the screenwriter accordingly.

**Behaviour.** A shared `CAST_LOOK` rule (`src/lib/shortDrama/rules.js`) is
appended to the storyline-stage brief of BOTH engines: every character —
lead, love interest, antagonist, supporting — is attractive and camera-ready
in a contemporary way (modern styling, make-up, grooming); striking details
are modern and chosen on purpose (a tattoo with its place and subject,
coloured or boldly styled hair, a piercing, a signature accessory, a sharp
haircut, a manicure, a distinctive garment); never a scar, disfigurement,
burn, missing tooth, limp or wound as an identifying mark, for anyone;
villains are attractive too, their menace in behaviour and styling. The
v2 identity block asks for "one modern distinctive detail (… never a scar)"
instead of "one distinctive feature", and the series storyline JSON field
names the rule. `dramaRulesSummary` of both engines returns `castLook`;
the agent guide tells the agent to flag a card that breaks it.

**Files.** `src/lib/shortDrama/{rules,rules2}.js`, `src/lib/prompts.js`,
`agent/AGENT_GUIDE.md`, `CHANGELOG.md`.

## 3. Home: an inline series was hidden by the nested cards

**Bug.** An inline series (a series written inside one project, never split
into episode projects) carries `seriesPart` with `parentId` equal to the
project's own id (`inline: true`). The nested-cards grouping of 2.16.0
(`src/lib/projectGroups.js`) treated that as "a child whose parent is on the
page" and hid the card — the project existed in the database but never showed
on Home, so it looked lost.

**Fix.** `parentIdOf(p)` ignores a parent id equal to the project's own id.

## 4. Restore projects from the project folders

**Why.** The app mirrors every project into
`<projectsDir>/<title>/` (project.md with the full media-free project
payload, plus every image, video and audio as a file). That mirror is the
recovery source when the IndexedDB store loses records (it happened on
2026-10-11: an external read of the database rebuilt it from the write-ahead
logs and discarded the compacted tables; see the memory note on never
opening the app's IndexedDB from another Electron process).

**What the user sees.** Home has a **Restore** button (Electron only, before
"New project") that opens "Restore projects": every folder under the
projects directory that holds a project payload, newest first, with the
title, scene count, size and save time. Folders whose project is already in
the app are unticked and marked "in the app"; an older folder of a project
listed above (a pre-rename copy) is marked "older copy" and unticked; a
folder without an id comes back as a new project. "Select all" / "Select
none"; "Restore selected" brings the ticked projects back one by one (a
progress line names the current one, then a log lists the results). A
restored project keeps its id, dates, stage, parts and media; the folders are
not changed.

**How.** `electron/projectDirs.cjs`: `listProjectDirs(root)` (skips folders
starting with "_"), `readProjectDir(root, folder)` (project.md text + media
file names), `readProjectFile(root, folder, name)` (one file, base64); all
three refuse paths outside the root. IPC `list-project-dirs`,
`read-project-dir`, `read-project-file` in `main.cjs`; the preload exposes
them on `window.localFiles`. `src/lib/projectFiles.js`: `parseProjectMd`
(shared with the ZIP import), `mediaRefsOf`, `listRestorableFolders`,
`restoreProjectFromFolder` (reads only the media files the project refers
to, one at a time, then `mergeProjectMedia`). `RestoreProjectsModal.jsx`;
Home `restoreProjects` (migrate, keep the id, skip ids already present, log
`project.restore`). i18n `home.restore`, `tip.restoreProjects`, `rst.*`,
`tip.rst*` in EN/RU/UK; styles `.rst-*`.

**Files.** `electron/{projectDirs,main,preload}.cjs`,
`src/lib/{projectFiles,projectGroups}.js`,
`src/components/RestoreProjectsModal.jsx`, `src/pages/Home.jsx`,
`src/lib/i18n.js`, `src/styles.css`.
