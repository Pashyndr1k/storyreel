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
| 5 Generation & assembly | per shot: prompts → first frame (→ the scene's location reference) → voice when there is dialogue → video; then transitions, subtitles and the timeline render | `storyreel_create_prompts`, `storyreel_create_media`, `storyreel_set_transitions`, `storyreel_set_subtitles`, `storyreel_render` |

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
3. The first frame of a scene that passes, when the scene's location has no
   reference photo (`expected.environments` is empty / `environmentNote`):
   `storyreel_create_media` kind `location_ref` — the frame with the people
   removed and the view widened becomes the location's reference. Every
   later frame of the scene is made with it and reviewed against it, so the
   place and the side its landmarks are on stay the same. (A reference from
   nothing but the text: `storyreel_location_image`.)
4. Dialogue. On MiniMax H3 (local, or the H3 models through Krea) there is
   NO voice step: the lines are in the H3 video prompt and the model speaks
   them with the video (`kind "voice"` is refused). Only on the local LTX
   engine a shot with dialogue needs `storyreel_create_media` kind `voice`
   BEFORE the video; the shot grows to hold the whole line when the voice is
   longer than its slot (`shotExtendedTo` in the result) — never shorten it
   below the voice afterwards; the video of a spoken shot is refused until
   the voice exists (the talking-video workflow syncs the lips to it).
5. If the frame passes, `storyreel_create_media` kind `video`, then
   `storyreel_review_shot` again. A native-audio engine (H3, Seedance) may
   speak past the slot: the shot grows to the generated length instead of
   cutting the last words — read `shotExtendedTo` and keep the slot.

**After the videos of the film exist — the edit.**

6. Transitions: `storyreel_transitions` lists every boundary with the
   automatic choice and its reason; look at the videos (the contact sheets
   from `storyreel_review_shot`) and set the cuts with
   `storyreel_set_transitions`: abrupt (`smash_cut`, `match_action_cut`,
   `whip_pan`) where the action is fast or something sudden happens, smooth
   (`soft_cut`, `dissolve`, `directional_crossfade`) for slow, quiet beats,
   `rest_cut` / `dip_to_black` for a jump in time or an episode end.
   `auto: true` writes the automatic choice everywhere as a start. A smooth
   transition needs tail slack in the clip (`tailSlackSec`); without it the
   render makes a hard cut.
7. Subtitles: `storyreel_set_subtitles { auto: true }` makes compact text at
   the bottom from every shot's dialogue, timed inside the shot's slot;
   `style` sets font, size, colours and placement; `add` places free text
   anywhere on the frame (x / y in percent). Check the result with
   `storyreel_subtitles`; the render burns them in.
8. `storyreel_render`.

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
   shows the camera view. Two things the builder now guarantees, and the
   warnings watch: the SHOT SIZE comes from the shot type (a close-up is
   framed as a close-up whatever lens the planner picked — the camera is
   moved to the distance the type implies, so a subject never fills the
   frame by accident), and the CAMERA KEEPS ITS SIDE of the line of action
   from shot to shot (a camera that crossed it is mirrored back unless the
   shot's text asks for the crossing — "crosses the line", "from the other
   side"). Because the set boxes never move, keeping the side keeps the
   window, the door, the counter on the same side of the screen: the
   `lineCross` and `setFlip` warnings mean the environment would come out
   mirrored. The description's "Continuity:" line tells the prompt writers
   which side the background stays on.
4. Fix: one wrong shot → `storyreel_build_layout { shotId }` (counts as an
   attempt) or, better when you know what is wrong, `storyreel_set_layout`
   with only the fields to change (free). Typical fixes: `present: false`
   for someone not there yet; `camera.aimAt`; mirror the camera back
   (`yawDeg` + 180) on a `lineCross` / `setFlip` warning; a longer lens or
   shorter distance for a close-up. Set the location's landmarks as set
   boxes (`setBoxes`: the shop window, the counter, the door) when the
   planner left them out — only what is on the floor plan can keep its side.
5. Only then `storyreel_create_prompts`. Prompts written before a layout
   change do not follow it — recreate them.
6. `storyreel_review_shot` returns the layout's camera view as "INTENDED
   COMPOSITION" and the description as `expected.spatialLayout`: check the
   generated frame against them (who is on which side, facing, shot size).
   Block-figure colours only identify characters; they are not costumes.

Conventions: metres; x to the right, z toward the default camera;
`facingDeg` 0 = toward +z, 90 = +x, 180 = -z, 270 = -x; `yawDeg` is where
the camera stands around its target (0 = the +z side).

## Writing MiniMax H3 prompts yourself (dialogue and direct speech)

`storyreel_create_prompts` writes H3 prompts in the model's own format; when
you rewrite one with `storyreel_set_prompt` kind `video`, or judge one in a
review, read `storyreel_h3_rules` first — it is the exact brief the app's
writer works from. The parts that break a render if you get them wrong:

- Three fields, as one text block: `integrated_multimodal_description:`
  (the body, along the timeline), `overall_soundscape:` (ambience and
  effects, 1–4 sentences, NEVER dialogue, no music), `non_diegetic_music:
  N/A` (always — the film is scored in the edit).
- Direct speech: every line of the script is spoken in the video. Give the
  speaker a stable ID on first appearance with their voice identity — "The
  woman (S1), mid-thirties, low warm voice, says:" — and put the words, and
  only the words, inside `<d>[English] …</d>`. Identity, action and
  delivery stay OUTSIDE the tag. The words are English: translate a line
  written in another language, keep names. Never drop, add, shorten or
  reorder the script's lines; split a long line across beats exactly as
  the script does. A prompt that only says "she speaks" is wrong; a prompt
  that invents a line for a silent shot is wrong.
- Describe the exchange, not only its words: who speaks to whom and in what
  order, tone, volume, pace, pauses, and what the listener does meanwhile.
  A voiceover uses the phrase "says in an off-screen voiceover" and states
  after the tag that the lips stay closed.
- Internal cuts: `[Shot 1]` has no timestamp; later cuts are `[Shot 2] At
  00:03.500` inside the shot's duration, at most one cut per two seconds,
  each introducing new information. A take (several shots in one
  generation) is one prompt with the cuts at the take's times and
  `<scenetrans>` at each.
- Reference mode binds each reference to a role ("<Subject 1> is the woman
  from <Picture 1>", "Use <Picture 1> exactly as it is") and names every
  attached reference; MULTI mode uses the six-section keyframe format.
- Detail standard: the body is long and exact (typically 150–350 words),
  beat by beat — the camera's move or its stillness, every person's action,
  diegetic sound synchronized to the action — structured, not adjectives.

`storyreel_set_prompt` refuses a video prompt on H3 that lacks the three
fields, puts speech outside `<d>[English] …</d>`, omits speaker IDs, puts
dialogue in the soundscape, or gives lines to a silent shot.

## Extended shots (Stage 4 option)

`storyreel_run_stage` 4 with `mode: "extended"` cuts a scene into complex
shots of 2–3 camera changes (up to ~14 s each) instead of single set-ups.
Each extended shot comes back as consecutive shots grouped in a TAKE
(`shotGroups`): one MiniMax H3 generation renders the whole take with its
internal cuts. The take's lead carries the video prompt (one `video_prompt`
with `[Shot N] At MM:SS.mmm` at the cut times and `<scenetrans>` at each
cut), the mode `mfr` (multiframe_reference: the members' first frames
become stills at the cut times) and the references the take renders with
(the cast photos, the location photos, the attached assets) — the same
faces, objects and place through the whole shot. Create the first frame of
EVERY member (kind `image`) before the take's video, review each, then
`storyreel_create_media` kind `video` on the lead only (members are
rendered inside it). Use `mode: "normal"` for montage, inserts and fast
action where every shot is its own generation. The project remembers the
choice (`breakdownMode`); the user is asked the same question in the app.

## Short drama (series projects)

A series runs on one of two engines, chosen when the project is created and
reported as `shortDrama.engine` by `storyreel_get_project` and as `engine`
by `storyreel_drama_rules`:

- **Short drama** (`dramaEngine: "v1"`, the default) — the craft-guide
  engine described below: three hook types (identity / emotion /
  realisation), beats open / orient / turn / squeeze / reversal / cliff, the
  first win by episode 5, the paid checkpoint after the first quarter, the
  last shot of an episode noted `HOOK · TYPE`.
- **Short Drama 2** (`dramaEngine: "v2"`) — the production-manual engine:
  six cliffhanger types rotated (revelation / reversal / deadline /
  intrusion / arrival / withheld), beats hook / friction / turn / spike /
  button, the paywall as the LAST FREE EPISODE (the strongest reveal of the
  season so far; the next episode pays it off inside ~10 s) with the big
  twist two episodes before to one after it, 135 spoken words a minute
  (lines ≤ 16 words), 2 locations per episode and 3 per series, 1–2
  characters per scene, shots of 3–6 s with one beat each, no speaking mouth
  on screen for more than 5 s of one line, one subject per frame with the
  face in the top third and the bottom third quiet for captions, the last
  shot noted `CLIFF · TYPE`. Its video prompts are written for MiniMax H3
  (identity block verbatim, one or two exchanges per clip, ambient under
  dialogue, no music) and its images for Nano Banana 2.1 (vertical zones
  stated, the location's immutable detail and key-light direction
  repeated). Create one with `storyreel_create_project { scriptType:
  "series", dramaEngine: "v2" }`.

Always read `storyreel_drama_rules` before judging a series: the beats,
hook types, limits and landmarks you must hold the script to are the
engine's, not the ones you remember from another project. In a v2 series the
episode's FIRST scene opens on the hook (which may be a line); only its later
scenes open on a close detail of the new place without dialogue.

Every scene of a v1 series opens with a shot WITHOUT dialogue — an atmosphere
shot of 2–4 s (the place, the light, a detail or a face) that lets the
viewer settle into the new location; the first line comes in the second
shot. An episode's first scene keeps that opening shot at 5 s or less and
shows the conflict through action. `storyreel_drama_check` reports
`scene-opens-dialogue` when a scene's first shot carries a line; fix it
with `storyreel_edit_script` (move the line to shot 2, give shot 1 its
atmosphere).

A series is written by the app's short-drama engine: vertical 9:16, one
dramatic unit per 1–2 minute episode, the conflict visible in the first 3–5
seconds, a turn about every 30 seconds, every episode cut on a labelled hook
(identity / emotion / realisation, never the same type twice in a row), the
first win by episode 5, the paid checkpoint after the first quarter of the
season (the strongest hook so far), lines under 20 words, no em dashes, no
voice-over. `storyreel_drama_rules` gives the rules and this project's
landmarks; `projectView.shortDrama` the plan's hook types, turns and open
questions; scenes and shots carry a `beat` (open / orient / turn / squeeze /
reversal / cliff).

Work order for a series:
1. Stage 1–2 as usual; choose a sub-genre with `storyreel_update_project
   { dramaStyleId }` from `storyreel_list_styles { category: "drama" }` if the
   brief names one (it colours tone and plot types; the mechanics are fixed).
2. After Stage 3 (and again after Stage 4) run `storyreel_drama_check`. Fix
   errors before writing prompts: `storyreel_drama_fix { mechanical: true }`
   for em dashes; `storyreel_drama_fix { sceneId }` to have the model rewrite
   a scene's shots against the listed issues (frames and videos stay
   attached); `storyreel_edit_script` for a single line. Check again.
3. Judge the plan with the rules, not taste: does episode N end on the
   expected hook, does the paid-checkpoint episode carry the biggest reveal,
   does the first win land by episode 5, does each episode's first action
   answer the previous question?
4. When reviewing media, `storyreel_review_shot` returns `expected.shortDrama`:
   the beat and position of the shot, the vertical-frame expectations, and
   for the first / last shot of an episode the opening and hook-frame
   requirements. Flag `kind: "script"` for convention breaks the rewrite
   cannot fix.

## Assets and environments

The story's key objects — the ones characters handle across shots — have
cards at Stage 2 (`storyreel_assets`): a unique English name the scripts use
verbatim, a description of the object in the story's world, and a
reference image. Scenes' locations are the environment references. After
Stage 2 (and again after Stage 4) run `storyreel_find_assets` if the cards
are missing, give each card an image (`storyreel_asset_image`, or the user
uploads one), then `storyreel_sync_assets` so every shot that names an asset
carries it into its prompts.

When reviewing a frame, `storyreel_review_shot` lists `expected.assets` and
`expected.environments` and returns their reference images labelled
"REFERENCE — asset …" / "REFERENCE — location …". Compare the rendered
object and place with those images, not with your idea of the word: same
material, colour, shape, marks; same architecture and lighting. A mismatch
is a flag of kind `asset` or `environment`; a fix is a better description on
the card (`storyreel_set_asset`), a new reference image, or a prompt that
names the asset by its exact name.

A scene's location must have a reference before its second frame is made:
`expected.environments` empty (or `environmentNote` present) means make one
— `storyreel_create_media` kind `location_ref` from the scene's first good
frame, or `storyreel_location_image` from the text. Then every review of
the scene gets "REFERENCE — location" and "PREVIOUS — last frame": the
landmarks (window, lights, counter, door) must be the same ones, on the
same side of the screen, in the same light — a frame in which the shop
window has moved from the right to the left is an `environment` flag even
when the architecture matches. Fix it through the layout camera
(`storyreel_set_layout`, see `lineCross` / `setFlip`) or the prompt
("the shop window stays screen-right behind her"), then recreate the frame.

## Engines, quality and cost

`storyreel_status.services` tells you what renders: the image service and
model (Gemini Nano Banana 2.1 by default, a Krea model, or local Flux.2
Klein) and the video engine (local MiniMax H3 with its step count, local
LTX, Kling, or a Krea model). These are the user's choices — there is no
tool to change engines, keys or H3 steps; if the configured engine cannot
run (no key, ComfyUI down), the error names it and you flag it.

- Local H3 at 8 or 4 steps is a preview quality the user may have chosen for
  speed; do not judge fine detail against it as you would a 20-step render.
- A shot's video carries its noise seed (`shotView.videoSeed`, local engines).
  `storyreel_create_media { kind: "video", seed: "same" }` replays it, so a
  prompt fix changes only what the prompt says; the default "new" rolls a
  new take. Use "same" when the motion was right and one detail was wrong.
- Cloud engines (Kling, Krea) cost money per second; prefer fixing the
  prompt or the first frame to blind re-renders, and stop at the attempt
  limit.

## Parts

A long outline can be split at Stage 3 (`storyreel_split_project`, cut after
chosen scene numbers or every N scenes): each part becomes its own project
with its scenes and everything made for them. Work on each part as a normal
project (`projectView.partOf` says which part of what); the original keeps
`projectView.parts` with the part projects' ids. Edits do not propagate
between the original and its parts.

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
- Voice too long for the shot (`voiceOverrunsShot`) → lengthen the shot with
  `storyreel_edit_script` (the length is rounded UP; never shorten a shot
  below its voice), or shorten the line and recreate the voice. A video made
  for the old length is now shorter than its slot (`shortBy`): recreate it,
  or the render freezes its last frame and goes silent at the end.
- Sound cut off at the end (`endsAbruptly`) → the slot is shorter than the
  sound: lengthen the shot to the sound's length (`storyreel_edit_script`),
  then recreate the video so the picture covers the slot.
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
