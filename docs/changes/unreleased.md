# Unreleased (after 2.14.0)

Base: tag `v2.14.0` (commit `6ce489c`). All work below is on `main`, local.

Conventions that apply to every change: UI strings exist in EN/RU/UA in
`src/lib/i18n.js` (`const en`, `const ru`, `const uk`); every button, header
and indicator carries a hover hint (`title`); buttons are three words at most.

---

## 1. MiniMax H3: 20 / 8 / 4 sampling steps selectable (Stage 5 picker)

**Request.** The local H3 workflows ran the full 20-step schedule (only
MULTI mode had a 4-step "Lightning" switch). Make 8-step and 4-step
sampling available as options in the Stage 5 model drop-down; the user's
LoRAs live in `D:\ComfyUI\ComfyUI\ComfyUI\models\loras`
(`MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy`, `MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy`,
`minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16`).

**Behaviour.**
- One setting, `settings.h3Steps` ∈ 20 | 8 | 4 (default 20), applies to every
  H3 workflow: first frame (i2v), first + last (flf2v), reference (r2v) and
  MULTI (mfr). The old `h3Lightning` switch is gone; a stored `true` without
  `h3Steps` loads as 4.
- **Stage 5 model picker** (prompt header, video tab) lists H3 three times:
  "MiniMax H3 · 20 steps" (value `minimax`), "· 8 steps" (`minimax@8`),
  "· 4 steps" (`minimax@4`). Choosing another step count of the same engine
  changes the setting at once, with no confirmation and no prompt rewrite
  (the prompt format is the same); choosing H3 from another engine confirms
  as before and sets both the engine and the steps.
- **Settings → Video & voice** (H3 selected): a select "H3 sampling steps"
  with the three options and a hint (which LoRAs, where, the quality caveat),
  replacing the Lightning checkbox.
- **LoRA choice** (`h3LoraFor(kind, steps, available)`): per base model and
  step count a list of candidate file names in order of preference
  (`H3_LORAS`); the first one that ComfyUI's `LoraLoaderModelOnly` lists
  (matched by base name, sub-folders allowed) is used:
  - fl2v 8: MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy, …-Acc-8Step,
    minimax_h3_fl2v_turbo_8step_v1.0;
  - fl2v 4: minimax_h3_fl2v_turbo_4step_v1.0_768p, then the FL2VA Acc files
    (MiniMax sanctions the Acc adapters at 4 steps too);
  - ref2v 8: MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy, …-Acc-8Step,
    minimax_h3_ref2v_turbo_8step_v1.0;
  - ref2v 4: minimax_h3_ref2v_turbo_4step_v0.1, then the Ref2VA Acc files.
  Acc (PDD) files sample with `euler`; turbo (LightX2V) files keep
  `res_multistep`. Scheduler stays `simple`; guidance is the CFG-free
  `BasicGuider` already in the graphs; the H3 nodes carry no shift inputs.
- **Graph wiring** (`applyH3Speed(graph, ids, accel)`): a `LoraLoaderModelOnly`
  between the UNET loader and the scheduler / guider, `steps` set, sampler
  set. Node ids per family in `H3_IDS` (i2v: 6 / 9 / 16 / 17, LoRA at 7;
  ref graphs: 127 / 124 / 126 / 123, LoRA at 145).
- **Preflight** (`h3Preflight`) now takes `{ kind, steps }`, resolves the LoRA
  from ComfyUI's list, caches per url / workflow / kind@steps and returns the
  choice; when no candidate is installed the H3-not-ready error names the
  expected files and the folder, and suggests 20 steps. If ComfyUI cannot be
  queried the first candidate name is used.
- **Progress estimate** learns per step count (`etaKey` "minimax",
  "minimax8", "minimax4"; first-run rates 45 / 20 / 11 s of work per second
  of video).

**Data model.** `settings.h3Steps` (20); `settings.h3Lightning` no longer
written (read once for the migration).

**Files.** `src/lib/comfy.js` (`H3_STEPS`, `H3_LORAS`, `h3StepsOf`, `h3LoraFor`,
`applyH3Speed`, `H3_IDS`; `h3Preflight` signature; `buildH3MultiGraph` gains
`accel`; i2v / r2v / mfr paths), `src/lib/storage.js`, `src/lib/videoEta.js`,
`src/components/SettingsModal.jsx`, `src/stages/Stage5.jsx` (`VIDEO_ENGINES`,
`videoPick`, `pickModel`, ETA key, engine hint). i18n: `set.h3Steps`,
`set.h3Steps20/8/4`, `tip.h3Steps`, `set.h3StepsHint`, `mdl.steps`
(`set.h3Lightning*` keys left in place, unused).

**Verified.** In the dev app: `h3LoraFor` against the user's file list and
edge cases (missing, unknown list, sub-folder), `applyH3Speed` on the real
i2v template and `buildH3MultiGraph` (LoRA node, model rewiring, steps,
sampler), `h3Preflight` read-only against the live ComfyUI at 127.0.0.1:8188
(fl2v@8 → FL2VA Acc + euler; ref2v@4 → ref2v turbo 4-step + res_multistep;
fl2v@4 → the 768p turbo 4-step file that ComfyUI also lists), the Stage 5
picker (three entries, switching steps with no confirmation, stored value),
the Settings select. **No video was generated** — speed and quality of the
8- and 4-step runs are untested.

**Open.** The fl2v 4-step turbo LoRA is a 768p model; at other sizes the Acc
8-step file at 4 steps may be the better choice (swap the candidate order if
so). Switching between Acc and turbo files is automatic by file name only.
