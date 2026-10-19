---
name: storyreel-video
description: Produce and verify the video of a StoryReel project at Stage 5 — styles, image and video prompts (including MiniMax H3 prompts and its sound rule), first frames, location references, voices, videos, the review loop against reference photos, transitions, subtitles and the final render. Use for any Stage 5 work on a project whose format is "video".
---

# Stage 5: video production

Only for `format: "video"` projects — a graphic novel refuses these tools.
Work scene by scene, shot by shot, in order. Read `storyreel_guide` →
"Verifying each stage" for the full checklist.

## Before the first prompt

- Styles: `storyreel_list_styles`, then `storyreel_update_project` with one
  image style and one video style for the whole film. Say why.
- Optional staging: `storyreel_update_project { useLayout: true }` and
  `storyreel_build_layout { sceneId }` for scenes with two or more people
  over several shots. Prompts written before a layout change ignore it.
- Assets: `storyreel_find_assets` / `storyreel_set_asset`, then
  `storyreel_sync_assets`.

## Per shot

1. `storyreel_create_prompts { sceneId }` (attempt). Read the prompts
   (`storyreel_get_project { prompts: true }`).
2. `storyreel_create_media { kind: "image" }` → `storyreel_review_shot`.
   Judge likeness to the reference photos, continuity with the previous
   shot's last frame, environment, assets, artifacts.
3. First passing frame of a scene without a location reference:
   `storyreel_create_media { kind: "location_ref" }`.
4. Dialogue: on MiniMax H3 the lines are spoken by the video itself (no
   voice step). On LTX a spoken shot needs `kind: "voice"` before the video.
5. `storyreel_create_media { kind: "video" }` only after the frame passed →
   `storyreel_review_shot` again (contact sheet, `checks`).
6. Camera / motion off? `storyreel_set_dynamics`, then recreate the video
   prompt.

## Writing an H3 prompt yourself

`storyreel_h3_rules` first. Three fields: `integrated_multimodal_description`,
`overall_soundscape`, `non_diegetic_music: N/A`. Every line inside
`<d>[English] …</d>` after a speaker ID. **Sound rule:** at most three sound
sources, each made by a character or object visible in the frame, one short
sentence each, then "Nothing else is heard."; no hissing, rustling, water,
rain, wind, sea, steam, engines, traffic, humming lights, crowds or any
ambience; the description body names no sound. `storyreel_set_prompt`
refuses a prompt that breaks this.

## The edit

7. `storyreel_transitions` → `storyreel_set_transitions` (abrupt for fast
   action, smooth for quiet beats, dip / rest for a jump in time).
8. `storyreel_set_subtitles { auto: true }`, check with `storyreel_subtitles`.
9. `storyreel_render` when every shot has a video or a flag.

## When a check fails

Change the cause, not the dice: fix the prompt (`storyreel_set_prompt` or a
recreated prompt), the reference (portrait, location ref), the layout or
the dynamics — then regenerate. Four attempts per target, then
`storyreel_flag` with what you saw.
