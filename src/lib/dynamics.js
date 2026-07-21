// Action Dynamics Plan engine. The plan is generated at Stage 3 alongside the
// scene outline, then trickles down: Stage 4 constrains shot durations by the
// block's shot_density, Stage 5 cites the block's parameters in generation
// payloads (with the +3s padding rule), and Stage 6 uses it as the source of
// truth for trims and transitions.
import config from '../data/dynamics_config.json';

export const DYNAMICS_CONFIG = config;

export const DENSITIES = Object.keys(config.shot_density_duration_map);

// ---- plan normalization ----------------------------------------------------
export function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rhythm_blocks)) return null;
  const blocks = raw.rhythm_blocks
    .map((b, i) => ({
      block_id: typeof b.block_id === 'string' && b.block_id ? b.block_id : `blk_${String(i + 1).padStart(2, '0')}`,
      timestamp_start: Number(b.timestamp_start) || 0,
      intended_duration_sec: Math.max(1, Number(b.intended_duration_sec) || 0),
      scene_numbers: Array.isArray(b.scene_numbers)
        ? b.scene_numbers.map((n) => parseInt(n, 10)).filter((n) => n > 0)
        : [],
      kinetic_energy_level: clampInt(b.kinetic_energy_level, 1, 10, 5),
      dialogue_volume: clampInt(b.dialogue_volume, 1, 10, 5),
      shot_density: DENSITIES.includes(b.shot_density) ? b.shot_density : 'medium',
      required_camera_momentum: String(b.required_camera_momentum || 'steady_tracking'),
    }))
    .sort((a, b) => a.timestamp_start - b.timestamp_start);
  if (!blocks.length) return null;
  return {
    genre_baseline: String(raw.genre_baseline || 'general'),
    global_pacing_curve: ['flat', 'accelerating', 'decelerating', 'wave', 'front_loaded'].includes(raw.global_pacing_curve)
      ? raw.global_pacing_curve
      : 'flat',
    rhythm_blocks: blocks,
  };
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

// Block covering a given 1-based scene number: explicit scene_numbers first,
// then a fallback by scene position across blocks.
export function blockForScene(plan, sceneNumber) {
  if (!plan?.rhythm_blocks?.length) return null;
  const byScene = plan.rhythm_blocks.find((b) => b.scene_numbers.includes(sceneNumber));
  if (byScene) return byScene;
  const idx = Math.min(plan.rhythm_blocks.length - 1, Math.floor(((sceneNumber - 1) / Math.max(1, sceneNumber)) * plan.rhythm_blocks.length));
  return plan.rhythm_blocks[idx] || plan.rhythm_blocks[plan.rhythm_blocks.length - 1];
}

// Allowed shot duration range (seconds) for a block, inside the global 2-10s rule.
export function densityRange(block) {
  const d = config.shot_density_duration_map[block?.shot_density] || config.shot_density_duration_map.medium;
  return { min: Math.max(2, d.min_sec), max: Math.min(10, d.max_sec) };
}

export const energyClass = (level) => (level >= config.energy_high_threshold ? 'high' : 'low');

// ---- generation payload (Stage 5) -------------------------------------------
// Matches shot_generation_payload.json: the +3s rule and dynamics parameters.
export function buildShotPayload(shot, block) {
  const target = Number(shot.duration) || 4;
  const genDuration = Math.round(target) + config.generation_padding_sec;
  const energy = block ? energyClass(block.kinetic_energy_level) : null;
  return {
    shot_id: shot.id,
    parent_rhythm_block: block?.block_id || null,
    target_timeline_duration: target,
    video_generation_duration: genDuration,
    applied_dynamics: block
      ? {
          kinetic_energy: energy,
          kinetic_energy_level: block.kinetic_energy_level,
          dialogue_rhythm: dialogueRhythm(block.dialogue_volume),
          momentum_carryover: block.required_camera_momentum,
        }
      : null,
    // The directive carries only the shot's dynamics — never the clip's total
    // duration or any mention of trimming/editing mechanics (those confused
    // the video model and leaked into the output).
    prompt_injection_string: block
      ? `The action must be ${energy === 'high' ? 'highly kinetic' : 'restrained and deliberate'} (kinetic energy ${block.kinetic_energy_level}/10). Dialogue rhythm: ${dialogueRhythm(block.dialogue_volume)}. Camera must mimic ${block.required_camera_momentum.replace(/_/g, ' ')}.`
      : '',
  };
}

function dialogueRhythm(volume) {
  if (volume >= 8) return 'rapid_overlapping';
  if (volume >= 6) return 'brisk_conversational';
  if (volume >= 4) return 'measured';
  if (volume >= 2) return 'sparse';
  return 'near_silent';
}

// ---- assembly (Stage 6) ------------------------------------------------------
export function trimSeconds() {
  const t = config.global_trim_rules;
  return {
    head: t.head_trim_frames / t.assumed_framerate,
    tail: t.tail_trim_frames / t.assumed_framerate,
  };
}

// Default trim for a shot's raw video: apply the 15-frame rule only when the
// raw generation is actually longer than the timeline target (old footage
// generated without the +3s padding is used untrimmed).
export function defaultTrim(targetSec, rawSec) {
  if (!rawSec || rawSec <= targetSec + 0.2) return { head: 0, tail: 0 };
  const t = trimSeconds();
  const spare = rawSec - targetSec;
  const head = Math.min(t.head, spare / 2);
  const tail = Math.min(t.tail, spare - head);
  return { head: round2(head), tail: round2(tail) };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Pick a transition from the matrix for the boundary between two shots.
export function transitionFor(prevBlock, nextBlock) {
  const fallback = { transition_type: 'match_action_cut', audio_bridge: 'none', overlap_frames: 0 };
  if (!prevBlock || !nextBlock) return fallback;
  const shift = `${energyClass(prevBlock.kinetic_energy_level)}_to_${energyClass(nextBlock.kinetic_energy_level)}`;
  const momentumMatch = prevBlock.required_camera_momentum === nextBlock.required_camera_momentum;
  for (const rule of config.transition_matrix) {
    const c = rule.condition;
    if (c.energy_shift !== shift) continue;
    if ('momentum_match' in c && c.momentum_match !== momentumMatch) continue;
    return { ...rule.action };
  }
  return fallback;
}

export const overlapSeconds = (transition) =>
  (transition?.overlap_frames || 0) / config.global_trim_rules.assumed_framerate;
