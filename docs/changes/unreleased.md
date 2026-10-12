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
