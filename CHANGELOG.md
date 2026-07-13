# Changelog

## 1.12.1 — 2026-07-12

- Video Motion system instruction gains CRITICAL RULE 3 (Continuity & State
  Tracking): each shot carries over the previous shot's momentum, velocity and
  posture (the Inertia Law, "match on action" openings, no reset to a neutral
  pose between cuts). Actor Kinetics now anchors shot openings with continuous
  gerunds ("Continuing their brisk walk…"), and the example output demonstrates
  a continuous action. Since all shots of a scene are written in one call, each
  shot chains to the one above it; the scene's first shot derives its entry
  momentum from its own action.

## 1.12.0 — 2026-07-12

- Assets library: upload and reuse your own images — logos, props, wardrobe,
  UI screenshots — across projects. An "Assets library" button at the top of
  Stage 5 opens a manager to create named assets (with a description) and edit
  or delete them.
- Per-shot assets: each Stage 5 shot has an "Assets in this shot" row (like the
  character-photo row) to attach assets from the library or upload a new one.
  Attached assets are sent to image generation alongside the character and
  location references, described by name so the model places them accurately;
  a "Use assets" toggle turns them off per shot.
- Stage 2: removed the "cover is generated automatically" note, and the Script
  / Image / Video style labels now sit directly above their selectors.

## 1.11.2 — 2026-07-12

- Stage 6 timeline now scales for long stories: a Scale selector (Fit + fixed
  px/second presets), − / + zoom buttons, and horizontal scroll. Stories with
  more than 12 shots auto-zoom so no clip is too small to grab; the playhead
  stays in view while playing, and edge-trim stays precise at any zoom. Short
  stories keep the fit-to-width view.

## 1.11.1 — 2026-07-12

- Fixed Gemini text generation failing with "quota exceeded / limit: 0" on
  free-tier keys: the engine used a Pro model that the free tier doesn't
  cover. It now detects a plan-unavailable model, skips it, and falls back to
  a Flash model (which has free-tier quota) automatically — and gives a clear
  message if no model on the key has quota.
- Fixed endless microphone permission requests in the macOS/desktop app: the
  Electron session now grants media permission once (with a proper macOS
  microphone usage description), instead of re-prompting on every recording.

## 1.11.0 — 2026-07-12

- "Refine text" button below every voice-input mic (plot, approved plot,
  synopsis, new project, smart edit): Gemini cleans the dictated text —
  removes filler words, false starts and speech accidentally captured from
  other people nearby, and fixes grammar and structure, keeping the language
  and meaning.
- Stage 2 character cards: "+ Upload photo" and "From library" are now square
  64px icon buttons matching the photo frames.
- Text generation service switcher: plots, scripts and prompts can run on
  Google Gemini instead of Claude (Settings → Generation services). The best
  text model is discovered automatically from your key; all key checks and
  error messages follow the selected service.

## 1.10.2 — 2026-07-12

- Styles are now visible throughout the pipeline: Stage 2 gets script/image/
  video style selectors right next to the cover image (two-way linked with
  the project settings), Stages 3 and 4 show a clickable "Script style" chip,
  and Stage 5 shows "Image style" and "Video style" chips — clicking any chip
  opens the project settings. Changing a style this way never triggers the
  stale-stages warning, matching the settings modal.
- Project cards on the main page now show all 6 stages in the progress ring
  (was still counting to 5).
- Stage stepper text is 20% smaller, giving the six-stage bar more room.

## 1.10.1 — 2026-07-12

- Fixed "ComfyUI HTTP 403" during video/storyboard generation in the desktop
  app: all ComfyUI traffic now runs through the Electron main process, which
  carries no browser Origin header — the reason ComfyUI's same-origin guard
  rejected renderer requests. Browser dev keeps using the /comfy proxy, and a
  403 now comes with an actionable hint.

## 1.10.0 — 2026-07-12

- Local video generation via ComfyUI (MCP ComfyUI setup): every Stage-5 shot
  with a first frame and a video prompt gets a "Generate video" button. With
  only a first frame it runs the LTX-2 image-to-video workflow (ltx_i2v);
  when a final frame exists it runs the first+last-frame workflow (ltx_flf2v).
  The result plays inline in a video player with the same regenerate/download
  corner icons as images, and a copy is saved into the local outputs folder
  (default D:\Claude work\ComfyUI\Output) in the desktop app.
- Settings now have a "Generation services" section: choose the Stage-4
  storyboard engine (Gemini lite or MCP ComfyUI Krea-2 Turbo) and the video
  engine (MCP ComfyUI — the only option for now), plus the ComfyUI server URL
  and the local outputs folder.
- Stage-4 storyboards can render through the local Krea-2 Turbo workflow
  (krea2_turbo_t2i); full-resolution copies land in the outputs folder.
- New Stage 6 — Final Assembly: the film assembles automatically from the
  planned shot timings. The preview player sits above an NLE timeline in the
  Stage-4 design; each shot's clip shows its video (preferred), else its
  first-frame image, else a placeholder. Scenes and shots reorder by drag &
  drop, durations trim with the clip-edge drag or ±0.5s nudges (extra time
  beyond a clip's video stays black — frames are never stretched), and
  "Render & save video" records the assembly (with audio) into a .webm file
  on your drive plus a copy in the outputs folder.
- The Electron app bridges the local ComfyUI server (Origin handling) and
  saves generated results to the outputs folder; the Vite dev server proxies
  /comfy for browser development.

## 1.9.4 — 2026-07-11

- Stage 5: a shot's first frame can now become a location reference — a map-pin
  icon on the image asks Gemini to remove all characters (reconstructing the
  environment behind them) and extend the frame boundaries in every direction
  at the same aspect ratio to reveal more of the space. The result is saved to
  the scene's location reference photos (max 3, newest kept) and the global
  location library, ready to feed image generation via the existing toggle.
- Stage 5 declutter: Download and Regenerate for the first and final frames
  are now small white icons on round semi-transparent black chips in the
  top-right corner of the image they belong to; the text buttons are gone
  (the "Generate image" / "Create Final Frame" buttons remain only until
  their image exists).
- The Copy label above prompt fields sits a few pixels higher, no longer
  touching the text area's edge.

## 1.9.3 — 2026-07-11

- Stage 4 timeline: shot durations can now be shortened, not just extended.
  The edge-trim drag captures the pointer so a leftward drag is no longer
  hijacked by the clip's reorder drag-and-drop, and the footer gains −0.5s /
  +0.5s nudge buttons for the selected clip (disabled at the 2s / 10s limits).
- FLF (first→last frame) generation on Stage 5: every shot with a generated
  first frame gets a "Create Final Frame" button. Claude examines the first
  frame plus the shot's plot description and writes an edit prompt for the
  final frame (the action's end state) that keeps the location, lighting,
  camera angle and framing exactly as in the first frame. If characters that
  belong in the final frame are missing from the first one, their reference
  photos are attached to the generation automatically so their appearance is
  preserved. The final frame renders at the same size to the right of the
  first frame, with its own download button, and survives export/import.

## 1.9.2 — 2026-07-11

- Stage 5 image prompts now describe the shot's INITIAL state (second zero,
  before the planned action starts to unfold) instead of drifting toward the
  action's midpoint: the generation instruction gets an explicit FIRST FRAME
  TIMING rule with a worked example, and uses the previous shot's end state
  as a cue for the opening state.

## 1.9.1 — 2026-07-11

- Stage 4 timeline clips are now editable: drag a clip's right edge to trim or
  extend its duration (snaps to 0.5s, clamped to the 2–10s shot rule) — the
  matching Shot Breakdown card's duration and all timecodes update live, just
  as drag-reordering already syncs shot order both ways.
- Shot duration inputs on the breakdown cards accept half-second steps.

## 1.9.0 — 2026-07-11

- Project cover generation now uses gemini-3.1-flash-lite-image (same automatic
  fallback discovery as the storyboard frames), keeping the image at the
  model's native resolution.
- Video style library updated with 15 motion presets (TV Commercial, Short
  Comedy Skit, 3D Pixar Animation, Dramatic Film, Sitcom, 90s Soap Opera, MTV
  Retro, Documentary Footage, Action Camera, FPV Drone, Classic Anime,
  Claymation, 2D Animated Film, Silent Film Era, Surveillance/CCTV). The three
  original factory video styles are retired unless you edited them; custom
  styles are untouched.
- Stage 5 video prompts are now generated by a dedicated Video Motion Prompt
  system instruction: it describes only how the starting frame changes over
  time (camera trajectory, actor kinetics, chronological timing and pauses,
  speech delivery and audio) and never restates static visuals. The selected
  video style is injected into the instruction; with no style selected, a
  neutral naturalistic default applies.
- Stage 5 now runs two focused generation calls per scene (image prompts, then
  video prompts) instead of one combined call, for both single-scene and
  process-all runs.

## 1.8.1 — 2026-07-11

- Storyboard preview frames now use gemini-3.1-flash-lite-image (with automatic
  fallback discovery if that id isn't available on the key).
- "Describe appearance from photos" now updates only the character's facial
  features, hairstyle and apparent age — personality, habits and every other
  non-appearance trait in the description is preserved verbatim.
- Smart edit icon is now a pencil + star.
- Stages selector: number and label keep identical size, weight and position in
  every state; added micro-animations (breathing glow on the selected stage,
  number pop on selection, draw-in checkmarks) with reduced-motion support.
- Stage 1 idea cards now lay out in a 2×2 grid.

## 1.8.0 — 2026-07-11

- Settings moved to a gear icon in the upper-right corner of every screen
  (replacing the avatar); the rail's bottom settings icon is gone.
- Stage navigation replaced with a gapless segmented stepper with light-spill
  states (design 2a), reskinned for all three themes.
- All project-page blocks now share the same width as the header and stepper.
- Project header actions (Smart edit, Export, Project settings, Settings) are
  icon-only, same-height buttons; the language selector there is the compact
  pill from the main page.
- One global language everywhere: it switches the interface and the script
  generation language instantly from any screen (image/video prompts stay
  English); the per-project language override is gone. Existing text is never
  rewritten by a language change.
- Animatic preview rebuilt as a video-editor-style timeline (design 3a): black
  surface, per-second time ruler, square clips proportional to duration,
  violet selection, red playhead, live timecode; click a clip to select/seek.
- "Copy" above prompt fields is now a plain clickable text link.

## 1.7.1 — 2026-07-11

- Stage 1 idea cards now note which random modifiers shaped that generation —
  e.g. "🎲 Oblique Strategy: The Spatial Limit · Genre Mashup: Neon Noir" —
  whenever at least one randomizer was active.

## 1.7.0 — 2026-07-11

- **Character library**: create, edit, delete and sort characters (by date,
  project, or type — male/female/child/animal/robot/other), reachable from a new
  rail icon on the main screen. Characters that get reference photos in Stage 2
  are added to the library automatically, and the Stage 2 photo button now
  offers "Upload photo" or "From library".
- **Location library**: the same for locations (interior/exterior/urban/nature/
  fantasy/other), with its rail icon directly below the characters icon. Stage 4
  scene environments sync to it and can be picked from it.
- **Stage 5 — image versions & refine**: regenerating no longer overwrites the
  shot image; up to 5 previous versions are kept as clickable thumbnails, and a
  new refine field ("make it darker, move camera lower…") sends the current
  image back to Nano Banana as an edit reference.
- **Stage 4 — low-res storyboard + timeline**: a cheap flash-image model renders
  rough ~320px frames per shot; an NLE-style timeline shows clips sized by their
  real 2–10s durations, supports drag-and-drop reordering, and plays the frames
  in sequence at real speed to judge pacing before spending on full renders.
- **8 new script styles** imported from text_styles.pdf (Ad Spot, Comedy Skit,
  Animated Film, Indie Drama, Thriller, Anime Action, Mockumentary, Visual Poem)
  and **20 new image styles** from visual styles.pdf (1970s Panavision, Cyberpunk
  Neon, IMAX Epic, Pixar 3D, Spider-Verse, Claymation and more) — added to the
  style library for both new and existing users.

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
