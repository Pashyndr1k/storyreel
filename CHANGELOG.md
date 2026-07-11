# Changelog

## 1.6.1 — 2026-07-11

- Randomization Method 2 replaced: "Cliché Breaker" (which tuned the temperature
  parameter, now deprecated for Sonnet) is now **Auteur Persona** — it filters the
  idea through a random, highly opinionated auteur director's philosophy from a new
  library of 15. No temperature tuning is used anywhere.
- Stage 1 now uses a strong default plot-generation persona when no persona-setting
  randomization is active, so ideas stay bold and non-formulaic by default.

## 1.6.0 — 2026-07-11

- **Plot Randomization Engine** on Stage 1: pick up to two methods to steer idea
  generation. Selecting a third drops the oldest.
  - *Oblique Strategy* — injects a random creative constraint (from a library of
    30) as the plot's main structural friction.
  - *Cliché Breaker* — raises the model temperature to 0.95 and pushes for bold,
    non-formulaic ideas.
  - *Genre Mashup* — blends your idea with a random micro-tone (from a library of
    50, e.g. Neon Noir, Cozy Murder Mystery).
  - *Structural Variance* — forces each of the four pitches into a different
    narrative framework.
- Stage 1 now generates at temperature 0.7 by default.

## 1.5.1 — 2026-07-11

- Custom styles are now durable across updates: the style library is stored in a
  versioned format so future changes migrate it forward instead of dropping it;
  built-in styles are only seeded once and never overwrite your custom styles.
- The style library is included in **Settings → Backup** (export/import), so you
  can carry your styles to another machine or restore them after a reinstall.
  Importing merges styles by id, so existing custom styles are never lost.
- Unreadable style data is backed up for recovery instead of being discarded, and
  the app requests persistent storage so the browser/OS won't evict your data.

## 1.5.0 — 2026-07-11

- **Aspect ratio** for image & video, chosen when creating a project from an icon
  row (16:9, 4:3, 1:1, 3:4, 9:16) and changeable anytime in Project settings.
- Stage 5 prompts now state the chosen aspect ratio in every image and video
  prompt and compose for that frame; generated images are rendered at that ratio.

## 1.4.0 — 2026-07-10

- **Style library** replaces the per-project system prompt and prompt templates.
  Styles are reusable, organized in three independent categories, and managed in
  a library you can add to, edit and delete from:
  - **Script styles** govern the script text (stages 1–4) — e.g. a literary or
    documentary voice, or a genre.
  - **Image styles** govern image prompts, the project cover, and in-app image
    generation (stage 5 + cover).
  - **Video styles** govern the video prompts (stage 5).
- Each project selects one style per category (or none) in Project settings.
- The **Smart-edit agent no longer uses styles or custom instructions** — it runs
  on the standard Claude Sonnet 5 model.
- Existing per-project prompts are converted into library styles automatically on
  first launch, so nothing is lost.

## 1.3.0 — 2026-07-10

- Projects moved from localStorage to **IndexedDB** (hundreds of MB instead of
  ~5 MB — room for many fully illustrated projects). Existing data migrates
  automatically on first launch.
- Saves are **debounced and diffed**: only changed projects are written, at most
  twice a second, with a flush when the window closes — typing no longer
  re-serializes the whole library on every keystroke.
- **Batch generation is concurrent** (3 scenes at a time) and individual scene
  failures no longer stop the rest of the batch.
- Transient API errors (rate limits / overloaded / gateway) are **retried
  automatically** with backoff, for both Claude and Gemini calls.
- **API keys are encrypted at rest** in the desktop app via the OS keychain
  (Electron safeStorage); plain browsers keep the old behavior.
- **Undo / redo** for structural changes (deletes, reorders, regenerations,
  smart edits): Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (text fields keep native undo).
- Scenes and shots are reordered by **drag and drop** (grip handle) instead of
  up/down buttons.
- **Update notification**: the app checks GitHub Releases on start and offers a
  download when a newer version exists; tag builds now publish releases
  automatically. (Silent auto-install would require code-signed builds.)

## 1.2.0 — 2026-07-08

- Smart-edit agent: describe one specific change (rename a character, move the
  story to night, swap a location…) and it is applied consistently across every
  stage — plot, synopsis, characters, scenes, shots and prompts — without
  regenerating anything.
- After editing an earlier stage, a pop-up suggests regenerating the later
  stages that may now be out of date.
- Three interface themes: Dark, Medium and Light (Settings → Theme).
- Stage navigation replaced with a single timeline of large segments; the
  current stage is highlighted with the violet gradient.
- New projects choose a script length: 10–30 seconds, 1–4 minutes or 5–10
  minutes. All generation targets that duration; shots stay 2–10 seconds.
- Voice-to-text input (microphone buttons on the plot, synopsis and smart-edit
  fields), transcribed via Gemini in the input language. The transcription
  model is auto-discovered from the models available to your API key (newest
  flash model preferred), so it keeps working as Google retires model versions.

## 1.1.4 — 2026-07-08

- Settings: "Fetch available models" button lists the image-capable models your
  Gemini key can use and lets you pick one, instead of typing the id.
- Generated cover and shot images are now rendered at ~2 megapixels.
- Text areas grow to fit their content — no more inner scrollbars on long prompts.
- Lighter-purple highlight for the active scene chips in Stages 4 and 5.
- Language / model dropdowns now use a dark purple menu (readable text).
- Primary (purple gradient) buttons now darken with a purple outline on hover
  instead of turning grey.
- Removed the duplicate back-arrow next to "Projects" in the project header.
- The app version is shown next to the app name again (name in bright purple).

## 1.1.3 — 2026-07-07

- Fixed a crash (black screen) when importing a project exported from an older
  version: projects are now normalized to the current schema on import and on
  load, so any older export opens correctly. No data is dropped.
- Standardized the export/import format (embedded project JSON tagged with a
  schema version); older files remain importable.
- Added an error boundary so an unexpected view error shows a recoverable
  message instead of blanking the whole app.

## 1.1.2 — 2026-07-07

- Google Gemini image generation (Nano Banana 2 / `gemini-3-pro-image-preview`,
  configurable in Settings alongside a new Gemini API key field).
- Stage 2: a project cover image is generated automatically from the synopsis —
  Claude picks the key visual, writes an English prompt, and Gemini renders it.
  The cover becomes the project card poster. Manual regenerate button included.
- Stage 5: each shot has a "Generate image" button that renders the image prompt
  with Gemini. Two checkboxes (both on by default) attach character reference
  photos and location reference photos so appearances and settings stay
  consistent; the attached references are described in the request. Generated
  images can be downloaded.
- Generated images are downscaled/compressed before being stored locally.

## 1.1.1 — 2026-07-07

- macOS build is now a **universal** binary (x64 + arm64): a single `.dmg` runs
  on both Intel Macs (e.g. 2018 models) and Apple Silicon. Requires macOS 11+.

## 1.1.0 — 2026-07-07

- Full visual redesign: dark-violet glassmorphic theme across the whole app.
- New Projects/home screen: persistent left icon rail, top bar with brand,
  centered search and language pill, and poster cards with a per-project stage
  progress ring, date badge, genre tags and an icon action row.
- Project cards use the first character/scene reference photo as the poster,
  falling back to a tinted placeholder.
- New sort options: Newest, Oldest, A–Z, and By stage.
- Archive screen restyled to match, sharing the rail navigation.
- Restyled project editor, stages, modals and inputs to the violet theme;
  replaced emoji controls with Lucide-style line icons.
- Added Plus Jakarta Sans (with system-ui fallback).

## 1.0.3 — 2026-07-06

- Per-project settings menu (🎛 in the project header) with:
  - editable project title;
  - a custom "System prompt" — extra instructions added to every generation in
    that project (tone, style rules, things to avoid), on top of the built-in rules;
  - optional image/video prompt templates — when set, Stage 5 fits each generated
    prompt to the template; left blank, prompts stay free-form as before.
- These settings travel with the project through .md export/import.

## 1.0.2 — 2026-07-06

- Ukrainian (UA) interface language, alongside English and Russian.
- Per-project script language override: each project can generate its content in
  EN, RU or UK independently of the app language (selector in the project header).
- "⚡ Break down all scenes" button on Stage 4 — batch-processes every scene with
  one click (skips scenes that already have breakdowns; offers full regeneration
  when everything is done).
- "⚡ Prompts for all scenes" button on Stage 5 — same one-click batch processing
  for image/video prompts.
- Duplicate button (⧉) on project cards for making variants of a project.
- Character cards accept up to 3 reference photos; a "Describe appearance from
  photos" button uses Claude vision to write the character description from them.
- Scenes accept up to 3 environment reference photos (Stage 4); they are sent to
  Claude during shot breakdown and prompt generation so locations, lighting and
  mood match the references.
- Export/import projects as .md: the exported script now embeds the full project
  data, and a new "Import project" button on the main page restores a complete
  project (including photos) from such a file.

## 1.0.1 — 2026-07-06

- Interface language selector (English / Russian): EN/RU dropdown on the main page
  and a setting in ⚙ Settings.
- Full UI translation, including localized dates and Markdown export headings.
- All script generation stages (ideas, storyline, outline, shot breakdown) now
  produce content in the selected language, regardless of input language.
- Image prompts (Nano Banana) and video prompts remain English-only by design.

## 1.0.0 — 2026-07-06

- Initial release: five-stage writing pipeline (Plot & Ideas → Storyline →
  Scene Outline → Shot Breakdown → Generation Prompts).
- Main page with project cards (title, genre tags, Open / Archive / Delete),
  keyword search, sort by creation date, and a separate Archive page.
- Per-user Anthropic API key and model selection in Settings; local storage
  with JSON backup export/import.
- Full script export as Markdown.
- Windows installer + portable exe; GitHub Actions workflow for Windows and
  macOS builds; StoryReel.bat launcher for running from source.
