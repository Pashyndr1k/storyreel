# StoryReel agent guide

You are operating StoryReel, a desktop app that turns an idea into a short
film in five stages. You work through its tools (all named `storyreel_*`);
the app must be open, and what you do appears in its window as you do it. A
person may be watching — never fight them for control: if a call fails with
`BUSY`, wait and retry.

## The pipeline

| Stage | Produces | Tool |
|---|---|---|
| 1 Plot & ideas | four directions; one becomes the approved plot | `storyreel_run_stage` (1), `storyreel_pick_idea` |
| 2 Storyline | synopsis, characters | `storyreel_run_stage` (2) |
| 3 Scene outline | scenes with durations, pacing plan | `storyreel_run_stage` (3) |
| 4 Shot breakdown | shots per scene: type, location, action, dialogue | `storyreel_run_stage` (4) |
| 5 Generation & assembly | per shot: prompts → first frame → video (→ voice); then the timeline render | `storyreel_create_prompts`, `storyreel_create_media`, `storyreel_render` |

Start with `storyreel_status`, then `storyreel_list_projects` or
`storyreel_create_project`. Read the project with `storyreel_get_project`
before and after every step — it is your only source of truth. Continue an
existing project from the first thing that is missing or flagged; never redo
work that already passes.

## Rules that are enforced for you

- **Four attempts.** Every generation you start is counted per target (a
  stage, or a shot's image / final frame / video / voice / prompt). The fifth
  attempt is refused with `ATTEMPT_LIMIT` and the target is flagged
  automatically. When that happens: stop working on that target and move on.
- **Flags.** `storyreel_flag` records a problem you could not fix (or want a
  human to see); `storyreel_list_flags` lists them; the person resolves them
  in the app. Flag kinds: `likeness`, `continuity`, `environment`, `audio`,
  `artifact`, `style`, `script`, `other`.
- **Cost.** Video generation is slow and expensive. Never create a video
  before the shot's first frame has passed review. Never regenerate something
  that passed. Do not start `storyreel_render` until every shot has a video or
  a flag.
- **Character photos.** Reference photos are added by the person at Stage 2;
  you cannot add them. Re-running Stage 2 replaces the cast and **loses their
  photos** — if a storyline exists and has photos, change it with
  `storyreel_smart_edit` instead of re-running the stage.

## Verifying each stage

**Stages 1–4 (text).** Read the result and check it against the brief:
does the plot keep the user's idea, do the characters have concrete, visually
distinct descriptions, do scene durations add up to the target length, does
every scene have shots, does each shot's action follow from the previous one,
is each dialogue line short enough to be spoken within the shot (roughly 2.5
words per second). Fix small problems with `storyreel_edit_script` (one
scene or shot) or `storyreel_smart_edit` (a change that must be applied
consistently across the whole project). Re-run a stage only when the result
is unusable.

**Choosing styles (before Stage 5 prompts).** `storyreel_list_styles` shows
the script, image and video styles. Pick the image and video style that fit
the story's genre and tone and set them with `storyreel_update_project`;
state in your report why you chose them. One image style for the whole film.

**Stage 5 — per shot, in order, scene by scene.**

1. Prompts exist? If not, `storyreel_create_prompts` for the scene.
2. `storyreel_create_media` kind `image`, then `storyreel_review_shot`.
3. If the frame passes, `storyreel_create_media` kind `video`, then
   `storyreel_review_shot` again.
4. For a shot voiced by TTS, `storyreel_create_media` kind `voice` and check
   the audio measurements.

`storyreel_review_shot` returns measurements and images: the reference
photos of the characters named in the shot, the location and asset
references, the shot's first (and final) frame, the last frame of the
previous shot, and a numbered contact sheet of frames from the video. Look at
them and judge:

- **Likeness.** Compare each character in the frame with their reference
  photo: face shape, hair, age, build, defining clothing. In the video, check
  the first, middle and last frames — identity must not drift.
- **Continuity.** The previous shot's last frame and this shot's first frame
  must agree: who is where, facing which way, holding what, in which light.
  The action in the contact sheet must continue the previous action and match
  the shot's action text.
- **Environment and assets.** The location must match its reference photos
  and the other shots of the scene; props and assets keep their look, size
  and position from shot to shot.
- **Artifacts.** Cropped heads or bodies that the shot type does not call
  for, extra or missing limbs or fingers, fused people, melted faces,
  duplicated characters, unreadable or invented text, objects passing through
  each other, a frozen or looping video.
- **Audio.** Use the `checks` values, do not guess: `voiceOverrunsShot` (the
  voice is longer than the shot and will be cut), `endsAbruptly` (sound still
  going when the file ends — speech cut off), `shortBy` (video shorter than
  its slot). Ask for `transcript: true` when you need to confirm the words.

## The 3D spatial layout (optional)

A project can carry a 3D floor plan per scene: where each character stands in
every shot, which way body and head face, the pose, whether they are present,
a few set boxes, and the camera with a real lens. When it is on, the image
and video prompts are written from a measured description of that staging,
so characters keep their sides of the frame and their eyelines from shot to
shot. It is off by default (`useLayout` in `storyreel_get_project`).

Use it when staging matters: two or more characters sharing a scene over
several shots, dialogue with shot / reverse shot, anyone entering or leaving.
Skip it for single-character scenes, montage and inserts.

1. `storyreel_update_project { useLayout: true }` — once per project.
2. After Stage 4, per scene: `storyreel_build_layout { sceneId }`. The cast
   covers the whole scene; a character who enters in shot 3 is "not present"
   in shots 1–2.
3. Read `warnings` in the result and each shot's `description` against its
   action: is everyone the shot names present and in frame, on the same
   screen side as in the previous shot, facing who they talk to, and does the
   shot size match the shot type? `storyreel_get_layout { image: true }`
   shows the camera view.
4. Fix: one wrong shot → `storyreel_build_layout { shotId }` (counts as an
   attempt) or, better when you know what is wrong, `storyreel_set_layout`
   with only the fields to change (free). Typical fixes: `present: false`
   for someone not there yet; `camera.aimAt`; swap the camera side
   (`yawDeg` + 180) when two characters flipped; a longer lens or shorter
   distance for a close-up.
5. Only then `storyreel_create_prompts`. Prompts written before a layout
   change do not follow it — recreate them.
6. `storyreel_review_shot` returns the layout's camera view as "INTENDED
   COMPOSITION" and the description as `expected.spatialLayout`: check the
   generated frame against them (who is on which side, facing, shot size).
   Block-figure colours only identify characters; they are not costumes.

Conventions: metres; x to the right, z toward the default camera;
`facingDeg` 0 = toward +z, 90 = +x, 180 = -z, 270 = -x; `yawDeg` is where
the camera stands around its target (0 = the +z side).

## Names

Character names are written exactly as on the character cards (English,
Latin letters) in every stage's text, whatever the script language. The app
corrects other spellings in generated text itself; keep to the card names in
anything you write with `storyreel_edit_script` or `storyreel_set_prompt`.

## Fixing a failed check

Change one thing per attempt, and say what you changed:

- Wrong framing, pose, action, missing person → rewrite the shot's prompt
  (`storyreel_set_prompt`) or let the app rewrite it
  (`storyreel_create_prompts` with `shotId` and `kind`).
- Likeness drift → state the character's identity anchors in the image
  prompt; make sure the character is named in the shot's action so their photo
  is attached.
- Continuity break → put the carried-over state in the prompt ("still holding
  the letter in her left hand, facing the door").
- Too static or too wild → `storyreel_set_dynamics` (camera, dynamics), then
  recreate the video prompt.
- Voice too long for the shot → shorten the line or lengthen the shot with
  `storyreel_edit_script`, then recreate the voice.
- A change that touches many places (a renamed character, another time of
  day) → `storyreel_smart_edit`.

After the fourth failed attempt the target is flagged for you; go on.

## Other ways you can raise the quality

- Before Stage 5, read the whole script once as a viewer: cut shots that
  repeat information, and check that each scene ends on a beat that motivates
  the next.
- Keep a short continuity sheet per scene (who wears and holds what, time of
  day, weather) and reuse its wording in every prompt of that scene.
- Check that consecutive shots do not share the same composition three times
  in a row; vary shot type and camera through `storyreel_edit_script` and
  `storyreel_set_dynamics`.
- Make the first frame of a scene's first shot carefully — every later frame
  of the scene inherits its palette.
- After all videos exist, review the film in order (contact sheets of
  neighbouring shots) for pacing: too many shots of equal length, a climax
  that is not shorter and faster than the opening.
- Finish with a report: what was created, what was regenerated and why, the
  styles you chose, and every open flag with the reason.
