---
name: storyreel
description: Operate the StoryReel desktop app (AI short films, short-drama series and graphic novels) through its storyreel_* MCP tools. Use whenever the user asks to make, continue, check, edit or export anything in StoryReel — a project, its plot, characters, scenes, shots, prompts, images, videos, comic screens, styles or settings. Covers connecting, the five-stage pipeline, the guard rails (four attempts, flags, cost) and which tool or companion skill to use for each kind of task.
---

# StoryReel operator

StoryReel turns an idea into a film (or a comic) in five stages. You work
only through the `storyreel_*` tools of the `storyreel` MCP server; what you
do appears live in the app window, and a person may be watching.

## Connect

1. `storyreel_status` — if it says the app is not connected: the desktop app
   must be open with **Settings → Interface → Agent access** on. Tell the
   user exactly that and stop.
2. `storyreel_guide` — read it once per session. It is the app's own manual
   and wins over anything here when they disagree.
3. `storyreel_list_projects` (add `includeArchived` when looking for an old
   one) or `storyreel_create_project`.

## The pipeline

| Stage | What | Main tools |
|---|---|---|
| 1 Plot | four directions → one approved plot | `storyreel_set_plot_options`, `storyreel_run_stage 1`, `storyreel_pick_idea` |
| 2 Storyline | synopsis, cast, groups, assets | `storyreel_run_stage 2`, `storyreel_set_character`, `storyreel_character_portrait`, `storyreel_set_asset` |
| 3 Outline | scenes, locations, pacing | `storyreel_run_stage 3`, `storyreel_edit_outline`, `storyreel_set_location` |
| 4 Shots | shots per scene | `storyreel_run_stage 4`, `storyreel_edit_shots`, `storyreel_edit_script` |
| 5 Video | prompts → frames → videos → edit → render | see the `storyreel-video` skill |
| 5 Comic | screens → panels → images → export | see the `storyreel-graphic-novel` skill |

`storyreel_get_project` is the only source of truth: read it before and
after every step. Its `format` is `video` or `novel`.

## Guard rails (enforced by the app)

- **Four attempts** per target (a stage, a shot's image / video / prompt, a
  comic panel, a portrait). The fifth is refused with `ATTEMPT_LIMIT` and the
  target is flagged. Stop and move on.
- **Flags** (`storyreel_flag`) record what you could not fix; the person
  resolves them. Never hide a problem — flag it.
- **Cost.** Images cost money, videos much more. Never regenerate something
  that passed review. Never change the generation services
  (`storyreel_app_settings`) unless the user asked.
- **Destructive edits** (`delete` in any tool) only on the user's request. A
  project delete needs `confirmTitle`.
- **One call at a time.** `BUSY` means the app is still working: wait.
- No tool returns or takes API keys. If one is missing (`NO_KEY`), tell the
  user which key to add in Settings.

## Which skill for which task

- Change something that already exists (text, cast, scenes, shots, styles,
  settings, project housekeeping) → **storyreel-editing**.
- A vertical short-drama series (Short drama / Short Drama 2) → **storyreel-short-drama**.
- Prompts, frames, videos, review, transitions, subtitles, render → **storyreel-video**.
- A graphic novel (format "novel"): comic screens, panels, balloons, export → **storyreel-graphic-novel**.

## Report

End every task with: what you made or changed (per stage / scene / shot),
what you reviewed and how it passed, every flag you raised, and what is left.
