---
name: storyreel-graphic-novel
description: Make and edit graphic novels in StoryReel — vertical 9:16 comic feeds where every shot is one screen of 2–3 panels with speech balloons and a caption line. Covers creating the project, planning layouts and panel compositions, lettering (balloons, captions), drawing and reviewing panel images, fixing screens by hand and exporting the PNG feed. Use whenever the user mentions a comic, graphic novel, webtoon, manga-style feed, panels or balloons in StoryReel, or a project's format is "novel".
---

# Graphic novel

A graphic novel is a series project (Short Drama 2 story rules, 9:16) with
`format: "novel"`. Stages 1–4 are the same as a short drama (see
storyreel-short-drama). Stage 5 ("Comic") turns every shot into one screen.

## The format

- **Screen**: 1080×1920, read top to bottom. One per shot, in story order.
- **Layouts** (`storyreel_novel_rules` lists the exact boxes):
  - `stack2` two tiers — action and reaction, question and answer;
  - `stack3` three tiers — a fast sequence, rising tension;
  - `heroTop` big panel + two tall — establishing view or impact, then reactions;
  - `heroBottom` two tall + big panel — build-up, then the reveal / cliffhanger.
- **Panel**: framing, characters (cast names), an English image prompt, a
  caption line under it (≤ 2 lines, ≤ 14 words; narration, place / time,
  sound — never dialogue) and balloons.
- **Balloons**: the script's lines verbatim, in the project language;
  Comic Sans at one size everywhere; the balloon grows with its text; ≤ 2
  per panel, ≤ 25 words each; tail auto / left / right / none; position auto
  or x / y (0–1 of the panel image, top-left corner).

## Workflow

1. Create: `storyreel_create_project { format: "novel", title, logline, episodeCount }`.
2. Stages 1–4 with `storyreel_run_stage` (and the short-drama checks).
   Stage 4 writes each shot as 2–3 visual beats.
3. Pick an image style (`storyreel_list_styles` → `storyreel_update_project
   { imageStyleId }`); without one a clean ink-and-cel comic style is used.
   Give every main character reference photos first
   (`storyreel_character_portrait` or the user's photos) — panels are drawn
   from them.
4. `storyreel_novel_rules` once.
5. Per scene: `storyreel_novel_plan { sceneId }` → `storyreel_novel_get
   { sceneId }`. Read every screen's `issues` and fix them (below).
6. `storyreel_novel_draw { sceneId }` → `storyreel_novel_review { shotId }`
   for every screen.
7. `storyreel_novel_export` when every panel is drawn or flagged.

## Composition checklist (judge every screen)

- The layout fits the beats: one big moment → a hero layout with it in the
  big panel; a quick sequence → three tiers; a reveal → `heroBottom`.
- The last panel of the screen makes the reader scroll on.
- Adjacent panels change framing (wide → medium → close-up → insert) or angle.
- The first panel of a scene establishes the place, unless it opens on a hook.
- Reading order: the first speaker of a panel stands left (or higher);
  characters keep their sides across the scene (180° rule).
- Panels with balloons keep the upper third clear; balloons never cover
  faces or the key action.
- Wide boxes get horizontal compositions, tall boxes vertical ones.
- Nothing is lettered into the images (text, logos, balloons, borders).
- Every script line is in a balloon (`issues` lists missing ones).

## Fixing a screen (free)

`storyreel_novel_set_screen { shotId, ... }`:

- `layout` — switch the template (hidden panels are kept and come back).
- `panels: [{ index, framing, characters, prompt, caption, bubbles, clearImage }]`
  — `bubbles` replaces the panel's list: `[{ speaker, text, tail }]`.
- `bubbleMoves: [{ panelIndex, bubbleId, x, y }]` or `{ ..., auto: true }` —
  in a separate call after replacing balloons (new balloons get new ids).

A panel whose image fails review: fix its `prompt` (what is wrong, said
positively and concretely: who is where, facing whom, the framing), then
`storyreel_novel_draw { shotId, panelIndex }`. Four attempts per panel, then
`storyreel_flag { shotId, kind, issue }`. A whole screen that reads wrong:
`storyreel_novel_plan { shotId }`.

## Don't

- Use the video tools — they refuse a graphic novel.
- Invent, drop or reorder dialogue; shorten it only by splitting.
- Put dialogue in captions or caption text in balloons.
- Redraw panels that passed.
