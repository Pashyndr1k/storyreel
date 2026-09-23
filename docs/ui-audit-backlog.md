# UI / code audit — open items (2026-09-22)

Audit of terminology, hardcoded values, per-content-type styling, layout
adaptivity and the control system. What was fixed is in CHANGELOG 2.6.0
("Audit"). This file lists what was **found but deliberately left**, so it
can be picked up later without re-auditing. Paths are relative to the repo.

## Terminology (rename optional — churn, not user-visible)
- `src/stages/Stage6.jsx` still holds the merged Stage 5 (`Stage6` component,
  `s6.*` i18n prefix, `.s6-*` classes, `stage6SmartCutPrompt`). The header
  comment explains it; a rename touches ~120 keys and every import.
- `src/stages/Stage5.jsx` is the embedded shot workbench (`s5.*` keys).
- `docs/minimax-h3-proposal*.md`, `docs/h3-implementation-plan.md` mention
  "Stage 6" — historical design docs, left as written.

## Hardcoded values worth centralising next
- Per-category duplicates: `MAX_LOCATION_PHOTOS` (6, five sites in Stage5),
  `MAX_CHARACTER_PHOTOS` (3, six sites), `MAX_GENRES` (3, four sites),
  `'16:9'` written out in ~20 places although `aspect.js` exports
  `DEFAULT_ASPECT`, four per-ratio dimension tables in `comfy.js`.
- Frame math: `24`, `17`, `5` inside `h3Frames/h3Seconds` (`comfy.js:84-87`)
  while `h3multi.js` exports `H3_GUIDE_FPS`; export fps `25` in
  `Stage6.jsx:1095` vs 24 fps H3 clips; `captureStream(30)`.
- `CUT_ACTIONS` / `CUT_TYPES` in `Stage6.jsx` repeat `dynamics_config.json`;
  transition `dur` values should derive from `overlap_frames / fps`.
- `dynamics_config.json` says `generation_padding_sec: 3`; code and comments
  use +2 s (`comfy.js`, `storage.js:195`). Decide which is right.
- `NLE_GUT = 92` (Stage6) mirrors `--nle-gut: 92px` (CSS) by comment only.
- Languages: `LANG_NAMES` (prompts.js) = `OMNI_LANG` (comfy.js); short labels
  `{ en: 'EN', ru: 'RU', uk: 'UA' }` in `Project.jsx` and `AppShell.jsx`.
- Settings defaults live in both `storage.js` and `SettingsModal.jsx`
  (`imageService`, `voiceService` only in the modal); `settings.lang || 'en'`
  / `theme || 'dark'` repeated in six pages.
- `'Untitled project'` used as a sentinel in `Stage1.jsx:31`.
- ComfyUI node ids as magic strings throughout `comfy.js`; a per-template
  `NODES` map next to each JSON would make the workflows swappable.
  `src/data/comfy/video_minimax_h3_i2v.json` is not imported anywhere.
- `updateCheck.js` repeats the GitHub owner/repo from `package.json`.
- `electron/main.cjs:148` `backgroundColor: '#151514'` is the dark `--bg`.
- Token budgets: 17 `maxTokens` literals; `stage6SmartCutPrompt` (4000) and
  `smartEditPrompt` (8000) do not scale with project size.
- Timeouts: 15 min for every video render regardless of length/resolution.
- Filename prefixes: ten copies of `.slice(0, 24)`; one `safeName()` helper.

## Strings that bypass i18n
- `ErrorBoundary.jsx` (4 strings), `storage.js` alerts, Electron dialog
  titles (`main.cjs:76,103,105`), `claude.js` model labels, `VOICE_LIBRARY`
  / `OMNI_VOICE_TAGS` / `OMNI_LANGUAGES` labels, `FONT_SCHEMES` labels,
  `CUT_ABBR`, and ~25 thrown error messages shown raw through `ErrorNote`
  (`comfy.js`, `gemini.js`, `images.js`, `projectFiles.js`, `styles.js`,
  `Stage5.jsx`). Pattern to follow: throw a code, map with `t('err.*')`.

## Styling gaps still open
- `.s5e-refthumb` / `.refpick-item` videos look like image thumbs (no play
  badge, no lightbox); `.s5e-refaud` placeholder has no fill.
- Four thumbnail sizes in one card: `.s5e-ver` 56×34, `.s5e-refthumb` 32,
  `.photo-thumb` 64, `.keythumb` 44×28.
- `.lightbox img` has `cursor: zoom-out` but the click is swallowed.
- `.refpick-item` has no `:disabled` / `:hover`; `.cut-badge` and `.photo-x`
  outlines are clipped by `overflow: hidden`; `.nle-nudge .zoom-select` has
  no focus indicator; `input:focus { outline: none }` removes the ring from
  checkboxes and range inputs.
- `.stale-toast` and `.s6-toast` both pin to bottom-right and can overlap.
- `.photo-x` buttons have no `aria-label` (Stage2, Stage5).
- `.stage-tab` / `.stage-nav` CSS is unused (dead).

## Layout vs content volume
- `StoryboardTimeline` (Stage 4): no horizontal scroll or zoom; 40+ shots
  clip at `min-width: 22px`; ruler labels every second clip past ~60 s.
- Stage 5 fit mode: with enough scenes/shots the min widths exceed the track
  and the ruler no longer lines up (the playhead is measured, so it stays
  correct). Auto-switch to a zoom step when `Σ min widths > track`.
- `.aclip` under ~60 px hides its mute/delete tools.
- Modals: `.asset-grid` / `.lib-pick-grid` scroll inside a scrolling modal;
  `.refpick-grid` / `.keylist` have no max-height (Done button scrolls away);
  the settings panel height is not re-measured on window resize.
- `.cover-frame` and `.sb-preview` are fixed 16:9 for 9:16 projects.
- Truncated names without a full-text tooltip: `.scn-title`, `.sr-title`,
  `.lib-pick-card strong`, `.keylabel`, `.asset-desc`.
- `.btn { white-space: nowrap }` — long RU/UA labels cannot wrap in
  `.music-len`, the take "Ungroup" chip and "Update engine".
- `.audio-lanes` grows without a cap.

## Control system — remaining inconsistencies
- Header: nav icons are 32 px now, but the right-hand cluster mixes
  `.dd-trigger` (32) with `.hd-logo` (40).
- Media chips: `.img-icon-btn` (24, on the final frame) vs `.s5e-dl` (32).
- `.lightbox-x` is round (36 px) while `.modal-x` is a 32 px square.
- Delete appears in seven forms (✕ text buttons, trash icons at 14/15/16,
  round badges at 16/18); regenerate reuses `RestoreIcon`, which also means
  "restore from archive"; `Grid` means Projects, asset library and keyframes.
- Music / SFX buttons carry emoji (🎵 🔊) while their neighbours use SVGs.
- Labelled vs icon-only pairs: "Process all" vs Zap, "Update audio" vs
  Redraft, "Extract" vs the portrait tile.
- `.voice-col` stacks a 32 px mic over a 32 px groom button (now equal), but
  `.photo-row { align-items: flex-start }` still tops the "Extract" button
  against 64 px tiles.
