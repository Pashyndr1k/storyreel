# H3 full integration — implementation plan (branch `h3-full`)

Target: **v2.0.0**. Base: `main` @ v1.20.0 (`93606d3`). Rollback at any moment:
`git checkout main` — main is frozen at 1.20.0 and every phase below lands as
its own commit on `h3-full`, so partial rollback is also possible.

Status: **all five phases landed** on `h3-full`. Remaining before release: live-ComfyUI QA of r2v (video/audio reference slots) and multi-shot takes, then version bump + CHANGELOG on order.

Implements the remaining proposals from
[minimax-h3-proposal.md](./minimax-h3-proposal.md) (P1–P5, P7; P6 shipped in
1.20.0), shaped by six locked decisions:

| # | Decision (owner) |
|---|---|
| D1 | `video_minimax_h3_r2v.json` reference workflow is in scope |
| D2 | Multi-shot grouping is the **user's per-case choice** (2–3 shots), never automatic |
| D3 | **H3 is the default engine**; LTX 2.3 stays fully available |
| D4 | Video prompts are generated **for the chosen model** (H3 or LTX schema) |
| D5 | H3 native audio is **opt-in**; TTS (OmniVoice/Gemini) remains the default voice path — H3's RU/UA speech is unproven |
| D6 | Stage 4 storyboards must be upgraded to real frame references before they feed H3 |

## r2v workflow review (D1)

The file is flat (no subgraphs) — direct API conversion. Structure:

- `MiniMaxH3ReferenceToVideo` (node 136): `clip`, `vae`, `audio_vae`, dynamic
  slots `ref_images.ref_image_0..8`, `ref_videos.ref_video_0..2` +
  `ref_video_audios.ref_video_audio_0..2`, `ref_audios.ref_audio_0..2`;
  widgets `[prompt, width, height, length, ref_image_size]`.
  Caps: 9 images / 3 videos / 3 audios, 12 files, 15 s total reference media.
- `ref_image_size`: `'match' | 'max'` — `max` is the documented fix for
  identity drift; expose it as an advanced toggle, default `match`.
- UNET `minimax_h3_ref2va_pruned_int8_convrot.safetensors`; CLIP, both VAEs
  and sampler chain identical to the i2v graph — one extra model file to
  preflight, nothing else new.
- No first-frame input: r2v is *reference*-conditioned, not frame-anchored.
  Alignment headers change accordingly (six-section reference format, not the
  I2VA "Picture 1 aligns with 0.00" header).

Deliverable: `src/data/comfy/minimax_h3_r2v_api.json` (hand-flattened like the
i2v one) + a `buildH3RefGraph()` that injects 1–12 uploaded references.

---

## Phase 1 — Foundation: default engine, per-model prompts, preflight — **landed** (`318cff0`)

*(D3, D4, P7 — everything else builds on this)*

1. **H3 default (D3).** `videoEngine` default → `'minimax'` for new installs.
   Existing users keep their saved choice — a settings migration that flips a
   user's explicit selection is a trap; instead show a one-time toast/banner
   "MiniMax H3 is now the default engine" with a link to Settings.
2. **Per-model prompt targeting (D4).** Store `promptEngine` per shot next to
   the generated prompt (`shotPromptEngines: {}`). Generation already branches
   (`stage5H3VideoPrompt` vs LTX); add:
   - Stage 5 badge on the prompt frame when `promptEngine` ≠ current engine
     ("written for LTX — regenerate for H3"), one-click regenerate.
   - Batch "regenerate all prompts for <engine>" in the scene header.
   - H3 prompt writer upgraded with the r2v example's tricks: quoted on-screen
     text, `<scenetrans>`/`<cutoff>`, explicit camera grammar.
3. **Preflight + engine note (P7).** Before the first H3 render, query ComfyUI
   `/object_info` + model lists for the 4 (i2v) or 5 (r2v) files; missing →
   actionable dialog naming the file and its HuggingFace path. Settings gains
   an engine note: 768 px short-edge ceiling, ~9 min / 5 s @ 864×480 on a
   3060 class card, preview ladder = our SD/HD/FHD tiers.

## Phase 2 — Voice policy and audio harvest — **landed** (`f3355af`)

*(D5, P1, P2)*

1. **`voiceSource` per shot (P1, inverted by D5):** `'tts'` (default, both
   engines) `| 'native'`. On H3 + `native`: TTS controls collapse into a
   speaker block (identity, timbre, delivery, `<d>[Russian] …</d>` language
   tag) that feeds the prompt; render at exact duration (already true). On
   H3 + `tts`: prompt writer is told the clip is silent-dialogue (ambience +
   score allowed, no speech), and the TTS clip lays onto Stage 6 exactly as
   today. LTX ignores the field.
2. **H3 mix lane (P2):** on importing any H3 render, `splitAV` the native
   audio onto a dedicated "H3 mix" lane, **muted by default** (D5-consistent),
   with per-clip unmute/volume. The video clip itself is muted to avoid double
   audio. Editor can keep the mix, kill it, or duck it under ACE-Step.

## Phase 3 — Reference mode (P4, D1) — **landed** (`c25a408`)

1. Convert r2v to API format; add `videoWorkflow: 'i2v' | 'r2v'` as a per-shot
   choice on H3 (segmented control next to the existing mode selector).
2. **Reference picker** on the shot card: pre-populated from what the app
   already owns — character portraits, location refs, style images, an
   approved earlier shot's video, a voice sample. User curates within the
   9/3/3 (12 file, 15 s) budget; a meter shows usage.
3. Prompt writer emits the six-section reference format
   (`subject_definitions`, `retention_analysis`, …) with `<Subject N>` /
   `<Picture N>` / `<Video N>` / `<Audio N>` labels bound to the picked refs
   in slot order.
4. Advanced toggle: `ref_image_size: max` ("stronger identity lock").

## Phase 4 — Multi-shot takes (P3, D2) — **landed** (`c45525d`)

1. **User-driven grouping (D2):** checkbox-select 2–3 *consecutive* shots in a
   scene → "Combine into one take". Validation: same scene, contiguous,
   summed snapped duration ≤ 15 s (`h3Frames` ceiling 360 → practical cap
   358 frames). No automatic grouping, ever.
2. Data model: `shotGroups: { groupId: { shotIds: [], cutTimes: [] } }`. The
   group renders as one H3 request; the prompt writer emits
   `[Shot 1]` / `[Shot 2] At MM:SS.mmm` per member with `<scenetrans>` at
   boundaries; cut times derive from the members' snapped durations.
3. Stage 6: the group's clip occupies its members' slots as **one clip with
   internal cut markers**; transitions inside a group are locked to
   "generated cut" (H3 made them); trims apply tail-only to the whole clip.
   Ungrouping re-exposes per-shot generation.
4. First-frame anchoring: group uses the first member's frame (i2v) or the
   reference set (r2v) — both workflows support grouped prompts.

## Phase 5 — Storyboards as references (P5, D6) — **landed** (`996f46c`)

1. **Quality upgrade first (D6):** current storyboards are throwaway sketches
   (`Rough … loose sketch-style` local prompt, low-res). Add a per-scene
   "Reference frames" mode on Stage 4: frames rendered through the *real*
   image pipeline (Gemini / Flux Klein per settings) with the project's image
   style, character descriptions and location — same quality bar as Stage 5
   stills, stored separately (`referenceFrames: {}`) so cheap sketches remain
   for fast iteration.
2. Once P3 groups exist: a group's reference picker can attach a storyboard
   sheet as `<Picture N> is a storyboard reference for [Shot 1] and [Shot 2],
   defining their viewpoint, subject placement, and shot order.`

## Cross-cutting

- All new UI strings in EN/RU/UA; buttons follow the fixed-width/≤3-word
  rules; toast-only notifications.
- Migrations for every new project/settings field (`shotPromptEngines`,
  `voiceSource`, `shotGroups`, `referenceFrames`, `videoWorkflow`).
- Custom user styles and existing projects must open unchanged; a 1.20.0
  project opened in 2.0.0 behaves identically until the user touches a new
  feature.
- Each phase: build + in-app verification (seeded project, graph-level
  assertions for ComfyUI payloads) before its commit.

## Order and rationale

Phases land 1 → 5. 1 is the substrate (defaults, prompt targeting, preflight).
2 makes the engine honest about voice before anything advertises audio. 3 and
4 are independent of each other but both need 1–2; 3 first because r2v is
also the better vehicle for 4's identity continuity. 5 last — it depends on
4 for its payoff.

## Explicitly out of scope

- 2K output (API-only model) — unchanged from the proposal.
- Removing or demoting LTX beyond the default flip (D3): it keeps exact
  durations, higher resolution, and the si2v exact-take path.
- Automatic shot grouping (D2).
- Replacing TTS with native H3 voice for RU/UA (D5) — revisit only after
  real-world listening tests.
