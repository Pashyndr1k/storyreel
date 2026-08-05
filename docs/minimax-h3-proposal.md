# Proposal — leveraging MiniMax H3 in the video module

Status: **integration landed** (engine selectable in Settings › Model selection).
This document proposes what to build next to use the model to its full extent.

Russian version: [minimax-h3-proposal.ru.md](./minimax-h3-proposal.ru.md)

## What actually changed under us

H3 is not "another LTX". Three properties break assumptions the video module
was built on:

| | LTX-2.3 (current) | MiniMax H3 |
|---|---|---|
| Audio | separate TTS pass; si2v feeds our voice track *in* | picture + 32 kHz stereo **out** of one pass: dialogue, SFX and score |
| Prompt | motion-only, "the frame already exists" | three-field timeline schema incl. speakers and sound |
| Shots | one shot per generation | **multi-shot with timed cuts inside one generation** |
| Duration | free seconds | only `17n+5` frames at 24 fps, rounds up |
| Resolution | up to FHD | **768 px short edge** (2K is API-only) |

The integration handles the mechanical ones (frames, dimensions, workflow,
three-field prompts). The proposals below are about the pipeline consequences.

---

## P1 — Let H3 speak, and stop paying twice for voice

**Now:** dialogue shots run OmniVoice/Gemini TTS, then si2v bakes that track
into the video. Under H3 the app still generates a TTS clip that H3's node
cannot accept, so the voice silently does not reach the render.

**Proposal:** make voice a per-shot *source* decision, not an engine accident.
- `voiceSource: 'tts' | 'native'` per shot (default `native` on H3, `tts` on LTX).
- On `native`, Stage 5 hides the TTS controls and instead surfaces the speaker
  block that goes into the prompt (identity, timbre, delivery, language tag) —
  the fields H3 actually reads.
- Keep TTS reachable on H3 for shots where an exact take matters (an uploaded
  or recorded line): generate silent video, then lay the clip on the Stage 6
  audio timeline as today.

**Why it matters:** the entire reason to pick H3. It also removes a whole
generation step (and its failure modes) from dialogue shots.

## P2 — Harvest the audio H3 produces

**Now:** Stage 6 treats a shot video as picture plus an optional muted track.
H3 returns a real mix.

**Proposal:** on import of an H3 render, split the audio out (we already have
`splitAV`) and place it on a dedicated **"H3 mix"** lane, muted-by-default under
the video, so the editor can:
- keep the native mix, or
- mute it and use our own music/voice lanes, or
- keep the mix but duck it under an ACE-Step score.

Without this the native audio is all-or-nothing and invisible to the mixer.

## P3 — Multi-shot generation (the big one)

**Now:** one shot = one generation = one clip on the timeline. H3 is trained to
render *several shots with timed cuts* in a single pass, and the cut is
generated rather than assembled — no crossfade seam, and continuity across the
cut is modelled.

**Proposal:** an opt-in **"scene take"** mode on Stage 5:
- Group consecutive shots of a scene (respecting the 15 s / `17n+5` ceiling)
  into one H3 request; the prompt already speaks `[Shot 2] At 00:03.500, …`.
- Stage 6 receives one clip carrying an internal cut list, so the smart-cut and
  transitions tools operate on markers instead of separate files.
- Fall back to per-shot generation whenever a group exceeds the ceiling.

**Why it matters:** this is the model's headline capability and it maps
directly onto our existing scene → shots structure. Biggest quality jump
available; also the biggest change to Stage 6's data model, hence proposed
rather than done.

## P4 — Reference mode (`ref2va`) for character consistency

**Now:** consistency is carried by the first frame and by prose descriptions.

**Proposal:** wire the second checkpoint. It accepts up to 9 images, 3 videos,
3 audio clips (12 files, 15 s total) and — critically — the app already owns
exactly the assets it wants:
- character library photos → `<Subject N>` identity,
- location refs → `<Subject N>` environment,
- an approved earlier shot → `<Video 1>` for camera language,
- a voice sample → `<Audio 1>` for timbre (H3 then *speaks in that voice*).

The ref guide's six-section format (`subject_definitions`, `retention_analysis`,
…) is a direct match for our library metadata, and `ref_image_size: max` is the
documented lever when identity drifts. Needs a second workflow JSON
(`ref2va`) — not shipped with the file we were given.

## P5 — Storyboards as a first-class input

MiniMax documents a storyboard label:
`<Picture 3> is a storyboard reference for [Shot 1] and [Shot 2], defining their
viewpoint, subject placement, and shot order.`

We already generate storyboard frames at Stage 4. Feeding the board plus the
per-panel action is officially supported and is, in effect, handing the model
the multi-shot timeline it was trained on. Cheap to add once P3 exists.

## P6 — Honest duration, and a Stage 6 that knows

`17n+5` means a 4 s shot renders as 4.46 s. Today the timeline assumes it got
what it asked for.

**Proposal:** surface `h3Seconds()` next to the duration stepper ("4.0 s →
4.46 s") and store the real length in `videoGenDurations`, which Stage 6 already
reads for trimming. Small change, prevents slow drift across a long edit.

## P7 — Speed and hardware honesty

From the field guide: `res_multistep` (already set in our graph) at ~20 steps
matches 50-step Euler; SageAttention 2.2.0 roughly doubles throughput; the
published floor is ~9 min for 5 s at 864×480 on a 3060.

**Proposal:** an engine note in Settings stating the local ceiling (768 px) and
the expected order of magnitude, plus a preflight check that the four H3 files
exist before the first render — the "node type not found / model won't load"
failure is otherwise opaque. Also worth exposing the documented preview ladder
(1344×768 → 1024×576 → 832×480 → 640×352) as our SD/HD/FHD tiers already
approximate.

---

## Suggested order

1. **P1 + P6** — small, and they make the engine correct rather than merely present.
2. **P2** — unlocks the native mix in the editor.
3. **P3** — the headline feature; schedule as its own version.
4. **P4 + P5** — reference mode and storyboards, once a `ref2va` workflow exists.
5. **P7** — polish and support burden reduction.

## Not proposed

- **2K locally.** `H3-Regenerate-2K` is API-only. If 2K output is wanted, the
  honest path is our own upscaler after the fact, not a promise in the UI.
- **Dropping LTX.** LTX still wins on resolution, on shots that must hit an
  exact duration, and on feeding a *specific* pre-recorded voice track. Two
  engines, chosen per project, is the right end state.
