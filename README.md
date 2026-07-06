# 🎬 StoryReel

An AI-powered writing room for short videos — commercials and short films up to 5 minutes.
It walks you through five stages, from a rough idea to per-shot prompts ready for
**Nano Banana** (image generation) and any image-to-video model:

1. **Plot & Ideas** — describe your idea; Claude pitches 4 stronger directions; you approve one (editable).
2. **Storyline** — final synopsis + character descriptions detailed enough for consistent AI image generation.
3. **Scene Outline** — scene-by-scene skeleton with brief descriptions and target durations (≤ 5 min total).
4. **Shot Breakdown** — each scene split into 2–10-second camera shots with timing, location, action and dialogue.
5. **Generation Prompts** — for every shot: an English image prompt (first frame, Nano Banana) and a video prompt that animates it.

The main page shows cards for all projects (title, genre tags, Open / Archive / Delete),
with keyword search, sort by creation date, a separate Archive page, and one-click
export of the full script (with all prompts) as Markdown.

**Languages (v1.0.1):** the interface is available in English and Russian — switch with
the EN/RU selector on the main page or in ⚙ Settings. The selected language also controls
the language of all generated script content (ideas, synopsis, dialogue, shot descriptions).
Image and video generation prompts are always produced in English, regardless of language.

## Requirements

- [Node.js](https://nodejs.org) 18+ (only for running from source / building installers)
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com) —
  each user enters their own key in **⚙ Settings** inside the app. The key and all
  projects are stored only on that user's computer.

## Run locally

**Easiest (Windows):** double-click **`StoryReel.bat`**. On first run it installs
dependencies and builds the app, then opens the desktop window. Subsequent runs
start instantly.

**No Node.js at all:** use `release/StoryReel 1.0.1.exe` (portable — single file,
no installation) or the installer `release/StoryReel Setup 1.0.1.exe` after
building them with `npm run dist:win`.

## Run in development

```bash
npm install
npm run dev          # opens at http://localhost:5173
```

To run the desktop (Electron) shell in dev:

```bash
npm run app
```

## Build installers to share the app

**Windows installer** (build on Windows):

```bash
npm run dist:win     # → release/StoryReel Setup 1.0.1.exe (installer)
                     # → release/StoryReel 1.0.1.exe (portable, no install needed)
```

> Note: stop the dev server (`npm run dev`) before packaging — its file watcher
> locks the `release` folder on Windows and the build fails with EPERM.

**macOS installer** (must be built on a Mac — Apple does not allow cross-building):

```bash
npm run dist:mac     # → release/StoryReel-1.0.1.dmg
```

**No Mac available?** Push this folder to a GitHub repository — the included workflow
(`.github/workflows/build.yml`) builds both the Windows `.exe` and the macOS `.dmg`
automatically. Run it from the repo's **Actions** tab ("Build installers" →
"Run workflow") and download the installers from the run's artifacts.

Send the installer file to anyone; they install and run it like a normal app.
Note: the builds are unsigned, so Windows SmartScreen / macOS Gatekeeper will show a
warning on first launch ("More info → Run anyway" / right-click → Open).

## Where data lives

Projects are saved automatically on every change to local storage on the user's
machine. **⚙ Settings → Backup** exports/imports all projects as a JSON file, which
is also the way to move projects between computers or share them with a collaborator.
