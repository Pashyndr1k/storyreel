// Evidence for the agent's quality checks: downscaled stills, a contact sheet
// of frames from a shot's video, and measurements of its audio. The agent
// judges likeness, continuity and artifacts by LOOKING at these images; the
// timing and cut-off checks are measured here, because they are facts.
import { resizeDataURL } from '../images.js';
import { decodeMediaAudio } from '../audio.js';

const STILL_PIXELS = 640 * 640; // enough to judge a face or a frame, small enough to send
const SHEET_CELL_W = 384;

export async function still(dataURL) {
  if (!dataURL) return null;
  try {
    return await resizeDataURL(dataURL, STILL_PIXELS, 0.8);
  } catch {
    return null;
  }
}

function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('The video could not be decoded.'));
    v.src = src;
  });
}

function seek(v, t) {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      resolve();
    };
    v.addEventListener('seeked', done);
    // a browser may never fire "seeked" on a broken file — do not hang on it
    setTimeout(done, 4000);
    try {
      v.currentTime = t;
    } catch {
      done();
    }
  });
}

// Real duration, also for recordings whose metadata says Infinity.
async function durationOf(v) {
  if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
  await seek(v, 1e7);
  const d = v.currentTime;
  await seek(v, 0);
  return d || 0;
}

// `count` frames spread over the clip — always the first and the last — as one
// labelled grid image. Returns { image, duration, times, width, height }.
export async function contactSheet(src, count = 6) {
  const v = await loadVideo(src);
  const duration = await durationOf(v);
  const n = Math.max(2, Math.min(12, count));
  const last = Math.max(0, duration - 0.06);
  const times = Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (last * i) / (n - 1)));
  const ratio = v.videoWidth && v.videoHeight ? v.videoHeight / v.videoWidth : 9 / 16;
  const portrait = ratio > 1;
  const cw = portrait ? Math.round(SHEET_CELL_W * 0.62) : SHEET_CELL_W;
  const ch = Math.round(cw * ratio);
  const cols = portrait ? Math.min(n, 6) : Math.min(n, 3);
  const rows = Math.ceil(n / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = 'bold 15px sans-serif';
  for (let i = 0; i < n; i++) {
    await seek(v, times[i]);
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    g.drawImage(v, x, y, cw, ch);
    const label = `${i + 1}  ${times[i].toFixed(1)}s`;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(x, y, g.measureText(label).width + 12, 22);
    g.fillStyle = '#fff';
    g.fillText(label, x + 6, y + 16);
  }
  const width = v.videoWidth;
  const height = v.videoHeight;
  v.removeAttribute('src');
  v.load();
  return {
    image: canvas.toDataURL('image/jpeg', 0.8),
    duration: Math.round(duration * 100) / 100,
    times: times.map((t) => Math.round(t * 100) / 100),
    width,
    height,
  };
}

// One frame of a video (default: the last) as a still.
export async function videoFrame(src, at = 'last') {
  const v = await loadVideo(src);
  const duration = await durationOf(v);
  await seek(v, at === 'last' ? Math.max(0, duration - 0.06) : Math.max(0, Math.min(duration, Number(at) || 0)));
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / Math.max(v.videoWidth || 640, v.videoHeight || 360));
  canvas.width = Math.round((v.videoWidth || 640) * scale);
  canvas.height = Math.round((v.videoHeight || 360) * scale);
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
  v.removeAttribute('src');
  v.load();
  return canvas.toDataURL('image/jpeg', 0.8);
}

const rms = (data, from, to) => {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(data.length, Math.floor(to));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (b - a));
};

// Measurements of an audio clip or a video's sound track:
//   duration, loudness, how long the silence before the first and after the
//   last sound is, and whether the sound is still going when the file ends
//   (speech or music cut off mid-way).
export async function audioReport(src) {
  const buf = src ? await decodeMediaAudio(src) : null;
  if (!buf) return { present: false };
  const rate = buf.sampleRate;
  // mono mix
  const data = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) data[i] += ch[i] / buf.numberOfChannels;
  }
  const overall = rms(data, 0, data.length);
  const win = Math.round(rate * 0.02); // 20 ms windows
  const gate = Math.max(0.008, overall * 0.18);
  let first = -1;
  let last = -1;
  let loudWindows = 0;
  let loudSum = 0;
  for (let i = 0; i + win <= data.length; i += win) {
    const r = rms(data, i, i + win);
    if (r >= gate) {
      if (first < 0) first = i;
      last = i + win;
      loudWindows++;
      loudSum += r;
    }
  }
  const active = loudWindows ? loudSum / loudWindows : 0;
  const tail = rms(data, data.length - rate * 0.12, data.length);
  const head = rms(data, 0, rate * 0.08);
  const round = (x) => Math.round(x * 1000) / 1000;
  return {
    present: true,
    silent: first < 0,
    duration: round(buf.duration),
    loudness: round(overall),
    leadSilenceSec: first < 0 ? round(buf.duration) : round(first / rate),
    tailSilenceSec: last < 0 ? round(buf.duration) : round((data.length - last) / rate),
    // still at more than 45% of its working level in the last 120 ms
    endsAbruptly: first >= 0 && active > 0 && tail > active * 0.45,
    startsAbruptly: first >= 0 && active > 0 && head > active * 0.6,
  };
}
