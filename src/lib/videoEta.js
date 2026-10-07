// How long video generation takes on this machine, learned from finished
// runs, so the Create video button can show an estimated progress bar.
//
// Stored per kind of job — `${engine}:${resolution}:${mode}` — as seconds of
// generation per second of requested video (generation time scales with the
// clip length). A running average, in localStorage; nothing is stored in the
// project.
const KEY = 'storyreel.videoEta.v1';
// first-run guesses, seconds of work per second of video
const DEFAULT_RATE = { minimax: 45, minimax8: 20, minimax4: 11, ltx: 25, kling: 35, krea: 30 };
const MIN_EXPECTED_SEC = 20;

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export const etaKey = (engine, resolution, mode) => `${engine}:${resolution || 'HD'}:${mode || 'auto'}`;

// Expected seconds for a clip of `videoSec` seconds.
export function expectedSeconds(key, videoSec) {
  const engine = String(key).split(':')[0];
  const rate = Number(load()[key]) || DEFAULT_RATE[engine] || 40;
  return Math.max(MIN_EXPECTED_SEC, Math.round(rate * Math.max(1, Number(videoSec) || 4)));
}

// Record a finished run (failed or cancelled runs are not recorded).
export function recordRun(key, tookSec, videoSec) {
  const rate = tookSec / Math.max(1, Number(videoSec) || 4);
  if (!Number.isFinite(rate) || rate <= 0) return;
  try {
    const all = load();
    all[key] = all[key] ? Math.round((all[key] * 0.5 + rate * 0.5) * 10) / 10 : Math.round(rate * 10) / 10;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* best-effort */
  }
}

// Bar position for the elapsed time: linear up to 90% at the expected time,
// then creeping toward 99% — it never claims to be done before the job is.
export function etaPercent(elapsedSec, expectedSec) {
  const p = elapsedSec / Math.max(1, expectedSec);
  const v = p < 1 ? p * 90 : 90 + (1 - Math.exp(-(p - 1) * 2)) * 9;
  return Math.max(0, Math.min(99, Math.round(v)));
}
