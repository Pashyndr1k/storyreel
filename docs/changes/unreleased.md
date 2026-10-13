# Unreleased (after 2.17.0)

Base: tag `v2.17.0` (commit `4f4fe2a`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. A crashed window reloads itself instead of going black

**Report.** Rendering the video of one shot in a large project ("Married to
the Man on the Corner · Ep 1–4": 59 videos, 67 frames, 140 history frames,
54 audio clips — about 445 MB of media held as data URLs) turned the whole
app window black. Nothing was logged; the only way out was a restart.

**Cause (as far as it is known).** A black Electron window is a dead page: the
renderer process was killed (out of memory is the usual reason with a project
this size — every save serialises the open project whole for IndexedDB) or
the GPU process went down. The app had no handler for either, so the window
stayed black and nothing was recorded.

**Behaviour now.**
- `render-process-gone`: the reason and exit code go to the app log
  (`renderer.gone`), the page reloads (IndexedDB holds the last saved
  state) and a native dialog says the window crashed and was reloaded, with
  the reason; for `oom` it adds that old image versions or a split lower
  the load.
- `child-process-gone`: every Chromium helper exit is logged
  (`process.gone` with type / reason / exit code); a lost GPU process
  reloads the page as well.
- `unresponsive` / `responsive` are logged; `app.start` logs the
  version and the Electron version.
- The page's V8 heap limit is raised (`js-flags
  --max-old-space-size=8192`) so a large project's save has room.
- The main process gained `appendAppLog` / `mainLog` (the same file and
  format the renderer uses).

**Still open.** The root cause — hundreds of megabytes of media kept as data
URLs inside the project object and re-serialised on every save — is not
changed here; the next crash will name its reason in the log, which is
what the fix needs. Moving videos and image history out of the project
record into their own store is the real cure.

**Files.** `electron/main.cjs`, `CHANGELOG.md`.

## 2. Media stored as separate records; no mirror storm at start-up

**Report (continued).** With the crash guard in place the window reloaded
with "Reason: crashed (exit code -36861)" 75 s after start, while the same
large project was open. Everything points at memory: the open project
(~445 MB of media as data URLs) was serialised whole for IndexedDB on every
save, and at every launch the app re-mirrored every project to disk at once
(36 projects, ~3 GB of base64 through the bridge, all in parallel).

**Behaviour now.**
- **IndexedDB v3.** The `projects` store holds the media-free project (every
  media slot reads `file:<name>`, the same split the disk mirror uses:
  `splitProjectMedia` / `mergeProjectMedia`); a new `media` store holds one
  record per image, video and audio clip, key `"<projectId>\0<name>"`
  (`{ key, projectId, name, dataURL }`). A save writes the small record plus
  only the media whose string changed (identity check against what was
  loaded or last written) and deletes media no longer referenced — all in
  one transaction (`idbSaveProjects`). Deleting a project removes its media
  by key range (`idbDeleteProjects`). The in-memory project is unchanged:
  `loadProjects` merges the media back, so every consumer keeps reading
  `project.shotVideos[id]` etc. as before.
- **Migration.** A project found in the old whole-record form loads as is
  and is split on its first save; untouched old projects are moved one per
  save (never all in one transaction). The legacy localStorage path is
  unchanged.
- **Mirror.** At start-up the loaded projects are marked as already
  mirrored; the on-disk folders follow changes from then on. Mirrors run one
  project at a time app-wide (a single promise chain) instead of one chain
  per project in parallel.

**Verified** in the dev app: an old-form project with cover, frame, two
history versions, a video, a character photo and an audio clip was split on
first save into a 2 KB record plus seven media records; after a reload the
project had all its media; a rename rewrote the record and no media; a
delete removed the record and its media.

**Files.** `src/lib/{idb,storage,projectFiles}.js`, `src/App.jsx`.

## 3. Render: a head-trimmed lane clip played at the start of the film

**Report.** In the rendered film of "Married to the Man on the Corner ·
Ep 1–4", the sound of scene 1 shot 12 played over shot 1 and shot 12 came
out silent. In episode 2 "Boxes in the Rain", shot 7's sound was about a
second late.

**Cause 1 (renderer).** Reproduced with a synthetic job: a lane clip whose
source is cut from inside (`offset > 0`, i.e. a shot whose in-point was
trimmed on the timeline — shot 12 had a 0.9 s head trim, shot 13 a 1.0 s
one) reached `amix` with timestamps that put it at 0 s; `adelay` had
inserted its silence, but the mix aligned the clip by the timestamps it
carried. Clips with `offset 0` were placed correctly, which is why only the
trimmed shots stood out. The project's data was consistent all along (the
timeline showed the clip under its shot).

**Fix 1.** `electron/ffmpegRender.cjs`: `asetpts=N/SR/TB` after `adelay` in
every lane-clip chain (the per-shot chains already did this). Verified with
`buildArgs` + ffmpeg + `silencedetect`: an untrimmed clip with fades at
10 s and a 0.9 s-trimmed clip at 37.4 s both land exactly where the job
says (tone at 12–15 s and 38.5–40.9 s).

**Cause 2 (upload).** Shot 7 carries an uploaded video (`shotVideoEngines`
`upload`). Uploading replaced the picture but left the H3 mix clip of the
earlier generation on the lane, with the shot still muted — so the old
take's sound played over the new picture, out of step.

**Fix 2.** `src/stages/Stage5.jsx` `uploadShotVideo`: the upload's own
soundtrack is detached onto the H3 lane exactly like a generated clip
(`h3_<shotId>`, at the shot's film position, offset = the shot's head trim,
video muted), replacing the stale clip; an upload without sound removes the
stale clip and unmutes the shot. Helpers `shotStartIn` and `withH3Clip`.
Already-uploaded shots keep their stale clip until the video is uploaded
again (or the clip is deleted on the timeline and the shot unmuted).

**Files.** `electron/ffmpegRender.cjs`, `src/stages/Stage5.jsx`.

## 4. The library rebuilds itself from the projects

**Report.** The Assets Library (and the character / location libraries)
showed only the entries of "Ninety Seconds at Harlan's"; the assets of
every other project could not be picked for a shot.

**Cause.** The global library lives in the IndexedDB `library` store, which
was lost with the tables on 2026-10-11 (see the memory note); the restore
from the project folders brought back each project's own cards (characters,
story assets, scene locations with their photos) but not the library
entries that mirror them — those are written only when a card changes
(`useLibrarySync`). Only entries written after the loss existed.

**Behaviour now.** Once projects and library are loaded, the app adds back,
for every project the library holds nothing for, the entries its cards
imply: characters and scene locations that carry a `libId` and photos,
and every story asset with photos (`liba_<projectId>_<assetId>`), with the
project as owner and the project's creation date. Entries keep their
original ids, so shots that reference assets by id (`shotAssets`) work
again. A project that still owns at least one entry is left alone, so an
entry the user removed on purpose does not come back. The rebuild is
logged (`library.rebuild` with the counts).

**How.** `src/lib/library.js`: `impliedLibraryEntries(project)` and
`rebuildLibraryFromProjects(projects, library)`; `src/App.jsx` runs the
rebuild in an effect gated on both loads (`libLoaded`), persisting each
new entry.

**Verified** in the dev app: a project with a character, a story asset and
a scene location (all with photos) and no library entries got three
entries after a reload; a second project that already owned one entry was
left unchanged.

**Files.** `src/lib/library.js`, `src/App.jsx`.
