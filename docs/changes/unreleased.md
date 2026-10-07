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
