// FFmpeg assembly engine (main process). Replaces the realtime canvas capture:
// builds one filter graph over all segments — per-clip trim windows, xfade
// transitions that borrow their material from the trimmed tail padding (so the
// timeline's total duration never shifts), audio crossfades, H.264/AAC mp4 out.
// Kept free of electron imports so it can be exercised under plain Node.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function ffmpegPath() {
  try {
    const p = require('ffmpeg-static');
    if (p) {
      const real = p.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(real)) return real;
    }
  } catch {
    /* fall through to PATH */
  }
  return 'ffmpeg';
}

function ffmpegVersion() {
  try {
    const out = spawnSync(ffmpegPath(), ['-version'], { encoding: 'utf8' });
    return out.status === 0 ? out.stdout.split('\n')[0] : null;
  } catch {
    return null;
  }
}

// Does this media file contain an audio stream? (parse `ffmpeg -i` banner)
function hasAudio(file) {
  try {
    const out = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
    return /Stream #.*Audio:/i.test(out.stderr || '');
  } catch {
    return false;
  }
}

const MIN_FADE = 0.04; // one frame @25fps — below this a boundary is a hard cut

// The active render process, so the renderer can cancel it.
let activeProc = null;
let canceled = false;
function cancelActive() {
  canceled = true;
  if (activeProc) {
    try {
      activeProc.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
  return true;
}

// job = {
//   width, height, fps,
//   segments: [{ kind:'video'|'image'|'black', file, trimStart, duration, tailSlack }],
//   transitions: [{ xfade:'cut'|<xfade name>, dur }],   // segments.length - 1
//   audioClips: [{ file, start, offset, duration, fadeIn, fadeOut, volume }],
//     — the audio timeline: each clip is delayed to `start`, trimmed to its
//       window inside the source, faded and leveled, then mixed over the
//       per-shot clip audio.
//   outPath,
// }
// Returns { args, totalSec } — the full ffmpeg argument list.
function buildArgs(job) {
  const { width: W, height: H, fps, segments, transitions, audioClips, outPath } = job;
  const args = ['-hide_banner', '-y'];
  const filters = [];
  const vIn = [];
  const aIn = [];
  let inputIdx = 0;

  // Effective fade duration for the boundary AFTER segment i: limited by the
  // outgoing clip's spare tail material (images/black loop freely).
  const fadeAfter = segments.map((seg, i) => {
    if (i >= segments.length - 1) return 0;
    const tr = transitions[i] || { xfade: 'cut' };
    if (tr.xfade === 'cut' || !tr.dur) return 0;
    const want = Math.max(0, tr.dur);
    if (seg.kind === 'video') {
      const avail = Math.max(0, seg.tailSlack || 0);
      return avail >= MIN_FADE ? Math.min(want, avail) : 0;
    }
    return want; // image/black can extend as long as needed
  });

  segments.forEach((seg, i) => {
    const extract = (seg.duration || 0) + fadeAfter[i];
    if (seg.kind === 'video') {
      args.push('-ss', String(seg.trimStart || 0), '-t', String(extract), '-i', seg.file);
      vIn.push(inputIdx);
      aIn.push(seg.audio ? inputIdx : -1);
      inputIdx++;
    } else if (seg.kind === 'image') {
      args.push('-loop', '1', '-t', String(extract), '-r', String(fps), '-i', seg.file);
      vIn.push(inputIdx);
      aIn.push(-1);
      inputIdx++;
    } else {
      args.push('-f', 'lavfi', '-t', String(extract), '-i', `color=c=black:s=${W}x${H}:r=${fps}`);
      vIn.push(inputIdx);
      aIn.push(-1);
      inputIdx++;
    }
    // silent audio bed for segments without sound
    if (aIn[i] === -1) {
      args.push('-f', 'lavfi', '-t', String(extract), '-i', 'anullsrc=r=48000:cl=stereo');
      aIn[i] = inputIdx;
      inputIdx++;
    }
    // Media can be SHORTER than its slot (sound+image dialogue clips follow
    // the voice audio's length): freeze the last frame and pad the audio with
    // silence to the exact extract length, then hard-trim. Without this a
    // short segment ends the video track early (players hold the previous
    // frame — the "last shot frozen on the previous shot" bug) and shifts all
    // later audio earlier.
    filters.push(
      `[${vIn[i]}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1,format=yuv420p,` +
        `tpad=stop_mode=clone:stop_duration=${extract.toFixed(3)},trim=duration=${extract.toFixed(3)},settb=AVTB[v${i}]`
    );
    filters.push(
      `[${aIn[i]}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB,` +
        `apad=whole_dur=${extract.toFixed(3)},atrim=0:${extract.toFixed(3)}[a${i}]`
    );
  });

  // Chain: xfade/acrossfade for smooth boundaries, concat for hard cuts.
  let vAcc = 'v0';
  let aAcc = 'a0';
  let accDur = (segments[0].duration || 0) + fadeAfter[0];
  for (let i = 0; i < segments.length - 1; i++) {
    const tr = transitions[i] || { xfade: 'cut' };
    const D = fadeAfter[i];
    const nextExtract = (segments[i + 1].duration || 0) + fadeAfter[i + 1];
    const vOut = `vx${i}`;
    const aOut = `ax${i}`;
    if (D >= MIN_FADE && tr.xfade !== 'cut') {
      const offset = Math.max(0, accDur - D);
      filters.push(`[${vAcc}][v${i + 1}]xfade=transition=${tr.xfade}:duration=${D.toFixed(3)}:offset=${offset.toFixed(3)}[${vOut}]`);
      filters.push(`[${aAcc}][a${i + 1}]acrossfade=d=${Math.max(0.03, D).toFixed(3)}[${aOut}]`);
      accDur = accDur - D + nextExtract;
    } else {
      filters.push(`[${vAcc}][v${i + 1}]concat=n=2:v=1:a=0[${vOut}]`);
      filters.push(`[${aAcc}][a${i + 1}]concat=n=2:v=0:a=1[${aOut}]`);
      accDur = accDur + nextExtract;
    }
    vAcc = vOut;
    aAcc = aOut;
  }

  // Audio timeline clips: each is trimmed to its source window, faded,
  // leveled, delayed to its film position, padded to the assembly length,
  // then everything mixes over the per-shot clip audio.
  const clips = (audioClips || []).filter((c) => c && c.file && (c.duration || 0) > 0.01);
  if (clips.length) {
    clips.forEach((c, k) => {
      args.push('-i', c.file);
      const idx = inputIdx++;
      const off = Math.max(0, c.offset || 0);
      const D = Math.max(0.02, c.duration);
      const fi = Math.max(0, Math.min(c.fadeIn || 0, D / 2));
      const fo = Math.max(0, Math.min(c.fadeOut || 0, D / 2));
      const vol = Number.isFinite(c.volume) ? c.volume : 1;
      const delayMs = Math.max(0, Math.round((c.start || 0) * 1000));
      let f = `[${idx}:a]atrim=start=${off.toFixed(3)}:end=${(off + D).toFixed(3)},asetpts=PTS-STARTPTS`;
      if (fi >= 0.01) f += `,afade=t=in:st=0:d=${fi.toFixed(3)}`;
      if (fo >= 0.01) f += `,afade=t=out:st=${(D - fo).toFixed(3)}:d=${fo.toFixed(3)}`;
      f += `,volume=${vol},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`;
      f += `,adelay=${delayMs}|${delayMs},apad=whole_dur=${accDur.toFixed(3)},atrim=0:${accDur.toFixed(3)}[tk${k}]`;
      filters.push(f);
    });
    filters.push(
      `[${aAcc}]${clips.map((_, k) => `[tk${k}]`).join('')}amix=inputs=${clips.length + 1}:duration=first:normalize=0[amix]`
    );
    aAcc = 'amix';
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', `[${vAcc}]`, '-map', `[${aAcc}]`);
  args.push('-r', String(fps), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p');
  args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  args.push('-progress', 'pipe:1', outPath);
  return { args, totalSec: accDur };
}

// Materialize data URLs into temp files, probe audio, run ffmpeg with progress.
async function renderJob(job, onProgress) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'storyreel-render-'));
  try {
    const segments = job.segments.map((seg, i) => {
      if (seg.kind === 'black') return { ...seg };
      const m = String(seg.dataURL || '').match(/^data:([^;]+);base64,(.*)$/s);
      if (!m) throw new Error(`Segment ${i + 1}: unreadable media data.`);
      const ext = m[1].includes('webm') ? 'webm' : m[1].includes('png') ? 'png' : m[1].includes('jpeg') || m[1].includes('jpg') ? 'jpg' : m[1].includes('mp4') ? 'mp4' : 'bin';
      const file = path.join(tmp, `seg_${i}.${ext}`);
      fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
      const out = { ...seg, file };
      delete out.dataURL;
      if (seg.kind === 'video') out.audio = hasAudio(file);
      return out;
    });

    const audioClips = (job.audioClips || [])
      .map((c, i) => {
        const m = String(c.dataURL || '').match(/^data:([^;]+);base64,(.*)$/s);
        if (!m) return null;
        const ext = m[1].includes('wav') ? 'wav' : m[1].includes('ogg') ? 'ogg' : m[1].includes('aac') || m[1].includes('mp4') || m[1].includes('m4a') ? 'm4a' : 'mp3';
        const file = path.join(tmp, `aclip_${i}.${ext}`);
        fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
        const out = { ...c, file };
        delete out.dataURL;
        return out;
      })
      .filter(Boolean);

    fs.mkdirSync(path.dirname(job.outPath), { recursive: true });
    const { args, totalSec } = buildArgs({ ...job, segments, audioClips });

    return await new Promise((resolve) => {
      canceled = false;
      const proc = spawn(ffmpegPath(), args, { windowsHide: true });
      activeProc = proc;
      let errTail = '';
      proc.stderr.on('data', (d) => {
        errTail = (errTail + d.toString()).slice(-4000);
      });
      proc.stdout.on('data', (d) => {
        const m = String(d).match(/out_time_us=(\d+)/g);
        if (m && onProgress) {
          const us = parseInt(m[m.length - 1].split('=')[1], 10);
          onProgress({ sec: us / 1e6, total: totalSec });
        }
      });
      proc.on('error', (e) => {
        activeProc = null;
        resolve({ ok: false, error: String(e.message || e) });
      });
      proc.on('close', (code) => {
        activeProc = null;
        if (canceled) resolve({ ok: false, canceled: true });
        else if (code === 0 && fs.existsSync(job.outPath)) resolve({ ok: true, path: job.outPath });
        else resolve({ ok: false, error: errTail.split('\n').slice(-8).join('\n') || `ffmpeg exited with ${code}` });
      });
    });
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
  }
}

module.exports = { ffmpegPath, ffmpegVersion, buildArgs, renderJob, cancelActive };
