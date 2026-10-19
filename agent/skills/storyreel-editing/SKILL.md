---
name: storyreel-editing
description: Edit an existing StoryReel project precisely — plot, synopsis, character cards and photos, actor groups, scenes and locations, shots, assets, styles, app preferences and project housekeeping (pin, archive, duplicate, delete) — with the narrowest storyreel_* tool, and know what each edit does and does not update downstream. Use when the user asks to change, fix, rename, add, remove, reorder, copy or tidy anything in a StoryReel project.
---

# Editing a StoryReel project

Read `storyreel_get_project` first; find the ids there (scenes, shots,
characters, locations). Make the smallest edit that does the job, then read
the project again to confirm it.

## Map the request to a tool

| The user wants to… | Tool |
|---|---|
| retitle, change genres / logline / approved plot / aspect / the project's styles / 3D layout | `storyreel_update_project` |
| pin, archive, unarchive, duplicate, delete a project | `storyreel_manage_project` |
| switch Stage 1 plot tools (sampling, subversion, writing rules, story dice, structure die, interview) or randomization | `storyreel_set_plot_options` |
| rewrite the synopsis | `storyreel_edit_storyline` |
| add / rename / describe / delete a character, add or drop a reference photo | `storyreel_set_character` |
| give a character a portrait made from the description | `storyreel_character_portrait` (attempt) |
| a band, crew, family acting as one | `storyreel_set_group` |
| a scene's title, summary, length | `storyreel_edit_script { sceneId }` |
| add, delete, reorder scenes | `storyreel_edit_outline` |
| a scene's places and their photos | `storyreel_set_location`, `storyreel_location_image` |
| a shot's type, location, action, dialogue, notes, length | `storyreel_edit_script { shotId }` |
| add, delete, reorder shots; split one shot into two | `storyreel_edit_shots`, `storyreel_duplicate_shot` + `storyreel_edit_script` |
| props / objects that recur | `storyreel_set_asset`, `storyreel_asset_image`, `storyreel_sync_assets` |
| create / change / delete a style in the library | `storyreel_set_style` (built-ins are read-only: copy them) |
| language, theme, text / image / video service | `storyreel_app_settings` (services only on request) |
| one instruction that must reach every scene, shot and prompt ("rename Anna to Maria", "set it in winter", "make the ending hopeful") | `storyreel_smart_edit` |
| a comic screen's layout, panels, captions, balloons | `storyreel_novel_set_screen` (see storyreel-graphic-novel) |

## What a direct edit leaves alone

- **Renaming a character card** does not rename them in scenes, shots or
  prompts — follow it with `storyreel_smart_edit "rename X to Y"` (or use
  smart edit alone).
- **Editing a shot's text** keeps its prompts, frames, video and comic
  panels as they were. If the change shows on screen, recreate them
  (`storyreel_create_prompts { shotId, kind }`, or `storyreel_novel_plan
  { shotId }` for a comic) — that costs attempts and money, so say so.
- **Changing a shot's length** may leave its video or voice too short or too
  long; read the `warnings` the tool returns.
- **Deleting a scene or shot** removes its prompts, media and comic screen
  for good. **Deleting a project** removes everything. Only on request.
- **Re-running Stage 2** replaces the whole cast and loses their photos —
  never do it to fix a detail.
- **Styles** apply to what is generated next, not to what exists.

## Habits

- Keep names exactly as on the Stage 2 cards everywhere you write them.
- Write story text in the project's language; image / video prompts stay in
  English.
- After a batch of edits, `storyreel_get_project` and list each change in
  your report with its id.
