# Unreleased (after 2.19.2)

Base: tag `v2.19.0` (commit `7276d9a`) + local 2.19.1–2.19.2. All work below
is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js`; every button, header and indicator carries a hover hint
(`title`); buttons are three words at most; sharp corners only.

## 1. Fast start-up: project media loads when a project opens

**Why.** Start-up read every media record of every project
(`idbMediaGetAll`) and merged it into memory before the first screen. With
many projects that was the whole media store, 3 GB on the user's machine,
so launches took long and held gigabytes of strings in memory.

**How.** Lazy media (`src/lib/storage.js`).
- `loadProjects` reads the media-free records plus only the media store's
  KEYS (`idbMediaKeys`, no blobs). A project that owns media starts cold.
  It keeps its `file:<name>` slots and carries `_cold`, a session flag that
  is never stored.
- `hydrateProject(p, { cache })` reads one project's records by key range
  (`idbMediaGetProject`) and merges them. `hydrateCached` re-merges a newer
  edit from memory. `noteHydrated` marks the merged project as saved, unless
  the cold version had pending edits.
- `saveProjects` is safe for cold projects. A `file:<name>` slot counts as
  stored, and only a project whose stored media is known (hydrated, or never
  cold) computes media deletes. A cold project writes its lite record only.
- `mediaRefURL(projectId, ref)` reads one record, cached, for a card poster.

**Where media is read.**
- Opening a project (`App.jsx` `hydrateInState`). An "Opening …" screen
  shows while it reads (`app.opening`, `app.openingHint`, `app.openFailed`).
  An undo that brings back the cold version re-merges from memory.
- The agent: `callAgent` hydrates every `*projectId` parameter before the
  tool runs (`ensureHydrated` in the app scope).
- Home: Duplicate and Export ZIP read the project's media for the job only
  (`cache: false`). Card posters load in the background.
- Settings → Back up now reads each closed project for its folder only.
- The library rebuild checks projects on their references first and reads
  only the ones that really have entries to give.

**Verified** in the dev app with 12 seeded projects holding 240 MB. Start-up
read keys only, and the heap was 26 MB with all posters shown. Opening one
project loaded its 26 images (heap +22 MB). Pin and Duplicate on closed
projects, and agent edits on an open and a closed project, kept every media
record and reference.

**Files.** `src/lib/idb.js`, `src/lib/storage.js`, `src/App.jsx`,
`src/lib/agent/api.js`, `src/pages/Home.jsx`,
`src/components/ProjectCard.jsx`, `src/styles.css`, `src/lib/i18n.js`.
