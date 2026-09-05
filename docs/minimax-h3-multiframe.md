# MiniMax H3 — multi-frame reference mode ("MULTI")

Source: `video_minimax_h3_multiframe_reference.json` (Comfy-Org template) and
its "Note: MiniMax H3". This is a THIRD H3 workflow in StoryReel, next to the
untouched image-to-video (fl2va, 20 steps) and reference (ref2va, 20 steps)
ones.

## What the workflow does

- Same ref2va checkpoint and encoder as reference mode, plus chained
  **`MiniMaxH3AddGuide`** nodes (`positive` → `positive`, sharing the encoder's
  `LATENT` and both VAEs). Each guide pins a still, a short clip, and/or an audio
  take at `frame_idx` on the **output** timeline (`round(seconds × 24)`;
  negative values count from the end).
- `<Picture 1>` on `ref_images` is the 0 s first frame — there is no guide at 0;
  the prompt states the video starts from it. Later stills are guides at their
  seconds. MiniMax's note: also plug them into `ref_images` slots if the encoder
  should see them as `<Picture N>` — StoryReel always does.
- Clips snap down to valid lengths (5, 22, 39… frames); a batch under 5 frames
  uses its first image only. A guide plus its length must stay inside `length`.
- Optional Lightning LoRA (`minimax_h3_ref2v_turbo_4step`) switches sampling to
  4 steps. Default is the same 20-step `res_multistep` as the other modes.

## Prompt rules learned (the six-section keyframe format)

```
subject_definitions:
<Subject 1> is the woman in <Picture 1>, featuring …          (identity traits)
<Picture 1> is the first frame of [Shot 1], showing …
<Picture 2> is the keyframe of [Shot 2], showing …            (one per picture)

summary:
[keyframe completion + reference generation] one paragraph, in order,
naming each <Picture N> where the video reaches it.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): partially_preserved - …
<Picture 1> ([Shot 1] first frame): fully_preserved - …
<Picture N> ([Shot N] keyframe): fully_preserved - …

detailed_description:
one sentence of medium/style
[Shot 1] The shot begins from <Picture 1>. …
[Shot N] At MM:SS.mmm, the shot cuts to …, whose keyframe corresponds to <Picture N>. …

overall_soundscape: …
non_diegetic_music: N/A          (StoryReel scores in the edit)
```

Hard rules: timestamps equal the guide seconds to the millisecond; only listed
pictures exist; every picture and audio is named in three sections; cuts
between anchored pictures are hard cuts the model renders, so describe subject
continuity, not a transition effect.

## How StoryReel maps it

| StoryReel | Graph |
|---|---|
| Shot's first frame | `ref_images.ref_image_0` = `<Picture 1>` |
| Keyframe *k* (image, at *t*) | `AddGuide` at `round(t·24)` **and** `ref_images.ref_image_k` = `<Picture k+1>` |
| Keyframe (audio take, at *t*) | `AddGuide` with `audio`, no image |
| Reference picker images | remaining `ref_images` slots, numbered after the keyframes |
| Reference videos / audio | `ref_videos` (+ paired audio) / `ref_audios`, as in reference mode |
| Take lead in MULTI | members' first frames auto-seeded at the take's cut times |

`src/lib/h3multi.js` owns the ordering, so the prompt writer and the graph
builder can never disagree about which `<Picture N>` is which.
Caps: 9 images, 3 videos, 3 audio (12 files); 15 s per generation.
