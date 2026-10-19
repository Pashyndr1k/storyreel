---
name: storyreel-short-drama
description: Write and check vertical short-drama series in StoryReel (templates "Short drama" v1 and "Short Drama 2" v2) — series plan, episodes, hooks and cliffhangers, pacing, the drama check and fixes, splitting a series into production projects. Use when the user wants a series, episodes, a vertical drama, or when a project's scriptType is "series" (graphic novels included, whose story follows Short Drama 2).
---

# Short-drama series

A series project is vertical (9:16), planned by episodes, and written by one
of two engines — `dramaEngine` "v1" (craft guide) or "v2" (Short Drama 2,
production manual; video for MiniMax H3). A graphic novel is a v2 series
with a comic instead of a video.

## Make one

1. `storyreel_create_project { scriptType: "series", episodeCount, episodeSeconds (60/90/120), dramaEngine }`
   — or `{ format: "novel" }` for a graphic novel.
2. `storyreel_drama_rules` — the engine's beats, hook types, landmarks and
   limits. Write and judge by them.
3. Optional sub-genre: `storyreel_list_styles { category: "drama" }` →
   `storyreel_update_project { dramaStyleId }`.
4. Stage 1 → 2 → 3 with `storyreel_run_stage`. At Stage 3 a series master
   gets its series plan (episodes with hook types, cliffhangers, goals);
   production projects for runs of episodes are made from it — read
   `parts` / `partOf` in `storyreel_get_project` and work in the part
   projects.
5. Stage 4 per scene, then `storyreel_drama_check` (or `{ episode }`).

## Check and fix

- `storyreel_drama_check` reports hook rotation, the paid checkpoint and
  first win, episode lengths, the opening shot (≤ 5 s, conflict visible),
  turns per episode, line lengths and cliffhanger tags.
- `storyreel_drama_fix { mechanical: true }` applies the free fixes (em
  dashes in dialogue). `storyreel_drama_fix { sceneId, issues }` lets the
  model rewrite a scene's shots against the listed issues (attempt).
- Small text problems: `storyreel_edit_script`. A rule broken everywhere:
  `storyreel_smart_edit`.
- Cast: attractive, contemporary looks with striking modern details; no
  scars or disfigurement unless the user's story asks for them.

## Episode craft (both engines)

- Open inside the first seconds on visible conflict.
- Every episode ends on a cliffhanger tagged in the last shot's notes
  (`HOOK · TYPE` or `CLIFF · TYPE`, by engine); rotate the hook types.
- Keep lines short enough to be spoken in the shot (~2.5 words / s).
- One or two exchanges per shot; reactions readable, not subtle.

Then go to **storyreel-video** (video projects) or
**storyreel-graphic-novel** (format "novel") for Stage 5.
